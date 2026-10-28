#!/usr/bin/env node
/**
 * One command that mirrors CI, with no pnpm-specific assumptions so it also
 * works when a contributor only has npm (or a plain node).
 *
 * Steps: eslint → prettier --check → roster sync → examples sync → tests.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const STEPS = [
	{ label: 'lint', command: 'npx', args: ['--no-install', 'eslint', '.'] },
	{ label: 'format', command: 'npx', args: ['--no-install', 'prettier', '--check', '.'] },
	{ label: 'roster', command: 'node', args: ['scripts/render-roster.mjs', '--check'] },
	{ label: 'examples', command: 'node', args: ['scripts/regen-examples.mjs', '--check'] },
	{ label: 'test', command: 'node', args: ['--test', 'test/*.test.mjs'] }
];

for (const step of STEPS) {
	process.stdout.write(`\n▶ ${step.label}\n`);
	const result = spawnSync(step.command, step.args, { stdio: 'inherit' });
	if (result.status !== 0) {
		process.stderr.write(`\n✗ ${step.label} 失败（exit ${result.status ?? 'signal'}）\n`);
		process.exit(result.status ?? 1);
	}
}
process.stdout.write('\n✓ 全部通过\n');
