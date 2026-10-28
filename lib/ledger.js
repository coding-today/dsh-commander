/**
 * Pure ledger text operations.
 *
 * The ledger is a plain Markdown file whose newest entry sits directly under the
 * header. Kept free of filesystem calls so the placement rules are testable and
 * so a user's hand edit cannot silently flip the order.
 *
 * @module dsh-commander/ledger
 */
import path from 'node:path';

/** First line of the ledger; also the anchor every entry assumes. */
export const LEDGER_TITLE = '# 指挥官经验台账';

/** Full header block written above the first entry. */
export const LEDGER_HEADER = `${LEDGER_TITLE}\n\n> 最新在最上。每条写：现象 / 证据 / 固化的做法。\n\n`;

/** Rotate the ledger once it grows past this size (bytes). */
export const LEDGER_MAX_BYTES = 256 * 1024;

/** Marker printed with a kind. */
const MARKS = { success: '✅', failure: '❌', rule: '🔴' };

/**
 * Render one ledger entry.
 * @param entry - `{ kind, title, body, at }`.
 * @returns Markdown block ending with a newline.
 */
export function formatLedgerEntry({ kind, title, body, at = new Date() }) {
	const mark = MARKS[kind];
	if (mark === undefined) throw new Error(`commander: 未知台账类型 ${String(kind)}（success / failure / rule）`);
	const heading = String(title ?? '').trim();
	if (heading === '') throw new Error('commander: 台账条目标题不能为空');
	const text = String(body ?? '').trim();
	if (text === '') throw new Error('commander: 台账条目正文不能为空');
	const stamp = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
	return `- ${mark} **${heading}**（${stamp}）\n  ${text.replace(/\n/g, '\n  ')}\n`;
}

/**
 * Insert an entry directly under the ledger header, newest first.
 *
 * A file whose header was edited by hand still sorts correctly: the entry lands
 * after the first blank line following the title instead of at the bottom.
 *
 * @param previous - current file content, if any.
 * @param entry - rendered entry text.
 * @returns the new file content.
 */
export function insertLedgerEntry(previous, entry) {
	const base =
		typeof previous === 'string' && previous.startsWith(LEDGER_TITLE)
			? previous
			: LEDGER_HEADER + (typeof previous === 'string' ? previous : '');
	if (base.startsWith(LEDGER_HEADER)) return `${LEDGER_HEADER}${entry}\n${base.slice(LEDGER_HEADER.length)}`;
	const titleEnd = base.indexOf('\n');
	const blank = base.indexOf('\n\n');
	const insertAt = blank !== -1 ? blank + 2 : titleEnd !== -1 ? titleEnd + 1 : base.length;
	return `${base.slice(0, insertAt)}${entry}\n${base.slice(insertAt)}`;
}

/**
 * Whether the ledger should be archived and restarted.
 * @param text - current content.
 * @returns true when the file exceeds {@link LEDGER_MAX_BYTES}.
 */
export function ledgerNeedsArchive(text) {
	return Buffer.byteLength(String(text ?? ''), 'utf8') > LEDGER_MAX_BYTES;
}

/**
 * Archive file name living next to the ledger.
 * @param ledgerFile - configured ledger file name.
 * @param at - rotation time.
 * @returns `<ledger>-YYYYMM.md`.
 */
export function archiveFileName(ledgerFile, at = new Date()) {
	const extension = path.extname(ledgerFile) || '.md';
	const stem = extension === ledgerFile ? ledgerFile : ledgerFile.slice(0, -extension.length);
	const stamp = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}`;
	return `${stem}-${stamp}${extension}`;
}

/**
 * Content that replaces the ledger when it rotates: a pointer plus the new entry.
 * @param archivedName - archive file name the old entries moved to.
 * @param entry - rendered entry text kept in the live ledger.
 * @returns new live ledger content.
 */
export function rotatedLedger(archivedName, entry) {
	return `${LEDGER_HEADER}${entry}\n> 旧条目已归档到 \`${archivedName}\`。\n\n`;
}
