import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHandoff, handoffFileName, handoffMessage } from '../lib/handoff.js';
import { findExpert } from '../lib/experts.js';

const qa = findExpert('qa-engineer');
const bug = findExpert('bug-diagnosis-expert');

test('handoff file name is task--from-to', () => {
	const name = handoffFileName({ task: '退款 状态机', from: 'qa-engineer', to: 'bug-diagnosis-expert' });
	assert.equal(name, '退款-状态机--qa-engineer-to-bug-diagnosis-expert.md');
	assert.equal(handoffFileName({ task: 'a/b' }).includes('/'), false, 'file name must be one path segment');
});

test('a handoff carries the target expert requirements', () => {
	const note = buildHandoff({
		task: '退款 状态机',
		from: qa,
		to: bug,
		summary: '三条用例失败，日志显示库存回滚早于退款落库',
		evidence: ['pytest -q tests/test_refund.py → 3 failed / 12 passed', 'logs/refund.log:412 回滚先于 commit'],
		openItems: ['未确认是否为同一事务'],
		asks: ['给出根因与最小复现命令'],
		at: new Date('2026-10-29T10:20:30+08:00')
	});
	assert.match(note, /^# 交接单 · 退款 状态机/);
	assert.match(note, /从：测试工程师（`qa-engineer`）/);
	assert.match(note, /到：Bug 根因诊断专家（`bug-diagnosis-expert`）/);
	assert.match(note, /pytest -q tests\/test_refund\.py/);
	assert.match(note, /未确认是否为同一事务/);
	assert.match(note, /给出根因与最小复现命令/);
	for (const item of bug.acceptance) assert.ok(note.includes(item), `missing acceptance: ${item}`);
	for (const item of bug.forbidden) assert.ok(note.includes(item), `missing forbidden: ${item}`);
	for (const item of bug.inputs) assert.ok(note.includes(item), `missing input: ${item}`);
	assert.match(note, /对外结论由指挥官发布/);
	assert.match(note, /停手 \+ 交证据/);
	assert.match(note, /2026-10-29 10:20:30 \+08:00/);
});

test('a handoff without a conclusion is rejected', () => {
	assert.throws(() => buildHandoff({ task: 'x', from: qa, to: bug, summary: '   ' }), /一句结论/);
	assert.throws(() => buildHandoff({ task: '', from: qa, to: bug, summary: 'ok' }), /需要 task/);
	assert.throws(() => buildHandoff({ task: 'x', from: qa, to: bug, summary: 'ok', evidence: ['a', ' '] }), /空条目/);
	assert.throws(
		() => buildHandoff({ task: 'x', from: qa, to: bug, summary: 'ok', at: new Date('nope') }),
		/at 必须是合法时间/
	);
});

test('an empty evidence list says so instead of looking complete', () => {
	const note = buildHandoff({ task: 'x', from: qa, to: bug, summary: '结论' });
	assert.match(note, /（无：没有证据就不能交接/);
	assert.match(note, /## 未决项\n- （无）/);
});

test('the message body is paste-ready for send_message', () => {
	const message = handoffMessage({
		task: '退款 状态机',
		from: qa,
		to: bug,
		summary: '事务顺序颠倒',
		evidence: ['pytest -q → 3 failed'],
		openItems: ['是否同一事务'],
		asks: ['最小复现'],
		path: '.agent/plans/handoffs/x.md'
	});
	assert.match(message, /^【交接】退款 状态机：测试工程师 → Bug 根因诊断专家/);
	assert.match(message, /结论：事务顺序颠倒/);
	assert.match(message, /证据：\n- pytest -q → 3 failed/);
	assert.match(message, /你至少需要给到：/);
	assert.match(message, /验收按你的判据逐条回执（bug-diagnosis-expert）/);
	assert.match(message, /完整交接单：\.agent\/plans\/handoffs\/x\.md/);
	assert.doesNotMatch(message, /undefined/);
});
