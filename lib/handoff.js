/**
 * Handoff notes between experts.
 *
 * The plugin cannot open a transport channel — message delivery belongs to the
 * host's agent team runtime. What it *can* do is make the handoff itself a
 * document: who handed what to whom, which evidence travels with it, what is
 * still open, and what the next expert must be given. A verbal "he said it
 * works" cannot be re-checked later; a handoff note can.
 *
 * @module dsh-commander/handoff
 */

import { slugifyTask } from './scoreboard.js';

/** Subdirectory (inside `plansDir`) that holds handoff notes. */
export const HANDOFF_DIR = 'handoffs';

/** Title prefix of a handoff note. */
export const HANDOFF_TITLE = '# 交接单 · ';

/**
 * File name for one handoff note: `<task>--<from>-to-<to>.md`.
 * @param input - the three identifying parts.
 * @returns a single path segment.
 */
export function handoffFileName({ task, from, to }) {
	const fromSlug = slugifyTask(String(from ?? 'unknown')).slice(0, 24);
	const toSlug = slugifyTask(String(to ?? 'unknown')).slice(0, 24);
	return `${slugifyTask(task)}--${fromSlug}-to-${toSlug}.md`;
}

/**
 * Format a timestamp as local time with an explicit offset.
 * @param at - Date to format.
 * @returns `YYYY-MM-DD HH:mm:ss +08:00`.
 */
function formatStamp(at) {
	if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
		throw new Error('dsh-commander: at 必须是合法时间');
	}
	const pad = (value) => String(value).padStart(2, '0');
	const offsetMinutes = -at.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? '+' : '-';
	const absolute = Math.abs(offsetMinutes);
	return (
		`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
		`${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())} ` +
		`${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
	);
}

/**
 * Normalize a free-text bullet list.
 * @param value - candidate array.
 * @param label - field name used in the error message.
 * @returns trimmed non-empty strings.
 */
function bulletList(value, label) {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`dsh-commander: ${label} 必须是字符串数组`);
	const list = value.map((item) => String(item ?? '').trim()).filter((item) => item !== '');
	if (list.length !== value.length) throw new Error(`dsh-commander: ${label} 里不能有空条目`);
	return list;
}

/**
 * Build the handoff note body.
 * @param input - handoff content.
 * @param input.task - task name the handoff belongs to.
 * @param input.from - expert handing off.
 * @param input.to - expert taking over.
 * @param input.summary - one-paragraph conclusion.
 * @param input.evidence - verifiable evidence carried over.
 * @param input.openItems - what is still unfinished.
 * @param input.asks - what the next expert is explicitly asked for.
 * @param input.at - timestamp, defaults to now.
 * @returns Markdown document.
 */
export function buildHandoff({ task, from, to, summary, evidence, openItems, asks, at = new Date() }) {
	const name = String(task ?? '').trim();
	if (name === '') throw new Error('dsh-commander: 交接单需要 task');
	if (from === undefined || to === undefined) throw new Error('dsh-commander: 交接单需要 from 与 to 两位专家');
	const conclusion = String(summary ?? '').trim();
	if (conclusion === '') throw new Error('dsh-commander: 交接单需要一句结论（summary），空交接等于没交接');

	const carried = bulletList(evidence, 'evidence');
	const open = bulletList(openItems, 'openItems');
	const requested = bulletList(asks, 'asks');

	const lines = [
		`${HANDOFF_TITLE}${name}`,
		'',
		`- 时间：${formatStamp(at)}`,
		`- 从：${from.name}（\`${from.slug}\`）`,
		`- 到：${to.name}（\`${to.slug}\`）`,
		'- 状态：待接手',
		'',
		'## 一句话结论',
		conclusion,
		''
	];

	lines.push('## 证据（可复核）');
	if (carried.length === 0) {
		lines.push('- （无：没有证据就不能交接，请先补齐命令与原始输出）');
	} else {
		for (const item of carried) lines.push(`- ${item}`);
	}
	lines.push('');

	lines.push('## 未决项');
	if (open.length === 0) {
		lines.push('- （无）');
	} else {
		for (const item of open) lines.push(`- ${item}`);
	}
	lines.push('');

	lines.push('## 下一棒必须给到');
	const required = to.inputs ?? [];
	for (const item of required) lines.push(`- ${item}`);
	for (const item of requested) lines.push(`- ${item}`);
	if (required.length === 0 && requested.length === 0) lines.push('- （按上一位的交接逐条确认）');
	lines.push('');

	lines.push('## 接手方的验收判据');
	for (const item of to.acceptance ?? []) lines.push(`- ${item}`);
	lines.push('');

	lines.push('## 接手方的禁止动作');
	for (const item of to.forbidden ?? []) lines.push(`- ${item}`);
	lines.push('');

	lines.push('## 交回方式');
	lines.push(`- 产出交回指挥官；对外结论由指挥官发布，专家之间不得直接对外。`);
	lines.push(`- 若实测与本单不符：停手 + 交证据，不许按错前提继续。`);

	return lines.join('\n');
}

/**
 * Render the same handoff as a message body that can be pasted into
 * `send_message` / `agent_teams_send_message`.
 * @param input - same content as {@link buildHandoff}, plus the note path.
 * @param input.path - where the note was written.
 * @returns plain-text message.
 */
export function handoffMessage(input) {
	const { task, from, to, summary, evidence = [], openItems = [], asks = [], path } = input;
	const lines = [
		`【交接】${String(task).trim()}：${from.name} → ${to.name}`,
		'',
		`结论：${String(summary).trim()}`,
		''
	];
	const carried = bulletList(evidence, 'evidence');
	if (carried.length > 0) {
		lines.push('证据：');
		for (const item of carried) lines.push(`- ${item}`);
		lines.push('');
	}
	const open = bulletList(openItems, 'openItems');
	if (open.length > 0) {
		lines.push('未决：');
		for (const item of open) lines.push(`- ${item}`);
		lines.push('');
	}
	const required = [...(to.inputs ?? []), ...bulletList(asks, 'asks')];
	if (required.length > 0) {
		lines.push('你至少需要给到：');
		for (const item of required) lines.push(`- ${item}`);
		lines.push('');
	}
	lines.push(`验收按你的判据逐条回执（${to.slug}）；不达标或缺项算未交付。`);
	if (path !== undefined) lines.push(`完整交接单：${path}`);
	return lines.join('\n');
}
