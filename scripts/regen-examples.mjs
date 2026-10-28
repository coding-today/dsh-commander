#!/usr/bin/env node
/**
 * Regenerate `examples/gate-output*.txt` from the real gate implementation.
 *
 * Run this after touching `lib/dispatch.js` or the example batches; the test
 * suite compares the files byte-for-byte, so a stale output shows up as a red
 * test instead of a wrong README.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { checkDispatch, formatDispatchReport } from '../lib/dispatch.js';
import { expertSlugs } from '../lib/experts.js';

const PAIRS = [
	['examples/dispatch-batch.json', 'examples/gate-output.txt'],
	['examples/dispatch-batch-blocked.json', 'examples/gate-output-blocked.txt']
];

for (const [input, output] of PAIRS) {
	const payload = JSON.parse(readFileSync(input, 'utf8'));
	const result = checkDispatch(payload.tasks ?? [], {
		running: payload.running ?? 0,
		maxConcurrency: payload.maxConcurrency,
		knownExperts: expertSlugs()
	});
	const rendered = `${formatDispatchReport(result).trim()}\n`;
	const checkOnly = process.argv.includes('--check');
	const current = existsSync(output) ? readFileSync(output, 'utf8') : '';
	if (checkOnly) {
		if (current !== rendered) {
			process.stderr.write(`${output}: 与实现输出不一致，重跑 node scripts/regen-examples.mjs\n`);
			process.exitCode = 1;
		}
		continue;
	}
	writeFileSync(output, rendered);
	process.stdout.write(`${output}: ok=${result.ok} violations=${result.violations.length}\n`);
}
