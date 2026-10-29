import assert from 'node:assert/strict';
import test from 'node:test';
import {
	aggregateExperts,
	bandFor,
	CAPTAIN,
	CREDIT_LIMIT,
	EVOLUTION_BANDS,
	EVOLUTION_FILE,
	formatDirectives,
	formatEvolution,
	isCaptain,
	normalizeName,
	PENALTY_LIMIT
} from '../lib/scoreboard.js';

/** One parsed scoreboard with the given experts. */
function board(task, createdAt, experts) {
	return { task, createdAt, experts };
}

/** One expert row as `parseScoreboard` would produce it. */
function expert(name, score, log = [], role = '') {
	return { name, role, score, log };
}

test('bandFor maps each score to a dispatch band', () => {
	assert.equal(bandFor(100).label, '正常派发');
	assert.equal(bandFor(90).label, '正常派发');
	assert.equal(bandFor(89).label, '加严验收');
	assert.equal(bandFor(70).label, '加严验收');
	assert.equal(bandFor(69).label, '加严 + 二次复核');
	assert.equal(bandFor(50).label, '加严 + 二次复核');
	assert.equal(bandFor(49).label, '降级使用');
	assert.equal(bandFor(0).label, '降级使用');
	assert.equal(bandFor(-40).label, '降级使用');
	assert.equal(EVOLUTION_BANDS.length, 4);
});

test('bandFor honours a custom band table', () => {
	const bands = [{ min: 0, label: '只有一档', note: 'x' }];
	assert.equal(bandFor(12, bands).label, '只有一档');
});

test('aggregateExperts takes the latest score instead of summing tasks', () => {
	const experts = aggregateExperts([
		board('旧任务', '2026-01-01T00:00:00.000Z', [expert('backend', 60)]),
		board('新任务', '2026-02-01T00:00:00.000Z', [expert('backend', 80)])
	]);
	assert.equal(experts.length, 1);
	// 60 + 80 = 140 would be nonsense: the score is a level, not a balance.
	assert.equal(experts[0].latestScore, 80);
	assert.equal(experts[0].latestTask, '新任务');
	assert.equal(experts[0].participations, 2);
	assert.equal(experts[0].band.label, '加严验收');
});

test('aggregateExperts keeps every role and sorts weakest first', () => {
	const experts = aggregateExperts([
		board('a', '2026-01-01T00:00:00.000Z', [expert('backend', 95, [], '实现'), expert('reviewer', 40, [], '审查')]),
		board('b', '2026-01-02T00:00:00.000Z', [expert('backend', 95, [], '验收')])
	]);
	assert.deepEqual(
		experts.map((entry) => entry.name),
		['reviewer', 'backend']
	);
	const backend = experts.find((entry) => entry.name === 'backend');
	assert.deepEqual(backend.roles, ['实现', '验收']);
});

test('aggregateExperts collapses a repeated reason and flags recidivism', () => {
	const experts = aggregateExperts([
		board('任务一', '2026-01-01T00:00:00.000Z', [
			expert('backend', 80, [{ at: '2026-01-01T00:00:00.000Z', delta: -20, reason: '验收条件缺失' }])
		]),
		board('任务二', '2026-01-02T00:00:00.000Z', [
			expert('backend', 60, [{ at: '2026-01-02T00:00:00.000Z', delta: -20, reason: '验收条件缺失' }])
		])
	]);
	const [backend] = experts;
	assert.equal(backend.penalties.length, 1, 'same reason collapses to one row');
	assert.equal(backend.penalties[0].count, 2);
	assert.equal(backend.penalties[0].task, '任务二', 'newest occurrence wins');
	assert.equal(backend.recidivism, 1);
});

test('aggregateExperts caps penalties and credits', () => {
	const penalties = Array.from({ length: PENALTY_LIMIT + 3 }, (_, index) => ({
		at: `2026-01-0${index + 1}T00:00:00.000Z`,
		delta: -5,
		reason: `失分 ${index}`
	}));
	const credits = Array.from({ length: CREDIT_LIMIT + 2 }, (_, index) => ({
		at: `2026-02-0${index + 1}T00:00:00.000Z`,
		delta: 5,
		reason: `加分 ${index}`
	}));
	const [entry] = aggregateExperts([
		board('长任务', '2026-03-01T00:00:00.000Z', [expert('backend', 70, [...penalties, ...credits])])
	]);
	assert.equal(entry.penalties.length, PENALTY_LIMIT);
	assert.equal(entry.credits.length, CREDIT_LIMIT);
	// Newest first, so the cap keeps the recent lessons.
	assert.equal(entry.penalties[0].reason, `失分 ${PENALTY_LIMIT + 2}`);
});

test('aggregateExperts ignores nameless experts and unknown boards', () => {
	const experts = aggregateExperts([undefined, { task: 'x', createdAt: '', experts: [{ name: '  ', score: 10 }] }]);
	assert.deepEqual(experts, []);
	assert.deepEqual(aggregateExperts(undefined), []);
});

test('formatEvolution explains an empty history instead of printing nothing', () => {
	const text = formatEvolution([], { at: new Date('2026-01-01T00:00:00.000Z'), plansDir: '.agent/plans' });
	assert.match(text, /还没有任何历史/);
	assert.match(text, /2026-01-01T00:00:00\.000Z/);
});

test('formatEvolution renders score, band, penalties and credits', () => {
	const experts = aggregateExperts([
		board('退款 状态机', '2026-01-01T00:00:00.000Z', [
			expert(
				'backend',
				40,
				[
					{ at: '2026-01-01T00:00:00.000Z', delta: -30, reason: '没跑测试就报完成' },
					{ at: '2026-01-01T00:05:00.000Z', delta: 5, reason: '主动给了回滚命令' }
				],
				'实现'
			)
		])
	]);
	const text = formatEvolution(experts, { at: new Date('2026-01-02T00:00:00.000Z'), plansDir: '.agent/plans' });
	assert.match(text, /## backend，实现 —— 40 分（降级使用）/);
	assert.match(text, /来源：`.agent\/plans\/`\*-expert-scoreboard\.md/);
	assert.match(text, /\[-30\] 没跑测试就报完成（2026-01-01T00:00:00\.000Z @ 退款 状态机）/);
	assert.match(text, /\[\+5\] 主动给了回滚命令/);
	assert.match(text, /只派 research \/ doc 类低风险任务/);
});

test('EVOLUTION_FILE never collides with a scoreboard suffix', () => {
	assert.equal(EVOLUTION_FILE, 'expert-evolution.md');
	assert.ok(!EVOLUTION_FILE.endsWith('-expert-scoreboard.md'));
});

test('aggregateExperts breaks same-instant ties deterministically', () => {
	const stamp = '2026-01-01T00:00:00.000Z';
	const forward = aggregateExperts([
		board('任务A', stamp, [expert('backend', 90)]),
		board('任务B', stamp, [expert('backend', 60)])
	]);
	const reversed = aggregateExperts([
		board('任务B', stamp, [expert('backend', 60)]),
		board('任务A', stamp, [expert('backend', 90)])
	]);
	// Directory listing order must never decide the dispatch band.
	assert.equal(forward[0].latestTask, reversed[0].latestTask);
	assert.equal(forward[0].latestScore, reversed[0].latestScore);
	assert.equal(forward[0].band.label, reversed[0].band.label);
});

// ── the commander half ──────────────────────────────────────────────────────
// A board that only scores experts lets the person writing the task books repeat
// their own mistakes forever. These cases pin the commander's own row.

test('isCaptain accepts every alias and normalizeName collapses them', () => {
	assert.equal(isCaptain('captain'), true);
	assert.equal(isCaptain('指挥官'), true);
	assert.equal(isCaptain('commander'), true);
	assert.equal(isCaptain(' backend '), false);
	assert.equal(normalizeName(' 指挥官 '), CAPTAIN);
	assert.equal(normalizeName('backend'), 'backend');
});

test('aggregateExperts keeps the commander as an ordinary aggregated row', () => {
	const entries = aggregateExperts([
		board('退款 状态机', '2026-01-01T00:00:00.000Z', [
			expert(
				CAPTAIN,
				92,
				[{ at: '2026-01-01T00:00:00.000Z', delta: -8, reason: '派了无法机械判定的验收' }],
				'指挥官'
			),
			expert('backend', 70, [])
		])
	]);
	const captain = entries.find((entry) => entry.name === CAPTAIN);
	assert.equal(captain.latestScore, 92);
	assert.equal(captain.band.label, '正常派发');
	assert.equal(captain.penalties[0].reason, '派了无法机械判定的验收');
	assert.equal(entries.length, 2);
});

test('formatEvolution gives the commander its own section, not an expert section', () => {
	const entries = aggregateExperts([
		board('退款 状态机', '2026-01-01T00:00:00.000Z', [
			expert(CAPTAIN, 64, [
				{ at: '2026-01-01T00:00:00.000Z', delta: -20, reason: '漏了上下游依赖' },
				{ at: '2026-01-01T00:10:00.000Z', delta: -16, reason: '把线索当结论发布' }
			]),
			expert('backend', 80, [{ at: '2026-01-01T00:00:00.000Z', delta: -20, reason: '验收条件缺失' }])
		])
	]);
	const text = formatEvolution(entries, { plansDir: '.agent/plans' });
	assert.match(text, /^# 指挥官 \+ 专家进化卡$/m);
	assert.match(text, new RegExp(`^## ${CAPTAIN}，指挥官 —— 64 分（加严 \\+ 二次复核）$`, 'm'));
	assert.match(text, /自身失误（每份新任务书开头「我不要重复」一节原样抄）：/);
	assert.match(text, /\[-20\] 漏了上下游依赖/);
	assert.match(text, /\[-16\] 把线索当结论发布/);
	// the commander's failures are for the commander, not written into a expert task book
	assert.match(text, /^## backend —— 80 分（加严验收）$/m);
	assert.doesNotMatch(text, /^## backend.*自身失误/m);
});

test('the 30-second brief names the commander mistake and every strict expert', () => {
	const entries = aggregateExperts([
		board('x', '2026-01-01T00:00:00.000Z', [
			expert(CAPTAIN, 55, [{ at: '2026-01-01T00:00:00.000Z', delta: -45, reason: '写者撞车' }]),
			expert('reviewer', 40, [
				{ at: '2026-01-01T00:00:00.000Z', delta: -60, reason: '不跑就给通过' },
				{ at: '2026-01-01T00:05:00.000Z', delta: -60, reason: '不跑就给通过' }
			])
		])
	]);
	const text = formatEvolution(entries, {});
	assert.match(text, /## 下轮必读（派发前 30 秒）/);
	assert.match(text, /指挥官 55 分（加严 \+ 二次复核）：最近一次自身失误是「写者撞车」/);
	assert.match(text, /\*\*reviewer\*\*（40 分·降级使用）：不跑就给通过（已复发 2 次）/);
});

test('a repeated commander mistake is promoted to a hard gate', () => {
	const stamp = '2026-01-01T00:00:00.000Z';
	const entries = aggregateExperts([
		board('A', stamp, [expert(CAPTAIN, 80, [{ at: stamp, delta: -20, reason: '漏了 dependsOn' }])]),
		board('B', '2026-01-02T00:00:00.000Z', [
			expert(CAPTAIN, 70, [{ at: '2026-01-02T00:00:00.000Z', delta: -30, reason: '漏了 dependsOn' }])
		])
	]);
	const text = formatEvolution(entries, {});
	assert.match(text, /复发 2 次，升级为硬闸门：派发前必跑 commander_dispatch_check/);
	assert.match(text, /同一个派发错误又犯了/);
});

test('formatDirectives lists the commander and each expert with its must-write reason', () => {
	const entries = aggregateExperts([
		board('x', '2026-01-01T00:00:00.000Z', [
			expert(CAPTAIN, 92, [{ at: '2026-01-01T00:00:00.000Z', delta: -8, reason: '验收不可机械判定' }]),
			expert('backend', 60, [
				{ at: '2026-01-01T00:00:00.000Z', delta: -40, reason: '没复跑就说全绿' },
				{ at: '2026-01-01T00:01:00.000Z', delta: -1, reason: '没写回滚命令' }
			]),
			expert('reviewer', 100, [])
		])
	]);
	const captain = entries.find((entry) => entry.name === CAPTAIN);
	const crew = entries.filter((entry) => entry.name !== CAPTAIN);
	const lines = formatDirectives(captain, crew).join('\n');
	assert.match(lines, /## 下一轮派发指令（写进任务书，不是看过就算）/);
	assert.match(lines, /\| 角色 \| 档位 \| 必写进任务书 \|/);
	// reasons are newest-first, so the table reads in the order they will matter
	assert.match(lines, /\| backend \| 加严 \+ 二次复核 \| 没写回滚命令；没复跑就说全绿 \|/);
	assert.match(lines, /\| reviewer \| 正常派发 \| 无（按 brief 原样派） \|/);
	assert.match(lines, /\| captain（自己） \| 正常派发 \| 验收不可机械判定 \|/);
});

test('formatDirectives is empty when there is no roster at all', () => {
	assert.deepEqual(formatDirectives(undefined, []), []);
});

test('a captain-only history still renders a usable card', () => {
	const entries = aggregateExperts([
		board('只有指挥官', '2026-01-01T00:00:00.000Z', [
			expert(CAPTAIN, 85, [{ at: '2026-01-01T00:00:00.000Z', delta: -15, reason: '并发派超了上限' }])
		])
	]);
	const text = formatEvolution(entries, {});
	assert.match(text, /^## captain，指挥官 —— 85 分（加严验收）$/m);
	assert.match(text, /还没有专家历史：本轮 init 时把名册填全/);
	assert.match(text, /\| captain（自己） \| 加严验收 \| 并发派超了上限 \|/);
});
