#!/usr/bin/env node
/**
 * 命令行入口：不装进 DSH 也能验插件的两个纯函数工具。
 *
 * 用途：
 * - 在 CI 或本地快速验证一批任务的派发闸门结果；
 * - 查看某位专家的派遣要求（派发前抄进任务书）。
 *
 * 用法：
 *   node scripts/commander-cli.mjs gate examples/dispatch-batch.json
 *   node scripts/commander-cli.mjs brief qa-engineer
 *   node scripts/commander-cli.mjs experts [division]
 *
 * 退出码：gate 未通过返回 1，便于在 CI 里当断言用。
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { checkDispatch, formatDispatchReport } from '../lib/dispatch.js';
import {
	DIVISION_LABELS,
	EXPERT_DIVISIONS,
	findExpert,
	formatExpertBrief,
	formatExpertTable,
	listExperts,
	matchExperts
} from '../lib/experts.js';

const [command, argument] = process.argv.slice(2);

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

function runGate(file) {
	if (file === undefined) fail('用法：gate <batch.json>');
	let payload;
	try {
		payload = JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		fail(`读不了 ${file}：${error.message}`);
	}
	const tasks = Array.isArray(payload) ? payload : (payload.tasks ?? []);
	const options = Array.isArray(payload) ? {} : (payload.options ?? {});
	const result = checkDispatch(tasks, options);
	process.stdout.write(`${formatDispatchReport(result)}\n`);
	process.exit(result.ok ? 0 : 1);
}

function runBrief(slug) {
	if (slug === undefined) fail('用法：brief <expert-slug>');
	const expert = findExpert(slug);
	if (expert === undefined) {
		const candidates = matchExperts(slug).map((item) => item.slug);
		fail(
			candidates.length === 0
				? `名册里没有「${slug}」，用 experts 看全部。`
				: `「${slug}」对应 ${candidates.length} 位专家：${candidates.join(' / ')}，请写完整 slug。`
		);
	}
	process.stdout.write(`${formatExpertBrief(expert)}\n`);
}

function runExperts(division) {
	if (division !== undefined && !EXPERT_DIVISIONS.includes(division)) {
		fail(`未知领域「${division}」，可选：${EXPERT_DIVISIONS.join(' / ')}`);
	}
	const experts = listExperts(division === undefined ? {} : { division });
	process.stdout.write(`${formatExpertTable(experts)}\n`);
	if (division === undefined) {
		process.stdout.write(
			`\n领域：${EXPERT_DIVISIONS.map((item) => `${item}（${DIVISION_LABELS[item]}）`).join(' / ')}\n`
		);
	}
}

switch (command) {
	case 'gate':
		runGate(argument);
		break;
	case 'brief':
		runBrief(argument);
		break;
	case 'experts':
		runExperts(argument);
		break;
	default:
		fail('用法：commander-cli.mjs <gate|brief|experts> [参数]');
}
