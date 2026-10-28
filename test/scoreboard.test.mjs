import assert from 'node:assert/strict';
import test from 'node:test';
import {
	START_SCORE,
	applyAdjustments,
	assertDelta,
	assertSameTask,
	createScoreboard,
	formatScoreboard,
	parseScoreboard,
	scoreboardFileName,
	slugifyTask
} from '../lib/scoreboard.js';

test('new experts start at 100', () => {
	const board = createScoreboard({ task: '退款状态机', experts: ['backend', { name: 'reviewer', role: '审查' }] });
	assert.equal(board.experts.length, 2);
	assert.deepEqual(
		board.experts.map((expert) => expert.score),
		[START_SCORE, START_SCORE]
	);
	assert.equal(board.experts[1].role, '审查');
});

test('a scoreboard without experts is rejected', () => {
	assert.throws(() => createScoreboard({ task: 'x', experts: [] }), /至少要有一名专家/);
});

test('duplicate expert names are rejected', () => {
	assert.throws(() => createScoreboard({ task: 'x', experts: ['a', 'a'] }), /专家重名/);
});

test('adjustments need a reason and a non-zero integer delta', () => {
	const board = createScoreboard({ task: 'x', experts: ['backend'] });
	assert.throws(() => applyAdjustments(board, [{ expert: 'backend', delta: -20 }]), /必须写理由/);
	assert.throws(() => applyAdjustments(board, [{ expert: 'backend', delta: 0, reason: 'r' }]), /不能为 0/);
	assert.throws(() => applyAdjustments(board, [{ expert: 'backend', delta: 1.5, reason: 'r' }]), /整数/);
	assert.throws(() => applyAdjustments(board, [{ expert: 'backend', delta: -250, reason: 'r' }]), /不得超过 100/);
	assert.throws(() => applyAdjustments(board, [{ expert: 'nobody', delta: -20, reason: 'r' }]), /没有专家 nobody/);
});

test('assertDelta keeps the sign band', () => {
	assert.equal(assertDelta(-25), -25);
	assert.equal(assertDelta(15), 15);
});

test('adjustments mutate a copy, not the input board', () => {
	const board = createScoreboard({ task: 'x', experts: ['backend'] });
	const next = applyAdjustments(board, [{ expert: 'backend', delta: -25, reason: '未复跑宣称全绿' }]);
	assert.equal(board.experts[0].score, 100);
	assert.equal(next.experts[0].score, 75);
	assert.equal(next.experts[0].log.length, 1);
});

test('format then parse round-trips score, role and log', () => {
	const board = createScoreboard({
		task: '退款 状态机',
		experts: [{ name: 'backend', role: '后端 | 退款' }, 'reviewer'],
		at: new Date('2026-10-29T00:00:00.000Z')
	});
	const adjusted = applyAdjustments(
		board,
		[{ expert: 'backend', delta: -25, reason: '宣称全绿但 2 条红' }],
		new Date('2026-10-29T01:00:00.000Z')
	);
	const parsed = parseScoreboard(formatScoreboard(adjusted));
	assert.equal(parsed.task, '退款 状态机');
	assert.equal(parsed.experts.length, 2);
	assert.equal(parsed.experts[0].score, 75);
	assert.equal(parsed.experts[0].role, '后端 / 退款');
	assert.equal(parsed.experts[0].log.length, 1);
	assert.equal(parsed.experts[0].log[0].delta, -25);
	assert.match(parsed.experts[0].log[0].reason, /2 条红/);
});

test('parse rejects a file that is not a scoreboard', () => {
	assert.throws(() => parseScoreboard('# 随便什么东西\n'), /不是记分牌/);
});

test('file names are slugged but keep CJK', () => {
	assert.equal(slugifyTask('退款 状态机/重构'), '退款-状态机-重构');
	assert.equal(scoreboardFileName('退款 状态机'), '退款-状态机-expert-scoreboard.md');
	assert.throws(() => slugifyTask('   '), /不能为空/);
});

test('a task name containing pipes survives the round-trip unchanged', () => {
	// 标题即身份：以前把 | 写成 / 会让 show/adjust 永远报「不是同一任务」
	const task = '后端 | 退款 \\ 加固';
	const board = createScoreboard({ task, experts: ['fe'], at: new Date('2026-10-29T00:00:00.000Z') });
	const parsed = parseScoreboard(formatScoreboard(board));
	assert.equal(parsed.task, task);
	assert.doesNotThrow(() => assertSameTask(parsed, task));
});

test('a task name containing newlines degrades to one line without losing identity', () => {
	const task = '第一行\n第二行';
	const board = createScoreboard({ task, experts: ['fe'] });
	const parsed = parseScoreboard(formatScoreboard(board));
	assert.equal(parsed.task, task.replace('\n', '\n'));
	assert.equal(parsed.task.split('\n').length, 2);
});
