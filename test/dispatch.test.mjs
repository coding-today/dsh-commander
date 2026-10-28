import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDispatch, DEFAULT_MAX_CONCURRENCY, formatDispatchReport } from '../lib/dispatch.js';

const good = [
	{
		subject: '退款状态机重构',
		assignee: 'backend',
		role: 'impl',
		acceptance: 'pytest tests/refund -q 全绿',
		files: ['service.py']
	},
	{
		subject: '审查退款重构',
		assignee: 'reviewer',
		role: 'review',
		acceptance: 'BLOCKING/REQUIRED/SUGGESTION 清单',
		dependsOn: ['退款状态机重构']
	}
];

test('a well-formed batch passes', () => {
	const result = checkDispatch(good, { running: 2 });
	assert.equal(result.ok, true);
	assert.equal(result.violations.length, 0);
	assert.match(formatDispatchReport(result), /通过/);
});

test('missing assignee blocks the dispatch', () => {
	const result = checkDispatch([{ subject: 'x', acceptance: 'y' }]);
	assert.equal(result.ok, false);
	assert.deepEqual(
		result.violations.map((item) => item.code),
		['D1_no_assignee']
	);
});

test('missing acceptance blocks the dispatch', () => {
	const result = checkDispatch([{ subject: 'x', assignee: 'a' }]);
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((item) => item.code === 'D2_no_acceptance'));
});

test('a review task without upstream blocks the dispatch', () => {
	const result = checkDispatch([{ subject: '审查', assignee: 'reviewer', role: 'review', acceptance: 'z' }]);
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((item) => item.code === 'D3_review_without_upstream'));
});

test('self-review blocks the dispatch', () => {
	const result = checkDispatch([
		{ subject: '实现', assignee: 'backend', acceptance: 'green' },
		{ subject: '审查', assignee: 'backend', role: 'review', acceptance: 'report', dependsOn: ['实现'] }
	]);
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((item) => item.code === 'D4_self_review'));
});

test('concurrency ceiling blocks a batch that would exceed it', () => {
	const tasks = Array.from({ length: 3 }, (_, index) => ({
		subject: `t${index}`,
		assignee: `expert${index}`,
		acceptance: 'ok'
	}));
	const result = checkDispatch(tasks, {
		running: DEFAULT_MAX_CONCURRENCY - 1,
		maxConcurrency: DEFAULT_MAX_CONCURRENCY
	});
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((item) => item.code === 'D5_over_concurrency'));
});

test('two implementers on one file warn but do not block', () => {
	const result = checkDispatch([
		{ subject: 'a', assignee: 'one', acceptance: 'ok', files: ['service.py'] },
		{ subject: 'b', assignee: 'two', acceptance: 'ok', files: ['service.py'] },
		{ subject: 'c', assignee: 'three', acceptance: 'ok', role: 'review', dependsOn: ['a'] }
	]);
	assert.equal(result.ok, true);
	assert.ok(result.warnings.some((item) => item.code === 'W2_write_conflict'));
});

test('a batch with no dependency anywhere warns', () => {
	const result = checkDispatch([
		{ subject: 'a', assignee: 'one', acceptance: 'ok' },
		{ subject: 'b', assignee: 'two', acceptance: 'ok' }
	]);
	assert.ok(result.warnings.some((item) => item.code === 'W3_no_dependencies'));
});

test('dependency references accept a subject or a 1-based index', () => {
	for (const ref of ['实现', 1]) {
		const result = checkDispatch([
			{ subject: '实现', assignee: 'backend', acceptance: 'green' },
			{ subject: '审查', assignee: 'backend', role: 'review', acceptance: 'report', dependsOn: [ref] }
		]);
		assert.ok(
			result.violations.some((item) => item.code === 'D4_self_review'),
			`ref ${String(ref)} should resolve to the implementer`
		);
	}
});

test('an out-of-range index resolves to nothing instead of the wrong task', () => {
	const result = checkDispatch([
		{ subject: '实现', assignee: 'backend', acceptance: 'green' },
		{ subject: '审查', assignee: 'backend', role: 'review', acceptance: 'report', dependsOn: [3] }
	]);
	assert.ok(!result.violations.some((item) => item.code === 'D4_self_review'));
});

test('malformed input is rejected instead of guessed', () => {
	assert.throws(() => checkDispatch('nope'), /必须是数组/);
	assert.throws(() => checkDispatch([{ accept: 'x' }]), /缺少 subject/);
	assert.throws(() => checkDispatch([], { running: -1 }), /running/);
});

test('an expert outside the roster blocks when the roster is supplied', () => {
	const result = checkDispatch([{ subject: 'a', assignee: 'backend', expert: 'ghost', acceptance: 'ok' }], {
		knownExperts: ['fullstack-arch', 'qa-engineer']
	});
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((item) => item.code === 'D6_unknown_expert'));
});

test('a known expert passes and an unnamed expert only warns', () => {
	const known = checkDispatch([{ subject: 'a', assignee: 'backend', expert: 'fullstack-arch', acceptance: 'ok' }], {
		knownExperts: ['fullstack-arch']
	});
	assert.equal(known.ok, true);
	const unnamed = checkDispatch([{ subject: 'a', assignee: 'backend', acceptance: 'ok' }], {
		knownExperts: ['fullstack-arch']
	});
	assert.equal(unnamed.ok, true);
	assert.ok(unnamed.warnings.some((item) => item.code === 'W4_no_expert'));
});

test('without a roster the expert field is not judged', () => {
	const result = checkDispatch([{ subject: 'a', assignee: 'b', expert: 'whatever', acceptance: 'ok' }]);
	assert.equal(result.ok, true);
	assert.ok(!result.warnings.some((item) => item.code === 'W4_no_expert'));
});

test('report lists blocking items with their fix', () => {
	const result = checkDispatch([{ subject: 'x', assignee: 'a' }]);
	const report = formatDispatchReport(result);
	assert.match(report, /D2_no_acceptance/);
	assert.match(report, /→/);
});
