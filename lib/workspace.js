/**
 * Workspace filesystem access for the commander plugin.
 *
 * All plugin writes go through the harness FileSystem service (`ctx.get('fs')`)
 * rather than `node:fs`, so the session's sandbox policy applies: a read-only
 * session cannot write the scoreboard, and a workspace-write session cannot
 * write outside its workspace. The plugin deliberately has no `dir` argument —
 * the root is always the session working directory.
 *
 * @module dsh-commander/workspace
 */
import path from 'node:path';

/**
 * Reject a configuration or file name that could escape the workspace.
 * @param value - candidate path segment string.
 * @param label - human label used in the error message.
 * @param options - `allowSegments: false` requires a single file name.
 * @returns normalized posix-joined relative path.
 */
export function assertSafeRelative(value, label, { allowSegments = true } = {}) {
	const text = String(value ?? '').trim();
	if (text === '') throw new Error(`dsh-commander: ${label} 不能为空`);
	if (text.startsWith('~')) {
		throw new Error(`dsh-commander: ${label} 不支持 ~ 展开，请写工作区相对路径（收到 ${text}）`);
	}
	if (path.isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) {
		throw new Error(`dsh-commander: ${label} 必须是工作区相对路径，不能是绝对路径（收到 ${text}）`);
	}
	const segments = text.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.');
	if (segments.length === 0) throw new Error(`dsh-commander: ${label} 解析后为空（收到 ${text}）`);
	if (segments.includes('..')) {
		throw new Error(`dsh-commander: ${label} 不能包含 ..（收到 ${text}），插件只写工作区内`);
	}
	if (!allowSegments && segments.length > 1) {
		throw new Error(`dsh-commander: ${label} 必须是文件名，不能带目录（收到 ${text}）`);
	}
	return segments.join('/');
}

/**
 * Normalize a harness display path to posix separators.
 *
 * The harness resolves `displayPath` with the platform separator, so on Windows a
 * report reads `.agent\\plans\\x.md` while every document, log line and instruction
 * in this repo writes `.agent/plans/x.md`. User-facing output must not change shape
 * with the host OS, so it goes through here instead of `target.displayPath` directly.
 *
 * @param text - display path from the filesystem service.
 * @returns the same path with `/` separators.
 */
export function posixDisplay(text) {
	return String(text ?? '').replaceAll('\\', '/');
}

/**
 * Read an optional service without assuming it is mounted.
 * @param ctx - plugin context.
 * @param service - service name.
 * @returns the service or undefined.
 */
function optionalService(ctx, service) {
	if (typeof ctx.get === 'function') return ctx.get(service);
	return ctx[service];
}

/**
 * The harness FileSystem service, or a clear error when this profile has none.
 * @param ctx - plugin context.
 * @returns the FileSystem service.
 */
export function fileSystemOf(ctx) {
	const fs = optionalService(ctx, 'fs');
	if (fs === undefined) {
		throw new Error('dsh-commander: 当前 profile 没有文件服务（fs），记分牌与台账无法读写');
	}
	return fs;
}

/**
 * Filesystem resolution options for the session's current directory, mirroring
 * how the built-in fs tools resolve relative paths.
 * @param ctx - plugin context.
 * @param exec - tool execution context.
 * @returns `{ cwd?, signal }`.
 */
export async function sessionOptions(ctx, exec) {
	const workingDirectory = optionalService(ctx, 'workingDirectory');
	const cwd =
		exec?.agent === undefined || workingDirectory === undefined
			? undefined
			: await workingDirectory.ensure(exec.agent, exec.signal);
	return cwd === undefined ? { signal: exec?.signal } : { cwd, signal: exec?.signal };
}

/**
 * Resolve a file inside the configured plans directory.
 * @param ctx - plugin context.
 * @param options - `{ plansDir, fileName, subdir? }`.
 * @param exec - tool execution context.
 * @returns `{ fs, target }`.
 */
export async function resolvePlansTarget(ctx, { plansDir, fileName, subdir }, exec) {
	const fs = fileSystemOf(ctx);
	const parts = [assertSafeRelative(plansDir, 'plansDir')];
	if (subdir !== undefined) parts.push(assertSafeRelative(subdir, 'subdir'));
	parts.push(assertSafeRelative(fileName, 'fileName', { allowSegments: false }));
	const relative = path.posix.join(...parts);
	const target = await fs.resolve(relative, await sessionOptions(ctx, exec));
	return { fs, target };
}

/**
 * Read a plans file, treating an absent file as undefined instead of an error.
 * @param fs - FileSystem service.
 * @param target - resolved target.
 * @param signal - cancellation signal.
 * @returns file text, or undefined when absent.
 */
export async function readPlansText(fs, target, signal) {
	const info = await fs.lstat(fs.processPath(target), undefined, signal);
	if (info === undefined) return undefined;
	return fs.readText(target, signal);
}

/**
 * Atomically write a plans file through the harness filesystem.
 * @param fs - FileSystem service.
 * @param target - resolved target.
 * @param text - full new content.
 * @param signal - cancellation signal.
 * @returns the display path that was written.
 */
export async function writePlansText(fs, target, text, signal) {
	await fs.writeText(target, text, undefined, signal);
	return posixDisplay(target.displayPath);
}

/**
 * Resolve the configured plans directory itself, for directory-level reads.
 * @param ctx - plugin context.
 * @param options - `{ plansDir }`.
 * @param exec - tool execution context.
 * @returns `{ fs, target }` for the directory.
 */
export async function resolvePlansDirectory(ctx, { plansDir }, exec) {
	const fs = fileSystemOf(ctx);
	const relative = assertSafeRelative(plansDir, 'plansDir');
	const target = await fs.resolve(relative, await sessionOptions(ctx, exec));
	return { fs, target };
}

/**
 * List the regular files inside the plans directory.
 *
 * An absent directory is empty, not an error: the first session against a fresh
 * workspace has nothing to aggregate yet. A backend without `listDir`, however,
 * is an error — reporting "no scoreboards" would be a silent lie.
 *
 * @param fs - FileSystem service.
 * @param target - resolved directory target.
 * @param signal - cancellation signal.
 * @returns file basenames.
 */
export async function listPlansFiles(fs, target, signal) {
	if (typeof fs.listDir !== 'function') {
		throw new Error('dsh-commander: 当前 profile 的文件服务没有 listDir，无法聚合历史记分牌');
	}
	const info = await fs.lstat(fs.processPath(target), undefined, signal);
	if (info === undefined) return [];
	const entries = await fs.listDir(target, signal);
	return entries.filter((entry) => entry.type === 'file').map((entry) => entry.name);
}
