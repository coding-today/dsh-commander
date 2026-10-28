import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as plugin from '../lib/index.js';

/**
 * A stand-in for the harness FileSystem service, backed by the real disk under a
 * temp root. It mirrors the parts the plugin uses: `resolve` (cwd-relative),
 * `processPath`, `lstat`, `readText`, `writeText`.
 */
function makeFs(root) {
	return {
		async resolve(target, opts = {}) {
			const absolute = path.resolve(opts.cwd ?? root, target);
			return { targetKey: absolute, displayPath: path.relative(root, absolute) };
		},
		processPath: (target) => target.targetKey,
		async lstat(target) {
			return existsSync(target) ? { type: 'file' } : undefined;
		},
		async readText(target) {
			return readFileSync(target.targetKey, 'utf8');
		},
		async writeText(target, content) {
			const existed = existsSync(target.targetKey);
			mkdirSync(path.dirname(target.targetKey), { recursive: true });
			writeFileSync(target.targetKey, content, 'utf8');
			return { operation: existed ? 'update' : 'create', version: 'v1', before: null, after: content };
		}
	};
}

/** Minimal Cordis context stub that records every contribution. */
function makeCtx(root) {
	const tools = new Map();
	let skill;
	let section;
	const fs = makeFs(root);
	const ctx = {
		logger: () => ({ info() {}, warn() {} }),
		get(service) {
			if (service === 'skills') return { register: (definition) => ((skill = definition), () => {}) };
			if (service === 'systemPrompt') return { section: (value) => ((section = value), () => {}) };
			if (service === 'fs') return fs;
			// Mirrors the real service: it resolves the agent's workspace directory.
			if (service === 'workingDirectory') return { ensure: async () => root };
			return undefined;
		},
		effect(factory) {
			return factory();
		},
		tools: {
			register(tool) {
				tools.set(tool.name, tool);
				return () => tools.delete(tool.name);
			}
		}
	};
	return { ctx, tools, getSkill: () => skill, getSection: () => section };
}

/** Tool execution context, shaped like the host's (cwd lives on session.header). */
function makeExec(root) {
	return { agent: { session: { header: { cwd: root } } }, signal: undefined };
}

function withRoot() {
	const root = mkdtempSync(path.join(tmpdir(), 'commander-test-'));
	return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('plugin exports the cordis contract', () => {
	assert.equal(plugin.name, 'dsh-commander');
	assert.deepEqual(plugin.inject, ['tools']);
	assert.equal(typeof plugin.apply, 'function');
	assert.ok(plugin.Config !== undefined);
});

test('apply registers the skill, the charter section and four tools', () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools, getSkill, getSection } = makeCtx(root);
		plugin.apply(ctx, {});
		const skill = getSkill();
		assert.equal(skill.name, 'commander');
		assert.equal(skill.source, 'runtime');
		assert.match(skill.content, /指挥官（Commander）/);
		assert.match(skill.content, /commander_dispatch_check/);
		const section = getSection();
		assert.equal(section.name, 'dsh-commander-charter');
		assert.equal(section.order, 118);
		assert.equal(section.interpolate, false, 'charter must not be template-interpolated');
		assert.match(section.text, /派发闸门/);
		assert.deepEqual([...tools.keys()].sort(), [
			'commander_dispatch_check',
			'commander_expert',
			'commander_ledger',
			'commander_scoreboard'
		]);
	} finally {
		cleanup();
	}
});

test('every surface can be turned off', () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools, getSkill, getSection } = makeCtx(root);
		plugin.apply(ctx, { registerSkill: false, promptSection: false, tools: false });
		assert.equal(getSkill(), undefined);
		assert.equal(getSection(), undefined);
		assert.equal(tools.size, 0);
	} finally {
		cleanup();
	}
});

test('charter states the configured concurrency ceiling and plans directory', () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, getSection } = makeCtx(root);
		plugin.apply(ctx, { maxConcurrency: 3, plansDir: 'notes/plans' });
		const text = getSection().text;
		assert.match(text, /上限 3/);
		assert.match(text, /notes\/plans\//);
		assert.doesNotMatch(text, /\.agent\/plans/);
	} finally {
		cleanup();
	}
});

test('dispatch tool blocks an incomplete batch', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const value = await tools
			.get('commander_dispatch_check')
			.execute({ tasks: [{ subject: 'x', assignee: 'a' }] }, makeExec(root));
		assert.match(value.text, /未通过/);
		assert.match(value.text, /D2_no_acceptance/);
	} finally {
		cleanup();
	}
});

test('dispatch tool honours a custom maxConcurrency default', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, { maxConcurrency: 2 });
		const tasks = [1, 2].map((index) => ({ subject: `t${index}`, assignee: `e${index}`, acceptance: 'ok' }));
		const value = await tools.get('commander_dispatch_check').execute({ tasks, running: 1 }, makeExec(root));
		assert.match(value.text, /D5_over_concurrency/);
	} finally {
		cleanup();
	}
});

test('dispatch tool catches a same-assignee self-review but not a cross-expert one', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const gate = tools.get('commander_dispatch_check');
		const base = { subject: '实现', assignee: 'fe', acceptance: 'pytest 全绿', files: ['src/a.ts'] };

		// 同一位专家既实现又审查，且 dependsOn 自指 -> 必须报 D4
		const selfReview = await gate.execute(
			{
				tasks: [
					base,
					{
						subject: '审查',
						assignee: 'fe',
						role: 'review',
						acceptance: '逐条意见',
						dependsOn: [1],
						files: ['src/a.ts']
					}
				]
			},
			makeExec(root)
		);
		assert.match(selfReview.text, /D4_self_review/, '同人自审必须被拦下');

		// 换成另一位专家审查同一条上游 -> 不该报 D4
		const crossReview = await gate.execute(
			{
				tasks: [
					base,
					{
						subject: '审查',
						assignee: 'rev',
						role: 'review',
						acceptance: '逐条意见',
						dependsOn: [1],
						files: ['src/a.ts']
					}
				]
			},
			makeExec(root)
		);
		assert.doesNotMatch(crossReview.text, /D4_self_review/, '换人审查不应误判');
	} finally {
		cleanup();
	}
});

test('dispatch gate rejects an expert outside the roster', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const value = await tools
			.get('commander_dispatch_check')
			.execute(
				{ tasks: [{ subject: 'x', assignee: 'a', expert: 'ghost-expert', acceptance: 'ok' }] },
				makeExec(root)
			);
		assert.match(value.text, /D6_unknown_expert/);
	} finally {
		cleanup();
	}
});

test('scoreboard tool writes, adjusts and reads through the filesystem service', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const exec = makeExec(root);
		const tool = tools.get('commander_scoreboard');
		const init = await tool.execute(
			{ action: 'init', task: '退款 状态机', experts: ['backend', { name: 'reviewer', role: '审查' }] },
			exec
		);
		const file = path.join(root, '.agent', 'plans', '退款-状态机-expert-scoreboard.md');
		assert.ok(existsSync(file), 'scoreboard file should exist');
		assert.match(init.text, /已创建记分牌/);
		assert.match(init.text, /\.agent\/plans\/退款-状态机-expert-scoreboard\.md/);

		await tool.execute(
			{
				action: 'adjust',
				task: '退款 状态机',
				adjustments: [{ expert: 'backend', delta: -25, reason: '宣称全绿但 2 条红' }]
			},
			exec
		);
		assert.match(readFileSync(file, 'utf8'), /宣称全绿但 2 条红/);

		const shown = await tool.execute({ action: 'show', task: '退款 状态机' }, exec);
		assert.match(shown.text, /\| backend \|.*\| 75 \|/);

		await assert.rejects(
			() => tool.execute({ action: 'init', task: '退款 状态机', experts: ['backend'] }, exec),
			/记分牌已存在/
		);
	} finally {
		cleanup();
	}
});

test("scoreboard refuses to operate on another task's file", async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const exec = makeExec(root);
		const tool = tools.get('commander_scoreboard');
		await tool.execute({ action: 'init', task: '退款 状态机', experts: ['backend'] }, exec);
		// Same slug → same file, different title: the parser must notice the mismatch
		// instead of silently adjusting another task's scoreboard.
		await assert.rejects(
			() =>
				tool.execute(
					{
						action: 'adjust',
						task: '退款-状态机',
						adjustments: [{ expert: 'backend', delta: -20, reason: 'x' }]
					},
					exec
				),
			/不是同一任务|记分牌/
		);
	} finally {
		cleanup();
	}
});

test('ledger tool keeps the newest entry on top', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const exec = makeExec(root);
		const tool = tools.get('commander_ledger');
		await tool.execute({ kind: 'failure', title: '第一条', body: '现象 A' }, exec);
		await tool.execute({ kind: 'success', title: '第二条', body: '做法 B' }, exec);
		const text = readFileSync(path.join(root, '.agent', 'plans', 'commander-ledger.md'), 'utf8');
		assert.ok(text.indexOf('第二条') < text.indexOf('第一条'), 'newest entry must be first');
		assert.match(text, /❌ \*\*第一条\*\*/);
		assert.match(text, /✅ \*\*第二条\*\*/);
	} finally {
		cleanup();
	}
});

test('expert tool lists, filters and briefs from the shipped roster', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		const exec = makeExec(root);
		const tool = tools.get('commander_expert');

		const all = await tool.execute({ action: 'list' }, exec);
		assert.match(all.text, /专家名册（19 位）/);
		assert.match(all.text, /action=brief/);
		assert.match(all.text, /`fullstack-arch`/);

		const security = await tool.execute({ action: 'list', division: 'security' }, exec);
		assert.match(security.text, /sec-auditor/);
		assert.doesNotMatch(security.text, /qa-engineer/);

		const brief = await tool.execute({ action: 'brief', expert: 'i18n-ko-reviewer' }, exec);
		for (const heading of ['何时召唤', '派发时必须给到', '必须交回', '验收判据', '禁止动作', '扣分项', '交接']) {
			assert.match(brief.text, new RegExp(heading), `brief should carry ${heading}`);
		}

		await assert.rejects(() => tool.execute({ action: 'brief', expert: 'nobody' }, exec), /名册里没有/);
		// An ambiguous fragment must not silently resolve to the first match.
		await assert.rejects(() => tool.execute({ action: 'brief', expert: 'expert' }, exec), /多位专家/);

		const divisions = await tool.execute({ action: 'divisions' }, exec);
		assert.match(divisions.text, /localization/);
	} finally {
		cleanup();
	}
});

test('tool arguments are validated before execution', async () => {
	const { root, cleanup } = withRoot();
	try {
		const { ctx, tools } = makeCtx(root);
		plugin.apply(ctx, {});
		await assert.rejects(
			() => tools.get('commander_scoreboard').execute({ action: 'nope', task: 'x' }, makeExec(root)),
			/invalid arguments/
		);
	} finally {
		cleanup();
	}
});
