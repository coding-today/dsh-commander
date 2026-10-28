/**
 * Single source of truth for values that appear in more than one place:
 * the charter text (injected into every session), the tool defaults, and the
 * error prefix that CONTRIBUTING asks users to grep for.
 */

/** npm package name, also the loader entry id in `cordis.patch.yml`. */
export const PACKAGE_NAME = 'dsh-commander';

/** Every thrown error starts with this, so users can grep one string. */
export const ERROR_PREFIX = 'dsh-commander';

/** Directory (relative to the session cwd) that holds scoreboards and the ledger. */
export const DEFAULT_PLANS_DIR = '.agent/plans';

/** Ledger file name inside `plansDir`. */
export const DEFAULT_LEDGER_FILE = 'commander-ledger.md';

/** Default ceiling for concurrently running tasks in the dispatch gate. */
export const DEFAULT_MAX_CONCURRENCY = 8;

/** Order of the always-on charter section in the system prompt. */
export const DEFAULT_PROMPT_ORDER = 118;

/**
 * Build a prefixed Error. Centralised so the prefix can never drift between
 * modules again.
 * @param message - human readable message without the prefix.
 * @returns an Error whose message starts with `dsh-commander: `.
 */
export function prefixedError(message) {
	return new Error(`${ERROR_PREFIX}: ${message}`);
}
