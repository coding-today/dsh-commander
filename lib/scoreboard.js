/**
 * Pure scoreboard logic for the commander plugin: create, adjust, render and
 * parse the on-disk expert scoreboard.
 *
 * The scoreboard is deliberately a plain Markdown file so a human can read and
 * edit it, and so the numbers survive a session or a roster loss. Every
 * adjustment must carry a reason: a score without a written reason is exactly
 * the "verbal verdict" this plugin exists to prevent.
 *
 * @module dsh-commander/scoreboard
 */
import { createHash } from 'node:crypto';

/** Every expert starts here. */
export const START_SCORE = 100;

/** Suffix appended to the task slug for the scoreboard file name. */
export const SCOREBOARD_SUFFIX = '-expert-scoreboard.md';

/** Longest slug kept verbatim before it is truncated with a digest. */
export const SLUG_MAX_LENGTH = 64;

/** Header written above the table; also the parse anchor. */
const TABLE_HEADER = '| 专家 | 职责 | 当前分 |\n| --- | --- | --- |';

/** Separator between the table section and the adjustment log. */
const LOG_HEADER = '## 流水';

/**
 * Turn an arbitrary task name into a file-safe slug.
 * @param task - human task name.
 * @returns slug using letters, digits, dots, dashes and underscores.
 */
export function slugifyTask(task) {
	const raw = String(task ?? '').trim();
	const slug = raw
		.replace(/\s+/g, '-')
		.replace(/[^\p{L}\p{N}._-]+/gu, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (slug === '') throw new Error('commander: task 不能为空');
	if (slug.length <= SLUG_MAX_LENGTH) return slug;
	// Long task names would hit ENAMETOOLONG and collide after truncation; keep a
	// stable digest of the full name so two long names never share a file.
	const digest = createHash('sha256').update(raw).digest('hex').slice(0, 8);
	return `${slug.slice(0, SLUG_MAX_LENGTH - 9)}-${digest}`;
}

/**
 * File name for a task scoreboard.
 * @param task - human task name.
 * @returns `<slug>-expert-scoreboard.md`.
 */
export function scoreboardFileName(task) {
	return `${slugifyTask(task)}${SCOREBOARD_SUFFIX}`;
}

/** Escape a cell so a stray pipe cannot break the table. */
function cell(value) {
	return String(value ?? '')
		.replace(/\|/g, '/')
		.replace(/\n+/g, ' ')
		.trim();
}

/**
 * Validate a delta against the commander's rules: integer, non-zero, within a
 * sane band. The band is a guard against typos (-250 instead of -25), not a
 * policy: the skill owns the actual values.
 * @param delta - proposed change.
 * @returns the delta as an integer.
 */
export function assertDelta(delta) {
	if (!Number.isInteger(delta)) throw new Error(`commander: delta 必须是整数（收到 ${String(delta)}）`);
	if (delta === 0) throw new Error('commander: delta 不能为 0');
	if (Math.abs(delta) > 100) throw new Error(`commander: |delta| 不得超过 100（收到 ${delta}）`);
	return delta;
}

/**
 * Build a fresh scoreboard.
 * @param options - task name, expert roster and creation time.
 * @returns a scoreboard object.
 */
export function createScoreboard({ task, experts, at = new Date() }) {
	const name = String(task ?? '').trim();
	if (name === '') throw new Error('commander: task 不能为空');
	if (!Array.isArray(experts) || experts.length === 0) throw new Error('commander: 至少要有一名专家');
	const seen = new Set();
	const roster = experts.map((expert, index) => {
		const entry = typeof expert === 'string' ? { name: expert } : (expert ?? {});
		const expertName = String(entry.name ?? '').trim();
		if (expertName === '') throw new Error(`commander: 第 ${index + 1} 名专家缺少 name`);
		if (seen.has(expertName)) throw new Error(`commander: 专家重名 ${expertName}`);
		seen.add(expertName);
		return {
			name: expertName,
			role: String(entry.role ?? '').trim(),
			score: START_SCORE,
			log: []
		};
	});
	return {
		task: name,
		createdAt: at.toISOString(),
		experts: roster
	};
}

/**
 * Normalize an adjustment timestamp without letting a bad value surface as a
 * raw engine TypeError to the model.
 * @param value - caller-supplied timestamp, if any.
 * @param fallback - timestamp used when none was supplied.
 * @returns ISO-8601 string.
 */
function toTimestamp(value, fallback) {
	if (value === undefined || value === null) return fallback.toISOString();
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) throw new Error('commander: at 不是合法时间');
		return value.toISOString();
	}
	if (typeof value === 'string') {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) throw new Error(`commander: at 不是合法时间（收到 ${value}）`);
		return parsed.toISOString();
	}
	throw new Error(`commander: at 必须是时间字符串或 Date（收到 ${typeof value}）`);
}

/**
 * Apply a batch of adjustments, returning a new scoreboard (input untouched).
 * @param board - scoreboard to adjust.
 * @param adjustments - list of `{ expert, delta, reason, at? }`.
 * @param at - default timestamp for entries without one.
 * @returns a new scoreboard.
 */
export function applyAdjustments(board, adjustments, at = new Date()) {
	if (!Array.isArray(adjustments) || adjustments.length === 0) throw new Error('commander: adjustments 不能为空');
	const next = {
		task: board.task,
		createdAt: board.createdAt,
		experts: board.experts.map((expert) => ({ ...expert, log: [...expert.log] }))
	};
	for (const raw of adjustments) {
		const expertName = String(raw?.expert ?? '').trim();
		const reason = String(raw?.reason ?? '').trim();
		const delta = assertDelta(Number(raw?.delta));
		if (reason === '') throw new Error(`commander: 给 ${expertName || '(未指定专家)'} 的加减分必须写理由`);
		const target = next.experts.find((expert) => expert.name === expertName);
		if (target === undefined) {
			throw new Error(
				`commander: 记分牌里没有专家 ${expertName}；现有：${next.experts.map((expert) => expert.name).join(', ')}`
			);
		}
		const entry = { at: toTimestamp(raw?.at, at), delta, reason };
		target.score += delta;
		target.log.push(entry);
	}
	return next;
}

/**
 * Render a scoreboard as Markdown.
 * @param board - scoreboard to render.
 * @returns Markdown text ending with a newline.
 */
export function formatScoreboard(board) {
	const lines = [
		`# 专家记分牌 · ${cell(board.task)}`,
		'',
		`创建：${board.createdAt}`,
		'规则：起始 100；加减分必须写理由；一切以磁盘证据为准，不以汇报为准。',
		'',
		TABLE_HEADER
	];
	for (const expert of board.experts) {
		lines.push(`| ${cell(expert.name)} | ${cell(expert.role)} | ${expert.score} |`);
	}
	lines.push('', LOG_HEADER, '');
	if (board.experts.every((expert) => expert.log.length === 0)) {
		lines.push('（暂无加减分）');
	} else {
		const entries = [];
		for (const expert of board.experts) {
			for (const entry of expert.log) entries.push({ expert: expert.name, ...entry });
		}
		entries.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
		for (const entry of entries) {
			lines.push(
				`- ${entry.at} | ${cell(entry.expert)} | ${entry.delta > 0 ? '+' : ''}${entry.delta} | ${cell(entry.reason)}`
			);
		}
	}
	lines.push('');
	return lines.join('\n');
}

/**
 * Parse a scoreboard previously written by {@link formatScoreboard}.
 * @param markdown - file contents.
 * @param fallbackTask - task name to use when the heading is unreadable.
 * @returns a scoreboard object.
 */
export function parseScoreboard(markdown, fallbackTask = '') {
	const text = String(markdown ?? '');
	const lines = text.split('\n');
	const titleLine = lines.find((line) => line.startsWith('# 专家记分牌 · '));
	if (titleLine === undefined) throw new Error('commander: 这个文件不是记分牌（缺少标题行）');
	const task = titleLine.slice('# 专家记分牌 · '.length).trim() || fallbackTask;
	const createdLine = lines.find((line) => line.startsWith('创建：'));
	const createdAt =
		createdLine === undefined
			? ''
			: createdLine
					.slice('创建：'.length)
					.trim()
					.replace(/\s*\(.*\)$/, '');
	// Only the table region counts as roster data: a hand-written or injected
	// table row elsewhere in the file must not become an expert.
	const tableStart = lines.indexOf(TABLE_HEADER.split('\n')[0]);
	const logStart = lines.indexOf(LOG_HEADER);
	const tableEnd = logStart === -1 ? lines.length : logStart;
	const experts = [];
	for (let index = Math.max(tableStart, 0); index < tableEnd; index += 1) {
		const match = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(-?\d+)\s*\|$/.exec(lines[index]);
		if (match === null) continue;
		if (match[1] === '专家' || match[1].startsWith('---')) continue;
		experts.push({ name: match[1], role: match[2], score: Number(match[3]), log: [] });
	}
	if (experts.length === 0) throw new Error('commander: 记分牌里没有解析到任何专家行');
	const byName = new Map(experts.map((expert) => [expert.name, expert]));
	for (let index = logStart === -1 ? 0 : logStart; index < lines.length; index += 1) {
		const match = /^-\s*(\S+)\s*\|\s*(.+?)\s*\|\s*([+-]\d+)\s*\|\s*(.+)$/.exec(lines[index]);
		if (match === null) continue;
		const target = byName.get(match[2]);
		if (target === undefined) continue;
		target.log.push({ at: match[1], delta: Number(match[3]), reason: match[4].trim() });
	}
	return { task, createdAt, experts };
}

/**
 * Guard against operating on another task's scoreboard: the file name is a slug,
 * so two task names can land on one file.
 * @param board - parsed scoreboard.
 * @param expected - task name the caller asked for.
 * @returns the board when it belongs to `expected`.
 */
export function assertSameTask(board, expected) {
	const wanted = String(expected ?? '').trim();
	if (wanted !== '' && board.task !== wanted) {
		throw new Error(
			`commander: 这个记分牌属于任务「${board.task}」，不是「${wanted}」。请用原名操作，或换一个任务名。`
		);
	}
	return board;
}
