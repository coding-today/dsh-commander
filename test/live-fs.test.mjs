/**
 * Live check against the harness' real FileSystem service.
 *
 * The other tests run against a hand-written fs stub, which proves logic but not
 * the service contract: whether `lstat` really returns `undefined` for an absent
 * path, whether `listDir` really throws `FS_NOT_FOUND`, and whether the entries
 * really carry `type: 'file'`. Those are the assumptions `evolve` depends on, so
 * this test drives the actual `@deepseek-ai/dsh-fs-local` implementation loaded
 * from the local DSH install.
 *
 * It skips (rather than fails) when DSH is not installed, so `npm test` stays
 * runnable on a bare checkout or CI.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dshHome = process.env.DSH_HOME ?? path.join(homedir(), '.dsh');
const modules = path.join(dshHome, 'profiles', 'node_modules', '@deepseek-ai');
const cordisPath = path.join(modules, 'cordis', 'lib', 'index.js');
const fsLocalPath = path.join(modules, 'dsh-fs-local', 'lib', 'index.js');
const available = existsSync(cordisPath) && existsSync(fsLocalPath);
const skip = available ? false : 'local DSH install not found (set DSH_HOME)';

/** Build the same context shape the plugin receives inside the harness. */
function makeApp(fs) {
	const tools = new Map();
	return {
		tools,
		app: {
			get: (name) => (name === 'fs' ? fs : undefined),
			tools: { register: (tool) => tools.set(tool.name, tool) },
			effect: (fn) => fn(),
			on: () => {},
			inject: () => {},
			provide: () => {},
			command: () => {},
			logger: { debug() {}, info() {}, warn() {}, error() {} }
		}
	};
}

test('evolve works against the real dsh FileSystem service', { skip }, async () => {
	const { Context } = await import(cordisPath);
	const { LocalFileSystem } = await import(fsLocalPath);
	const { apply } = await import('../lib/index.js');

	const root = mkdtempSync(path.join(tmpdir(), 'cmdr-live-'));
	try {
		const fs = new LocalFileSystem(new Context(), { cwd: root, diffBasisMaxBytes: 1048576 });
		const { app, tools } = makeApp(fs);
		apply(app, { plansDir: '.agent/plans' });

		const exec = { signal: undefined, agent: undefined };
		const scoreboard = tools.get('commander_scoreboard');
		await scoreboard.execute({ action: 'init', task: '退款 状态机', experts: ['backend'] }, exec);
		await scoreboard.execute(
			{
				action: 'adjust',
				task: '退款 状态机',
				adjustments: [
					{ expert: 'backend', delta: -20, reason: '验收条件缺失' },
					// 指挥官自己也记分：链路里 captain 行必须真实可写、可聚合。
					{ expert: '指挥官', delta: -10, reason: '派了无法机械判定的验收' }
				]
			},
			exec
		);

		// The real service throws FS_NOT_FOUND for an absent directory, so evolve
		// must survive a workspace where `plans/` was never created.
		const fresh = await scoreboard.execute({ action: 'evolve' }, exec);
		assert.match(fresh.text, /聚合 1 张记分牌/);

		const card = path.join(root, '.agent', 'plans', 'expert-evolution.md');
		const text = readFileSync(card, 'utf8');
		assert.match(text, /## backend —— 80 分（加严验收）/);
		assert.match(text, /验收条件缺失/);
		assert.match(text, /^## captain，指挥官 —— 90 分（正常派发）$/m);
		assert.match(text, /派了无法机械判定的验收/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('evolve writes an empty card on a workspace without any plans directory', { skip }, async () => {
	const { Context } = await import(cordisPath);
	const { LocalFileSystem } = await import(fsLocalPath);
	const { apply } = await import('../lib/index.js');

	const root = mkdtempSync(path.join(tmpdir(), 'cmdr-live-empty-'));
	try {
		const fs = new LocalFileSystem(new Context(), { cwd: root, diffBasisMaxBytes: 1048576 });
		const { app, tools } = makeApp(fs);
		apply(app, { plansDir: '.agent/plans' });
		const result = await tools
			.get('commander_scoreboard')
			.execute({ action: 'evolve' }, { signal: undefined, agent: undefined });
		assert.match(result.text, /聚合 0 张记分牌/);
		assert.match(result.text, /还没有任何历史/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
