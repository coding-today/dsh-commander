import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeRelative, fileSystemOf, listPlansFiles, posixDisplay } from '../lib/workspace.js';

test('accepts workspace-relative paths and normalizes separators', () => {
	assert.equal(assertSafeRelative('.agent/plans', 'plansDir'), '.agent/plans');
	assert.equal(assertSafeRelative('a\\b/c', 'plansDir'), 'a/b/c');
	assert.equal(assertSafeRelative('./.agent//plans/', 'plansDir'), '.agent/plans');
	assert.equal(assertSafeRelative(' ledger.md ', 'ledgerFile', { allowSegments: false }), 'ledger.md');
});

test('display paths render with posix separators on every host', () => {
	// The harness resolves displayPath with the platform separator; Windows reports
	// `.agent\\plans\\x.md`. Users, docs and log lines are all posix, so a report must
	// not change shape with the host OS. Backslash input is the Windows shape, and the
	// assertion has to hold on macOS/Linux CI too — hence a literal, not path.join.
	assert.equal(posixDisplay('.agent\\plans\\ledger.md'), '.agent/plans/ledger.md');
	assert.equal(posixDisplay('C:\\ws\\.agent\\plans\\x.md'), 'C:/ws/.agent/plans/x.md');
	assert.equal(posixDisplay('.agent/plans/ledger.md'), '.agent/plans/ledger.md');
	assert.equal(posixDisplay(undefined), '');
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

test('listPlansFiles treats an absent directory as empty and a missing listDir as an error', async () => {
	const base = { processPath: (target) => target.targetKey };
	assert.deepEqual(
		await listPlansFiles({ ...base, lstat: async () => undefined, listDir: async () => [] }, {}, undefined),
		[]
	);
	await assert.rejects(
		async () => listPlansFiles({ ...base, lstat: async () => ({ type: 'directory' }) }, {}, undefined),
		/没有 listDir/
	);
	const entries = [
		{ name: 'a-expert-scoreboard.md', type: 'file' },
		{ name: 'handoffs', type: 'directory' },
		{ name: 'socket', type: 'other' }
	];
	const fs = { ...base, lstat: async () => ({ type: 'directory' }), listDir: async () => entries };
	assert.deepEqual(await listPlansFiles(fs, {}, undefined), ['a-expert-scoreboard.md']);
});
