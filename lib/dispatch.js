/**
 * Pure dispatch review for the commander plugin.
 *
 * The commander skill states a "dispatch gate": before an expert is sent out,
 * the task must name an owner, an acceptance criterion, and its upstream. That
 * rule is worth enforcing mechanically because a dropped field is silent — the
 * expert starts, produces nothing verifiable, and the round is lost. This
 * module turns the gate into a deterministic check the model can run and the
 * human can audit.
 *
 * @module dsh-commander/dispatch
 */

/** Roles the gate understands. Unknown roles are treated as `impl`. */
export const ROLES = ['impl', 'review', 'qa', 'doc', 'research'];

/** Default active-child limit on a single machine. */
export const DEFAULT_MAX_CONCURRENCY = 8;

const KNOWN_ROLES = new Set(ROLES);

/**
 * Check one dispatch batch against the gate.
 * @param tasks - tasks about to be dispatched.
 * @param options - current running count and the concurrency ceiling.
 * @returns `{ ok, violations, warnings, counts }` where violations block.
 */
export function checkDispatch(tasks, { running = 0, maxConcurrency = DEFAULT_MAX_CONCURRENCY, knownExperts } = {}) {
	if (!Array.isArray(tasks)) throw new Error('dsh-commander: tasks 必须是数组');
	if (!Number.isInteger(running) || running < 0) throw new Error('dsh-commander: running 必须是非负整数');
	if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1)
		throw new Error('dsh-commander: maxConcurrency 必须是正整数');

	const knownSet = Array.isArray(knownExperts) ? new Set(knownExperts.map((slug) => String(slug).trim())) : undefined;
	const violations = [];
	const warnings = [];
	const push = (bucket, code, index, subject, message, fix) => {
		bucket.push({ code, index, subject, message, fix });
	};

	const normalized = tasks.map((raw, index) => {
		const task = raw ?? {};
		const subject = String(task.subject ?? '').trim();
		if (subject === '') throw new Error(`dsh-commander: 第 ${index + 1} 个任务缺少 subject`);
		const role = KNOWN_ROLES.has(task.role) ? task.role : 'impl';
		const files = Array.isArray(task.files) ? task.files.map((file) => String(file).trim()).filter(Boolean) : [];
		const dependsOn = Array.isArray(task.dependsOn) ? task.dependsOn : [];
		return {
			index,
			subject,
			role,
			assignee: String(task.assignee ?? '').trim(),
			expert: String(task.expert ?? '').trim(),
			acceptance: String(task.acceptance ?? '').trim(),
			files,
			dependsOn
		};
	});

	for (const task of normalized) {
		if (task.assignee === '') {
			push(
				violations,
				'D1_no_assignee',
				task.index,
				task.subject,
				'没有指定执行者，任务落共享池等于没人认领。',
				'写明 assignee（专家名/teammate target）。'
			);
		}
		if (task.acceptance === '') {
			push(
				violations,
				'D2_no_acceptance',
				task.index,
				task.subject,
				'没有验收标准，交付物无法判定完成。',
				'写出可机械验证的验收标准（命令 + 期望输出，或文件清单）。'
			);
		}
		if (task.role === 'review' && task.dependsOn.length === 0) {
			push(
				violations,
				'D3_review_without_upstream',
				task.index,
				task.subject,
				'审查任务没有上游，审查者拿不到被审对象。',
				'用 dependsOn 指明被审任务的序号或标题。'
			);
		}
		if (knownSet !== undefined) {
			if (task.expert === '') {
				push(
					warnings,
					'W4_no_expert',
					task.index,
					task.subject,
					'没有点名专家，该专家的输入要求与验收判据不会被带进任务书。',
					'写 expert（slug），并先用 commander_expert brief 取该专家的要求。'
				);
			} else if (!knownSet.has(task.expert)) {
				push(
					violations,
					'D6_unknown_expert',
					task.index,
					task.subject,
					`专家 ${task.expert} 不在名册里，无法确认其交付物与判据。`,
					'用 commander_expert list 查可用 slug；要新增专家先补名册。'
				);
			}
		}
		if (task.role === 'impl' && task.files.length === 0) {
			push(
				warnings,
				'W1_no_files',
				task.index,
				task.subject,
				'实现任务没有声明影响面文件。',
				'写 files（受影响文件或目录），便于做写者冲突检查。'
			);
		}
	}

	// Self-review: the author of an upstream task must not be its reviewer.
	for (const task of normalized) {
		if (task.role !== 'review') continue;
		for (const upstreamRef of task.dependsOn) {
			const upstream = findTask(normalized, upstreamRef);
			// An unresolved reference, or one that points at the task itself, is not
			// an author/reviewer pair: D4 must not fire on either.
			if (upstream === undefined || upstream.index === task.index) continue;
			if (upstream.assignee !== '' && upstream.assignee === task.assignee) {
				push(
					violations,
					'D4_self_review',
					task.index,
					task.subject,
					`审查者 ${task.assignee} 就是被审任务 ${upstream.subject} 的作者。`,
					'换一名独立审查者（作者自审不算审查）。'
				);
			}
		}
	}

	// Write conflicts inside the batch: two implementers on one file.
	const owners = new Map();
	for (const task of normalized) {
		if (task.role !== 'impl') continue;
		for (const file of task.files) {
			const previous = owners.get(file);
			if (previous !== undefined && previous.assignee !== task.assignee) {
				push(
					warnings,
					'W2_write_conflict',
					task.index,
					task.subject,
					`文件 ${file} 同时被 ${previous.assignee || previous.subject} 与 ${task.assignee || task.subject} 声明。`,
					'按文件划界，一个文件一个写者；或改成依赖串行。'
				);
			}
			if (previous === undefined) owners.set(file, task);
		}
	}

	if (normalized.length > 1 && normalized.every((task) => task.dependsOn.length === 0)) {
		push(
			warnings,
			'W3_no_dependencies',
			-1,
			'(整批)',
			'整批任务没有任何依赖声明，可能把本应串行的工作并行掉了。',
			'确认每条任务的上下游；审查/验收类任务必须依赖实现任务。'
		);
	}

	if (running + normalized.length > maxConcurrency) {
		push(
			violations,
			'D5_over_concurrency',
			-1,
			'(整批)',
			`并发会超限：在跑 ${running} + 本批 ${normalized.length} > 上限 ${maxConcurrency}。`,
			'先排队，按优先级占满补位；不要一次派超过上限。'
		);
	}

	return {
		ok: violations.length === 0,
		violations,
		warnings,
		counts: {
			tasks: normalized.length,
			violations: violations.length,
			warnings: warnings.length,
			running,
			maxConcurrency,
			expertChecked: knownSet !== undefined
		}
	};
}

/**
 * Resolve a dependency reference: a task subject, or a 1-based position in the
 * batch (matching how a human counts the list in a task book).
 * @param tasks - normalized batch.
 * @param ref - subject string or 1-based number.
 * @returns the referenced task, or undefined.
 */
function findTask(tasks, ref) {
	if (typeof ref === 'number') {
		if (!Number.isInteger(ref) || ref < 1) return undefined;
		return tasks[ref - 1];
	}
	const text = String(ref ?? '').trim();
	if (text === '') return undefined;
	const bySubject = tasks.find((task) => task.subject === text);
	if (bySubject !== undefined) return bySubject;
	const numeric = Number(text);
	if (Number.isInteger(numeric) && numeric >= 1) return tasks[numeric - 1];
	return undefined;
}

/**
 * Render a dispatch review as the text a tool returns.
 * @param result - value from {@link checkDispatch}.
 * @returns human/model readable report.
 */
export function formatDispatchReport(result) {
	const lines = [];
	lines.push(result.ok ? '派发闸门：通过（无阻断项）' : `派发闸门：未通过（${result.violations.length} 项阻断）`);
	lines.push(`任务 ${result.counts.tasks} 条 · 在跑 ${result.counts.running} / 上限 ${result.counts.maxConcurrency}`);
	if (result.violations.length > 0) {
		lines.push('', '阻断：');
		for (const item of result.violations)
			lines.push(`- [${item.code}] ${item.subject}：${item.message} → ${item.fix}`);
	}
	if (result.warnings.length > 0) {
		lines.push('', '提醒：');
		for (const item of result.warnings)
			lines.push(`- [${item.code}] ${item.subject}：${item.message} → ${item.fix}`);
	}
	return lines.join('\n');
}
