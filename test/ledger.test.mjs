import assert from 'node:assert/strict';
import test from 'node:test';

import {
	LEDGER_HEADER,
	LEDGER_MAX_BYTES,
	LEDGER_TITLE,
	archiveFileName,
	formatLedgerEntry,
	insertLedgerEntry,
	ledgerNeedsArchive,
	rotatedLedger
} from '../lib/ledger.js';

const AT = new Date('2026-10-29T02:00:00.000Z');

test('formatLedgerEntry renders one mark per kind and rejects bad input', () => {
	const success = formatLedgerEntry({ kind: 'success', title: '先量后改', body: 'P95 从 800ms 降到 120ms', at: AT });
	assert.match(success, /^- ✅ \*\*先量后改\*\*（2026-10-29T02:00:00.000Z）$/m);
	assert.match(success, /^ {2}P95 从 800ms 降到 120ms$/m);
	assert.match(formatLedgerEntry({ kind: 'failure', title: 't', body: 'b', at: AT }), /❌/);
	assert.match(formatLedgerEntry({ kind: 'rule', title: 't', body: 'b', at: AT }), /🔴/);

	assert.throws(() => formatLedgerEntry({ kind: 'nope', title: 't', body: 'b' }), /未知台账类型/);
	assert.throws(() => formatLedgerEntry({ kind: 'rule', title: ' ', body: 'b' }), /标题不能为空/);
	assert.throws(() => formatLedgerEntry({ kind: 'rule', title: 't', body: '' }), /正文不能为空/);
});

test('insertLedgerEntry puts the newest entry right under the header', () => {
	const first = formatLedgerEntry({ kind: 'rule', title: '一', body: 'a', at: AT });
	const second = formatLedgerEntry({ kind: 'rule', title: '二', body: 'b', at: AT });

	const one = insertLedgerEntry(undefined, first);
	assert.ok(one.startsWith(LEDGER_HEADER));
	assert.ok(one.indexOf('一') < one.indexOf('二') || !one.includes('二'));

	const two = insertLedgerEntry(one, second);
	const firstIndexOfOne = two.indexOf('**一**');
	const firstIndexOfTwo = two.indexOf('**二**');
	assert.ok(firstIndexOfTwo < firstIndexOfOne, 'newest entry must come first');
});

test('insertLedgerEntry still works when the header block was edited by hand', () => {
	const handEdited = `${LEDGER_TITLE}\n\n自己加的一行说明\n\n- 🔴 **旧条目**（2026-10-01T00:00:00.000Z）\n  旧正文\n`;
	const entry = formatLedgerEntry({ kind: 'success', title: '新条目', body: '正文', at: AT });
	const merged = insertLedgerEntry(handEdited, entry);
	assert.ok(merged.startsWith(LEDGER_TITLE));
	assert.ok(merged.indexOf('**新条目**') < merged.indexOf('**旧条目**'), 'new entry must land above old ones');
	assert.ok(merged.includes('自己加的一行说明'));
});

test('insertLedgerEntry creates the header for a missing or foreign file', () => {
	const entry = formatLedgerEntry({ kind: 'rule', title: 'x', body: 'y', at: AT });
	for (const previous of [undefined, '', '# 别的文件\n内容\n']) {
		const merged = insertLedgerEntry(previous, entry);
		assert.ok(merged.startsWith(LEDGER_HEADER), 'header must be recreated');
		assert.ok(merged.includes('**x**'));
	}
});

test('ledgerNeedsArchive counts bytes, not characters', () => {
	assert.equal(ledgerNeedsArchive('short'), false);
	assert.equal(ledgerNeedsArchive('a'.repeat(LEDGER_MAX_BYTES)), false);
	assert.equal(ledgerNeedsArchive('a'.repeat(LEDGER_MAX_BYTES + 1)), true);
	// 一个汉字 3 字节：字符数没超，字节数超了也必须归档
	assert.equal(ledgerNeedsArchive('汉'.repeat(Math.ceil(LEDGER_MAX_BYTES / 3) + 1)), true);
});

test('archiveFileName keeps the stem and adds YYYYMM', () => {
	assert.equal(archiveFileName('commander-ledger.md', AT), 'commander-ledger-202610.md');
	assert.equal(archiveFileName('notes.txt', new Date('2026-01-05T00:00:00.000Z')), 'notes-202601.txt');
	assert.equal(archiveFileName('noext', AT), 'noext-202610');
	assert.equal(archiveFileName('a.b.md', AT), 'a.b-202610.md');
});

test('rotatedLedger keeps a pointer to the archive', () => {
	const entry = formatLedgerEntry({ kind: 'rule', title: 'x', body: 'y', at: AT });
	const text = rotatedLedger('commander-ledger-202610.md', entry);
	assert.ok(text.startsWith(LEDGER_HEADER));
	assert.ok(text.includes('旧条目已归档到 `commander-ledger-202610.md`'));
	assert.ok(text.includes('**x**'));
});
