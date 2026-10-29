#!/usr/bin/env node
/**
 * One command that mirrors CI, with no pnpm-specific assumptions so it also
 * works when a contributor only has npm (or a plain node).
 *
 * Steps: eslint → prettier --check → roster sync → examples sync → tests.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

// On Windows `npx` is `npx.cmd` and Node does not apply PATHEXT when spawning,
// so a bare `spawnSync('npx', ...)` fails with ENOENT. Going through the platform
// shell fixes that; POSIX keeps spawning directly so no quoting is introduced.
const USE_SHELL = process.platform === 'win32';

const STEPS = [
	{ label: 'lint', command: 'npx', args: ['--no-install', 'eslint', '.'] },
	{ label: 'format', command: 'npx', args: ['--no-install', 'prettier', '--check', '.'] },
	{ label: 'roster', command: 'node', args: ['scripts/render-roster.mjs', '--check'] },
	{ label: 'examples', command: 'node', args: ['scripts/regen-examples.mjs', '--check'] },
	{ label: 'test', command: 'node', args: ['--test', 'test/*.test.mjs'] }
];

for (const step of STEPS) {
	process.stdout.write(`\n▶ ${step.label}\n`);
	const result = spawnSync(step.command, step.args, { stdio: 'inherit', shell: USE_SHELL });
	if (result.status !== 0) {
		process.stderr.write(`\n✗ ${step.label} 失败（exit ${result.status ?? 'signal'}）\n`);
		process.exit(result.status ?? 1);
	}
}
process.stdout.write('\n✓ 全部通过\n');
