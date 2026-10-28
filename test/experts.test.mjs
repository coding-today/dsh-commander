import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
	DIVISION_LABELS,
	EXPERT_CATALOG,
	EXPERT_DIVISIONS,
	expertSlugs,
	findExpert,
	formatExpertBrief,
	formatExpertTable,
	listExperts
} from '../lib/experts.js';

const SKILL_BODY = readFileSync(new URL('../assets/commander.md', import.meta.url), 'utf8');

test('every expert carries a complete requirement sheet', () => {
	for (const expert of EXPERT_CATALOG) {
		for (const field of ['slug', 'name', 'division', 'summary', 'handoff']) {
			assert.equal(typeof expert[field], 'string', `${expert.slug}.${field} must be a string`);
			assert.notEqual(expert[field].trim(), '', `${expert.slug}.${field} must not be empty`);
		}
		for (const field of ['summon', 'inputs', 'deliverables', 'acceptance', 'forbidden']) {
			assert.ok(
				Array.isArray(expert[field]) && expert[field].length >= 2,
				`${expert.slug}.${field} needs ≥2 items`
			);
		}
		assert.ok(EXPERT_DIVISIONS.includes(expert.division), `${expert.slug} has unknown division ${expert.division}`);
		assert.ok(DIVISION_LABELS[expert.division] !== undefined, `missing label for ${expert.division}`);
		assert.ok(expert.penalties.length >= 1, `${expert.slug} needs at least one penalty`);
		for (const penalty of expert.penalties) {
			assert.ok(
				Number.isInteger(penalty.delta) && penalty.delta < 0,
				`${expert.slug} penalty delta must be negative`
			);
			assert.ok(
				[-15, -20, -25, -40].includes(penalty.delta),
				`${expert.slug} penalty ${penalty.delta} is off the scoreboard scale`
			);
			assert.notEqual(String(penalty.reason).trim(), '', `${expert.slug} penalty needs a reason`);
		}
	}
});

test('slugs are unique and lookup works by slug, name and substring', () => {
	const slugs = expertSlugs();
	assert.equal(new Set(slugs).size, slugs.length);
	assert.equal(findExpert('qa-engineer').name, '测试工程师');
	assert.equal(findExpert('测试工程师').slug, 'qa-engineer');
	assert.equal(findExpert('fullstack').slug, 'fullstack-arch');
	assert.equal(findExpert(''), undefined);
	assert.equal(findExpert('nope'), undefined);
});

test('division filtering returns only that division', () => {
	const localization = listExperts({ division: 'localization' });
	assert.equal(localization.length, 4);
	assert.ok(localization.every((expert) => expert.division === 'localization'));
	assert.equal(listExperts().length, EXPERT_CATALOG.length);
});

test('a brief renders every requirement section', () => {
	const text = formatExpertBrief(findExpert('sec-auditor'));
	for (const heading of ['何时召唤', '派发时必须给到', '必须交回', '验收判据', '禁止动作', '扣分项', '交接']) {
		assert.match(text, new RegExp(heading));
	}
	assert.match(text, /-40/);
});

test('the roster table lists every expert', () => {
	const table = formatExpertTable();
	for (const slug of expertSlugs()) assert.ok(table.includes(`\`${slug}\``), `table missing ${slug}`);
});

test('the skill appendix is in sync with the catalog', () => {
	// Each expert must be reachable from the shipped skill body, so a session that
	// loads the skill sees the same roster the tools serve.
	for (const slug of expertSlugs()) {
		assert.ok(
			SKILL_BODY.includes(`\`${slug}\``),
			`assets/commander.md is missing ${slug}; run scripts/render-roster.mjs`
		);
	}
	assert.ok(SKILL_BODY.includes('<!-- dsh-commander:roster:start -->'));
	assert.ok(SKILL_BODY.includes('commander_expert brief'));
});

test('brief renders exactly the seven requirement sections, in order', () => {
	const expected = [
		'### 何时召唤',
		'### 派发时必须给到',
		'### 必须交回',
		'### 验收判据（可机械判定）',
		'### 禁止动作',
		'### 扣分项',
		'### 交接'
	];
	for (const expert of EXPERT_CATALOG) {
		const headings = formatExpertBrief(expert)
			.split('\n')
			.filter((line) => line.startsWith('### '));
		assert.deepEqual(headings, expected, `${expert.slug} 的要求书章节不一致`);
	}
});
