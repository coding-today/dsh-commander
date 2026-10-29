import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST_PACKAGES = ['@deepseek-ai/dsh-tools', '@deepseek-ai/schemastery'];
const HOST_SCOPE = '@deepseek-ai/';

/**
 * 主机提供的 `@deepseek-ai/*` 包只能出现在 peerDependencies。
 *
 * 原因（issue #1）：pnpm 在 profile 里是 `nodeLinker: hoisted`，若本包把
 * `@deepseek-ai/dsh-tools` 写进 dependencies，profile 会装出一份实体副本；
 * `tools` 服务由宿主自己的那份提供（`dsh-base` 的 `- id: tools`），副本一旦
 * 比宿主「更近」就会被解析到，宿主版本不匹配时该服务直接不注册，启动报
 * `1 required plugin did not activate`，所有面板空白。
 */
const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

const readManifest = () => readJson('package.json');

const collectImports = (dir) => {
	const found = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const target = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			for (const specifier of collectImports(target)) found.add(specifier);
			continue;
		}
		if (!entry.name.endsWith('.js')) continue;
		const source = readFileSync(target, 'utf8');
		for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
			if (match[1].startsWith(HOST_SCOPE)) found.add(match[1]);
		}
		for (const match of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
			if (match[1].startsWith(HOST_SCOPE)) found.add(match[1]);
		}
	}
	return found;
};

test('host packages are peers, never dependencies', () => {
	const manifest = readManifest();
	const dependencies = manifest.dependencies ?? {};
	const optional = manifest.optionalDependencies ?? {};
	for (const name of Object.keys(dependencies)) {
		assert.ok(
			!name.startsWith(HOST_SCOPE),
			`dependencies 里不许出现宿主包 ${name}（会导致 profile 装上副本并顶掉宿主）`
		);
	}
	for (const name of Object.keys(optional)) {
		assert.ok(!name.startsWith(HOST_SCOPE), `optionalDependencies 里不许出现宿主包 ${name}`);
	}
	for (const name of HOST_PACKAGES) {
		assert.ok(manifest.peerDependencies?.[name], `${name} 必须在 peerDependencies 里（跟随宿主版本）`);
		assert.ok(manifest.devDependencies?.[name], `${name} 必须同时在 devDependencies 里（本地测试要用）`);
	}
});

test('peer ranges follow the host instead of pinning an exact build', () => {
	const peers = readManifest().peerDependencies ?? {};
	for (const [name, range] of Object.entries(peers)) {
		if (!name.startsWith(HOST_SCOPE)) continue;
		assert.ok(
			/^[\^~]|>=\s*\d/.test(range) || range.includes('||'),
			`${name} 的 peer 范围必须跟随宿主（^ / ~ / >= / ||），当前是 ${range}（精确锁版本会让宿主升级后立刻不兼容）`
		);
		assert.ok(!/^\d/.test(range), `${name} 不许精确锁版本：${range}`);
	}
});

test('every host package imported by lib is declared as a peer', () => {
	const manifest = readManifest();
	const peers = Object.keys(manifest.peerDependencies ?? {});
	const imported = collectImports(path.join(ROOT, 'lib'));
	assert.ok(imported.size > 0, 'lib 里应当能扫到 @deepseek-ai/* 的 import，否则这个守卫形同虚设');
	for (const specifier of imported) {
		assert.ok(
			peers.includes(specifier),
			`lib 里 import 了 ${specifier}，但它不在 peerDependencies 里（安装时会被漏掉）`
		);
	}
});

test('client inject entries are also declared as peers', () => {
	const manifest = readManifest();
	const inject = manifest.dsh?.client?.inject ?? [];
	assert.ok(inject.length > 0);
	const peers = Object.keys(manifest.peerDependencies ?? {});
	for (const specifier of inject) {
		if (!specifier.startsWith(HOST_SCOPE)) continue;
		assert.ok(peers.includes(specifier), `dsh.client.inject 里的 ${specifier} 也要写进 peerDependencies`);
	}
});

test('engines keep the host range open', () => {
	const engines = readManifest().engines ?? {};
	assert.equal(engines.node, '>=22.19.0');
	assert.ok(/^>=\s*\d/.test(engines.dsh ?? ''), `engines.dsh 必须是范围，当前是 ${engines.dsh}`);
});
