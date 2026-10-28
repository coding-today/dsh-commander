import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeRelative, fileSystemOf } from '../lib/workspace.js';

test('accepts workspace-relative paths and normalizes separators', () => {
	assert.equal(assertSafeRelative('.agent/plans', 'plansDir'), '.agent/plans');
	assert.equal(assertSafeRelative('a\\b/c', 'plansDir'), 'a/b/c');
	assert.equal(assertSafeRelative('./.agent//plans/', 'plansDir'), '.agent/plans');
	assert.equal(assertSafeRelative(' ledger.md ', 'ledgerFile', { allowSegments: false }), 'ledger.md');
});

test('rejects anything that could escape the workspace', () => {
	assert.throws(() => assertSafeRelative('', 'plansDir'), /不能为空/);
	assert.throws(() => assertSafeRelative('  ', 'plansDir'), /不能为空/);
	assert.throws(() => assertSafeRelative('~/plans', 'plansDir'), /不支持 ~ 展开/);
	assert.throws(() => assertSafeRelative('/etc/passwd', 'plansDir'), /不能是绝对路径/);
	assert.throws(() => assertSafeRelative('C:\\Users\\x', 'plansDir'), /不能是绝对路径/);
	assert.throws(() => assertSafeRelative('../outside', 'plansDir'), /不能包含 \.\./);
	assert.throws(() => assertSafeRelative('a/../../b', 'plansDir'), /不能包含 \.\./);
	assert.throws(() => assertSafeRelative('./', 'plansDir'), /解析后为空/);
});

test('single-segment mode rejects directories', () => {
	assert.throws(() => assertSafeRelative('nested/ledger.md', 'ledgerFile', { allowSegments: false }), /必须是文件名/);
});

test('fileSystemOf explains a missing fs service instead of throwing a TypeError', () => {
	const withService = { get: () => ({ writeText: () => {} }) };
	assert.equal(typeof fileSystemOf(withService).writeText, 'function');

	assert.throws(() => fileSystemOf({ get: () => undefined }), /没有文件服务/);
	assert.throws(() => fileSystemOf({ get: () => undefined }), /dsh-commander:/);
});
