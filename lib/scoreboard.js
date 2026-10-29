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

/**
 * The commander scores itself on the same board.
 *
 * The scoreboard exists to make the *next* round different, and the commander is
 * the one who dispatches it — a board that only scores experts lets the person
 * setting the tasks repeat their own mistakes forever. The captain is therefore a
 * reserved row: `init` always creates it, `adjust` accepts it, `evolve` gives it
 * its own section instead of treating it as just another expert.
 */
export const CAPTAIN = 'captain';

/** Names the commander row may be addressed by (normalized to {@link CAPTAIN}). */
const CAPTAIN_NAMES = new Set([CAPTAIN, 'commander', '指挥官']);

/** Role rendered in the captain row. */
export const CAPTAIN_ROLE = '指挥官';

/**
 * Whether a row name refers to the commander rather than an expert.
 * @param name - row or expert name.
 * @returns true for the reserved aliases.
 */
export function isCaptain(name) {
	return CAPTAIN_NAMES.has(String(name ?? '').trim());
}

/**
 * Map every captain alias onto the single reserved name.
 * @param name - row or expert name.
 * @returns `captain` for aliases, otherwise the trimmed name.
 */
export function normalizeName(name) {
	const text = String(name ?? '').trim();
	return isCaptain(text) ? CAPTAIN : text;
}

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
	if (slug === '') throw new Error('dsh-commander: task 不能为空');
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

/** Escape a table cell for display only: never used for identity. */
function cell(value) {
	return String(value ?? '')
		.replace(/\|/g, '/')
		.replace(/\n+/g, ' ')
		.trim();
}

const TITLE_PREFIX = '# 专家记分牌 · ';

/**
 * Escape the task name that goes into the title line.
 *
 * The title **is** the task identity, so this must be lossless: `|` and `\`
 * are backslash-escaped and newlines become `\n`. A lossy escape (the previous
 * `|` → `/`) silently rewrote the name, after which every `show`/`adjust`
 * rejected the file with "不是同一任务" and no way to recover.
 * @param value - raw task name.
 * @returns escaped single-line string.
 */
function escapeTitle(value) {
	return String(value ?? '')
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/\r?\n/g, '\\n')
		.trim();
}

/**
 * Reverse {@link escapeTitle}.
 * @param value - escaped title fragment.
 * @returns the original single-line task name.
 */
function unescapeTitle(value) {
	return String(value ?? '')
		.replace(/\\n/g, '\n')
		.replace(/\\\|/g, '|')
		.replace(/\\\\/g, '\\')
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
	if (!Number.isInteger(delta)) throw new Error(`dsh-commander: delta 必须是整数（收到 ${String(delta)}）`);
	if (delta === 0) throw new Error('dsh-commander: delta 不能为 0');
	if (Math.abs(delta) > 100) throw new Error(`dsh-commander: |delta| 不得超过 100（收到 ${delta}）`);
	return delta;
}

/**
 * Build a fresh scoreboard.
 * @param options - task name, expert roster and creation time.
 * @returns a scoreboard object.
 */
export function createScoreboard({ task, experts, at = new Date() }) {
	const name = String(task ?? '').trim();
	if (name === '') throw new Error('dsh-commander: task 不能为空');
	if (!Array.isArray(experts) || experts.length === 0) throw new Error('dsh-commander: 至少要有一名专家');
	const seen = new Set([CAPTAIN]);
	// The commander row always exists: "how did I dispatch this round" is part of
	// the record, not an optional extra the model can forget to add.
	const roster = [{ name: CAPTAIN, role: CAPTAIN_ROLE, score: START_SCORE, log: [] }];
	for (const [index, expert] of experts.entries()) {
		const entry = typeof expert === 'string' ? { name: expert } : (expert ?? {});
		const expertName = normalizeName(entry.name);
		if (expertName === '') throw new Error(`dsh-commander: 第 ${index + 1} 名专家缺少 name`);
		if (expertName === CAPTAIN) continue;
		if (seen.has(expertName)) throw new Error(`dsh-commander: 专家重名 ${expertName}`);
		seen.add(expertName);
		roster.push({
			name: expertName,
			role: String(entry.role ?? '').trim(),
			score: START_SCORE,
			log: []
		});
	}
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
		if (Number.isNaN(value.getTime())) throw new Error('dsh-commander: at 不是合法时间');
		return value.toISOString();
	}
	if (typeof value === 'string') {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) throw new Error(`dsh-commander: at 不是合法时间（收到 ${value}）`);
		return parsed.toISOString();
	}
	throw new Error(`dsh-commander: at 必须是时间字符串或 Date（收到 ${typeof value}）`);
}

/**
 * Apply a batch of adjustments, returning a new scoreboard (input untouched).
 * @param board - scoreboard to adjust.
 * @param adjustments - list of `{ expert, delta, reason, at? }`.
 * @param at - default timestamp for entries without one.
 * @returns a new scoreboard.
 */
export function applyAdjustments(board, adjustments, at = new Date()) {
	if (!Array.isArray(adjustments) || adjustments.length === 0) throw new Error('dsh-commander: adjustments 不能为空');
	const next = {
		task: board.task,
		createdAt: board.createdAt,
		experts: board.experts.map((expert) => ({ ...expert, log: [...expert.log] }))
	};
	for (const raw of adjustments) {
		const expertName = normalizeName(raw?.expert);
		const reason = String(raw?.reason ?? '').trim();
		const delta = assertDelta(Number(raw?.delta));
		if (reason === '') throw new Error(`dsh-commander: 给 ${expertName || '(未指定专家)'} 的加减分必须写理由`);
		const target = next.experts.find((expert) => expert.name === expertName);
		if (target === undefined) {
			throw new Error(
				`dsh-commander: 记分牌里没有专家 ${expertName}；现有：${next.experts.map((expert) => expert.name).join(', ')}`
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
		`${TITLE_PREFIX}${escapeTitle(board.task)}`,
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
	const titleLine = lines.find((line) => line.startsWith(TITLE_PREFIX));
	if (titleLine === undefined) throw new Error('dsh-commander: 这个文件不是记分牌（缺少标题行）');
	const task = unescapeTitle(titleLine.slice(TITLE_PREFIX.length)) || fallbackTask;
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
	const byName = new Map();
	for (let index = Math.max(tableStart, 0); index < tableEnd; index += 1) {
		const match = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(-?\d+)\s*\|$/.exec(lines[index]);
		if (match === null) continue;
		if (match[1] === '专家' || match[1].startsWith('---')) continue;
		const row = { name: normalizeName(match[1]), role: match[2], score: Number(match[3]), log: [] };
		// A hand-edited board can carry both `captain` and `指挥官`; they are one row,
		// so the later duplicate must not become a second score to aggregate.
		if (byName.has(row.name)) continue;
		byName.set(row.name, row);
		experts.push(row);
	}
	if (experts.length === 0) throw new Error('dsh-commander: 记分牌里没有解析到任何专家行');
	for (let index = logStart === -1 ? 0 : logStart; index < lines.length; index += 1) {
		const match = /^-\s*(\S+)\s*\|\s*(.+?)\s*\|\s*([+-]\d+)\s*\|\s*(.+)$/.exec(lines[index]);
		if (match === null) continue;
		const target = byName.get(normalizeName(match[2]));
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
			`dsh-commander: 这个记分牌属于任务「${board.task}」，不是「${wanted}」。请用原名操作，或换一个任务名。`
		);
	}
	return board;
}

/**
 * The scoreboard is not a trophy case: it exists so the next round is dispatched
 * differently. Everything below turns the on-disk boards into that difference —
 * a per-expert card that says how strictly to frame the next task and which
 * corrections must be carried forward verbatim.
 *
 * @module dsh-commander/scoreboard (evolution)
 */

/** File the aggregated evolution card is written to inside the plans directory. */
export const EVOLUTION_FILE = 'expert-evolution.md';

/** How many distinct penalty reasons one card carries. */
export const PENALTY_LIMIT = 5;

/** How many distinct credit reasons one card carries. */
export const CREDIT_LIMIT = 3;

/**
 * How strictly the next dispatch is framed, by the expert's latest score.
 *
 * A band is policy, not decoration: without it a score is a number the model can
 * look at and ignore. Ordered highest first; the last arm is the floor.
 */
export const EVOLUTION_BANDS = [
	{ min: 90, label: '正常派发', note: '按 brief 原样派发；验收仍要可机械判定。' },
	{ min: 70, label: '加严验收', note: '任务书必须写死命令与期望输出，回执逐条对应验收判据。' },
	{ min: 50, label: '加严 + 二次复核', note: '另设一名 review 专家复核其产出，复核未过不得结案。' },
	{
		min: Number.NEGATIVE_INFINITY,
		label: '降级使用',
		note: '只派 research / doc 类低风险任务；实现类任务不派给该专家。'
	}
];

/**
 * Pick the band a score falls in.
 * @param score - latest score of one expert.
 * @param bands - band table, ordered highest first.
 * @returns the matching band.
 */
export function bandFor(score, bands = EVOLUTION_BANDS) {
	const value = Number(score);
	for (const band of bands) {
		if (value >= band.min) return band;
	}
	return bands[bands.length - 1];
}

/**
 * Order two timestamped entries oldest-first.
 * @param left - entry with `at`.
 * @param right - entry with `at`.
 * @returns negative when `left` is older.
 */
function byTime(left, right) {
	const leftAt = String(left.at ?? '');
	const rightAt = String(right.at ?? '');
	if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
	// Two boards created in the same millisecond (or a hand-edited log with
	// repeated stamps) would otherwise resolve by directory listing order, which
	// changes the "latest score" — and therefore the dispatch band — between runs.
	const leftTask = String(left.task ?? '');
	const rightTask = String(right.task ?? '');
	if (leftTask === rightTask) return 0;
	return leftTask < rightTask ? -1 : 1;
}

/**
 * Collapse repeated occurrences of one reason into one row, keeping the newest
 * sighting plus how often it happened.
 *
 * A reason that recurs is the whole point of the loop: it says last round's
 * correction did not stick, so this round needs a harder gate, not a rewording.
 *
 * @param entries - `{ at, delta, reason, task }` deltas, in any order.
 * @param limit - maximum distinct reasons kept, newest first.
 * @returns collapsed reasons.
 */
function collectReasons(entries, limit) {
	const byReason = new Map();
	for (const entry of entries) {
		const reason = String(entry.reason ?? '').trim();
		if (reason === '') continue;
		const seen = byReason.get(reason);
		if (seen === undefined) {
			byReason.set(reason, { reason, count: 1, at: entry.at, task: entry.task, delta: entry.delta });
			continue;
		}
		seen.count += 1;
		if (byTime(entry, seen) >= 0) {
			seen.at = entry.at;
			seen.task = entry.task;
			seen.delta = entry.delta;
		}
	}
	return [...byReason.values()].sort((left, right) => -byTime(left, right)).slice(0, limit);
}

/**
 * Aggregate every scoreboard found on disk into one card per expert.
 *
 * Scores are deliberately NOT summed across tasks: every board starts at 100, so
 * adding them would punish an expert simply for taking more work. The card keeps
 * the latest board's score plus the complete history of reasons behind it.
 *
 * @param boards - parsed scoreboards, in any order.
 * @returns one entry per expert, weakest first.
 */
export function aggregateExperts(boards) {
	const index = new Map();
	for (const board of boards ?? []) {
		const task = String(board?.task ?? '').trim();
		const createdAt = String(board?.createdAt ?? '');
		for (const expert of board?.experts ?? []) {
			const name = String(expert?.name ?? '').trim();
			if (name === '') continue;
			let entry = index.get(name);
			if (entry === undefined) {
				entry = { name, roles: [], boards: [], deltas: [] };
				index.set(name, entry);
			}
			const role = String(expert?.role ?? '').trim();
			if (role !== '' && !entry.roles.includes(role)) entry.roles.push(role);
			entry.boards.push({ task, at: createdAt, score: Number(expert?.score ?? START_SCORE) });
			for (const log of expert?.log ?? []) {
				entry.deltas.push({
					at: String(log?.at ?? ''),
					delta: Number(log?.delta ?? 0),
					reason: String(log?.reason ?? ''),
					task
				});
			}
		}
	}
	const experts = [...index.values()].map((entry) => {
		entry.boards.sort(byTime);
		entry.deltas.sort(byTime);
		const latest = entry.boards[entry.boards.length - 1];
		const score = latest === undefined ? START_SCORE : latest.score;
		const penalties = collectReasons(
			entry.deltas.filter((delta) => delta.delta < 0),
			PENALTY_LIMIT
		);
		const credits = collectReasons(
			entry.deltas.filter((delta) => delta.delta > 0),
			CREDIT_LIMIT
		);
		return {
			name: entry.name,
			roles: entry.roles,
			participations: entry.boards.length,
			latestScore: score,
			latestTask: latest === undefined ? '' : latest.task,
			band: bandFor(score),
			penalties,
			credits,
			recidivism: penalties.filter((penalty) => penalty.count > 1).length
		};
	});
	experts.sort((left, right) => left.latestScore - right.latestScore || (left.name < right.name ? -1 : 1));
	return experts;
}

/** Heading line used for the commander's own section. */
const CAPTAIN_PENALTY_HEADING = '- 自身失误（每份新任务书开头「我不要重复」一节原样抄）：';

/** Heading line used for the commander's own credits. */
const CAPTAIN_CREDIT_HEADING = '- 做对的地方（下一轮保持这套派法）：';

/** Heading line used by an expert's history. */
const EXPERT_PENALTY_HEADING = '- 历史失分（原样写进下一份任务书的「扣分项 / 禁止动作」）：';

/** Heading line used by an expert's reusable practice. */
const EXPERT_CREDIT_HEADING = '- 可复用做法（写进任务书的「有效做法」）：';

/**
 * One "what the next dispatch must carry" line, or nothing when there is no history.
 * @param entry - aggregated expert entry.
 * @returns the line text, or an empty string.
 */
function directiveFor(entry) {
	const worst = entry.penalties[0];
	if (worst === undefined) return '';
	const repeat = worst.count > 1 ? `（已复发 ${worst.count} 次）` : '';
	return `**${entry.name}**（${entry.latestScore} 分·${entry.band.label}）：${worst.reason}${repeat}`;
}

/**
 * The 30-second read at the top of the card: nothing here is optional.
 * @param captain - aggregated commander entry, when the board has one.
 * @param crew - aggregated expert entries.
 * @returns one string per bullet.
 */
function briefLines(captain, crew) {
	const lines = [];
	if (captain !== undefined) {
		const worst = captain.penalties[0];
		lines.push(
			worst === undefined
				? `指挥官 ${captain.latestScore} 分（${captain.band.label}）：还没有自身失误记录——有就拿证据记一条，别自评满分。`
				: `指挥官 ${captain.latestScore} 分（${captain.band.label}）：最近一次自身失误是「${worst.reason}」${worst.count > 1 ? `（复发 ${worst.count} 次，升级为硬闸门：派发前必跑 commander_dispatch_check）` : ''}。`
		);
	}
	const strict = crew.filter((entry) => entry.band.label !== '正常派发');
	for (const entry of strict) lines.push(directiveFor(entry));
	if (strict.length === 0 && crew.length > 0) {
		lines.push('全体专家都在「正常派发」档：本轮不要加戏，按 brief 原样派。');
	}
	if (crew.length === 0 && captain !== undefined) {
		lines.push('还没有专家历史：本轮 init 时把名册填全，下一轮才有的进化。');
	}
	return lines;
}

/**
 * The commander's own section: score, dispatch discipline, and its own mistakes.
 * @param captain - aggregated commander entry.
 * @returns rendered lines.
 */
function captainLines(captain) {
	const lines = [
		`## ${CAPTAIN}，${CAPTAIN_ROLE} —— ${captain.latestScore} 分（${captain.band.label}）`,
		`- 参与过 ${captain.participations} 张记分牌；最近一次来自「${captain.latestTask || '(未记录)'}」`,
		`- 本轮派发纪律：${captain.band.note}`
	];
	if (captain.penalties.length === 0) {
		lines.push(`${CAPTAIN_PENALTY_HEADING.replace('：', '')}无`);
	} else {
		lines.push(CAPTAIN_PENALTY_HEADING);
		for (const penalty of captain.penalties) {
			const flag = penalty.count > 1 ? ` ×${penalty.count} 复发` : '';
			lines.push(`  - [${penalty.delta}]${flag} ${penalty.reason}（${penalty.at} @ ${penalty.task}）`);
		}
	}
	if (captain.credits.length > 0) {
		lines.push(CAPTAIN_CREDIT_HEADING);
		for (const credit of captain.credits) lines.push(`  - [+${credit.delta}] ${credit.reason}`);
	}
	if (captain.recidivism > 0) {
		lines.push('- 复发：同一个派发错误又犯了——这一条要在台账 `commander-ledger` 里单独记 failure，并升为硬闸门。');
	}
	lines.push('');
	return lines;
}

/**
 * One expert section.
 * @param expert - aggregated expert entry.
 * @returns rendered lines.
 */
function expertLines(expert) {
	const role = expert.roles.length === 0 ? '' : `，${expert.roles.join(' / ')}`;
	const lines = [
		`## ${expert.name}${role} —— ${expert.latestScore} 分（${expert.band.label}）`,
		`- 参与过 ${expert.participations} 张记分牌；最近一次来自「${expert.latestTask || '(未记录)'}」`,
		`- 本轮派发：${expert.band.note}`
	];
	if (expert.penalties.length === 0) {
		lines.push('- 历史失分：无');
	} else {
		lines.push(EXPERT_PENALTY_HEADING);
		for (const penalty of expert.penalties) {
			const flag = penalty.count > 1 ? ` ×${penalty.count} 复发` : '';
			lines.push(`  - [${penalty.delta}]${flag} ${penalty.reason}（${penalty.at} @ ${penalty.task}）`);
		}
	}
	if (expert.credits.length > 0) {
		lines.push(EXPERT_CREDIT_HEADING);
		for (const credit of expert.credits) lines.push(`  - [+${credit.delta}] ${credit.reason}`);
	}
	if (expert.recidivism > 0) {
		lines.push('- 复发失分：上一轮纠正没生效——本轮必须把对应 failure 同时写进台账（指挥官自身进化）。');
	}
	lines.push('');
	return lines;
}

/**
 * The copy-paste table: this is what makes the card change the next dispatch
 * instead of being a report the model reads and ignores.
 * @param captain - aggregated commander entry, when present.
 * @param crew - aggregated expert entries.
 * @returns rendered lines, or an empty array when there is nothing to copy.
 */
export function formatDirectives(captain, crew) {
	const rows = [];
	for (const entry of crew) {
		const must = entry.penalties.slice(0, 2).map((penalty) => penalty.reason);
		rows.push(
			`| ${cell(entry.name)} | ${cell(entry.band.label)} | ${cell(must.length === 0 ? '无（按 brief 原样派）' : must.join('；'))} |`
		);
	}
	if (captain !== undefined) {
		const must = captain.penalties.slice(0, 2).map((penalty) => penalty.reason);
		rows.push(
			`| ${CAPTAIN}（自己） | ${cell(captain.band.label)} | ${cell(must.length === 0 ? '无（照常派发）' : must.join('；'))} |`
		);
	}
	if (rows.length === 0) return [];
	return [
		'## 下一轮派发指令（写进任务书，不是看过就算）',
		'',
		'| 角色 | 档位 | 必写进任务书 |',
		'| --- | --- | --- |',
		...rows,
		''
	];
}

/**
 * Render the evolution card.
 * @param experts - output of {@link aggregateExperts}.
 * @param options - generation time and the plans directory used in the source note.
 * @returns Markdown text ending with a newline.
 */
export function formatEvolution(experts, { at = new Date(), plansDir = '' } = {}) {
	const source = plansDir === '' ? '*-expert-scoreboard.md' : `\`${plansDir}/\`*-expert-scoreboard.md`;
	const captain = (experts ?? []).find((entry) => isCaptain(entry.name));
	const crew = (experts ?? []).filter((entry) => !isCaptain(entry.name));
	const lines = [
		'# 指挥官 + 专家进化卡',
		'',
		`生成：${at.toISOString()}`,
		`来源：${source}（只读聚合，不改记分牌）`,
		'口径：分数不跨任务相加——每张记分牌独立从 100 起，这里取「最近一张牌的当前分」+ 全部历史理由；`captain` 是保留行，记的是指挥官自己的派发纪律。',
		''
	];
	if (captain === undefined && crew.length === 0) {
		lines.push('（还没有任何历史：先在本轮 init + adjust，下一轮才有东西可进化）', '');
		return lines.join('\n');
	}
	lines.push('## 下轮必读（派发前 30 秒）');
	for (const line of briefLines(captain, crew)) lines.push(`- ${line}`);
	lines.push('');
	if (captain !== undefined) lines.push(...captainLines(captain));
	for (const expert of crew) lines.push(...expertLines(expert));
	lines.push(...formatDirectives(captain, crew));
	return lines.join('\n');
}
