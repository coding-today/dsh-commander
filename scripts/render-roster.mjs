/**
 * Regenerate the roster appendix inside `assets/commander.md`.
 *
 * The skill body is a hand-written playbook; the roster is generated from
 * `lib/experts.js` so the two cannot drift. Run after editing the catalog:
 *
 *   node scripts/render-roster.mjs          # rewrite the marked block
 *   node scripts/render-roster.mjs --check  # fail if the block is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXPERT_CATALOG, formatExpertTable } from '../lib/experts.js';

const SKILL_PATH = fileURLToPath(new URL('../assets/commander.md', import.meta.url));
const START = '<!-- dsh-commander:roster:start -->';
const END = '<!-- dsh-commander:roster:end -->';

/** Build the appendix block. */
function renderBlock() {
	return [
		START,
		'## 插件内置专家名册（19 位，各自带要求）',
		'',
		'派发前先取该专家的要求：`commander_expert brief <slug>`。每份要求包含「何时召唤 / 派发时必须给到 / 必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接」，必须原样写进任务书——**只写「让某专家看一下」等于没派**。',
		'',
		formatExpertTable(EXPERT_CATALOG),
		'',
		'名册里的验收判据是可机械判定的：交付时由专家逐条回执，缺一条按未交付计。新增专家时改 `lib/experts.js` 并跑 `node scripts/render-roster.mjs` 重新生成本节。',
		END
	].join('\n');
}

/** Replace (or append) the marked block. */
function nextBody(body) {
	const block = renderBlock();
	const start = body.indexOf(START);
	const end = body.indexOf(END);
	if (start === -1 || end === -1 || end < start) {
		return `${body.replace(/\s+$/, '')}\n\n${block}\n`;
	}
	return `${body.slice(0, start)}${block}${body.slice(end + END.length)}`;
}

const current = readFileSync(SKILL_PATH, 'utf8');
const next = nextBody(current);

if (process.argv.includes('--check')) {
	if (next !== current) {
		console.error('roster appendix is stale: run node scripts/render-roster.mjs');
		process.exit(1);
	}
	console.log('roster appendix is up to date');
} else if (next === current) {
	console.log('roster appendix unchanged');
} else {
	writeFileSync(SKILL_PATH, next, 'utf8');
	console.log(`roster appendix rewritten (${next.length} chars)`);
}
