/**
 * Server half of the monitoring panel: read the agent-team state that the
 * host's team plugin keeps on disk and turn it into one small JSON snapshot the
 * sidebar can poll.
 *
 * Read-only by design. The panel never drives a teammate: it shows what the
 * team files already record (member status, task board, the tail of each
 * mailbox), so a stalled expert is visible as a stale timestamp rather than as
 * an optimistic spinner.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Route the client polls. */
export const MONITOR_ROUTE = '/ext/commander/state';
/** Directory the host team plugin writes `<teamId>/team.json` into. */
export const TEAM_STATE_DIR = '.agent-teams';
/** How much of a mailbox message is shown in the panel. */
const PREVIEW_CHARS = 120;
/** How many recent messages per member the panel keeps. */
const RECENT_MESSAGES = 3;

const NON_TERMINAL = new Set(['pending', 'claimed', 'in_progress']);

/** Trim one line of text for display without cutting mid-emoji. */
export function preview(text, limit = PREVIEW_CHARS) {
	const flat = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (flat.length <= limit) return flat;
	return `${Array.from(flat).slice(0, limit).join('')}…`;
}

/** Status of a member derived from its record (falls back to the task board). */
export function memberStatus(member, tasks) {
	if (member.status === 'working') return 'working';
	if (member.status === 'removed') return 'removed';
	const busy = tasks.some(
		(task) => task.assignee === member.name && NON_TERMINAL.has(task.status) && task.status !== 'pending'
	);
	return busy ? 'working' : 'idle';
}

/** Tasks the member is holding right now, newest activity first. */
export function currentTasks(member, tasks) {
	return tasks
		.filter((task) => task.assignee === member.name && NON_TERMINAL.has(task.status) && task.status !== 'pending')
		.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

/** Task-board counts for the team header. */
export function taskCounts(tasks) {
	const counts = { pending: 0, claimed: 0, in_progress: 0, completed: 0, failed: 0, cancelled: 0 };
	for (const task of tasks) {
		if (task.status in counts) counts[task.status] += 1;
	}
	return counts;
}

/** Newest timestamp anywhere on the team record, used as "last touched". */
export function lastTouched(team) {
	const stamps = [team.createdAt ?? 0];
	for (const task of team.tasks ?? []) stamps.push(task.updatedAt ?? task.createdAt ?? 0);
	for (const member of team.members ?? []) stamps.push(member.joinedAt ?? 0);
	return Math.max(...stamps.filter((value) => typeof value === 'number' && Number.isFinite(value)));
}

/**
 * Parse one JSONL mailbox into its newest `limit` entries.
 * @returns messages `{ from, to, ts, content }`, newest last.
 */
export function parseMailbox(text, limit = RECENT_MESSAGES) {
	const messages = [];
	for (const line of String(text ?? '').split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (typeof parsed !== 'object' || parsed === null) continue;
			messages.push({
				from: typeof parsed.from === 'string' ? parsed.from : '?',
				to: typeof parsed.to === 'string' ? parsed.to : '?',
				ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
				content: preview(parsed.content)
			});
		} catch {
			// A half-written line is not a reason to blank the whole panel.
		}
	}
	return messages.slice(-limit);
}

async function readText(file) {
	try {
		return await readFile(file, 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') return undefined;
		throw error;
	}
}

async function readTeamFile(file) {
	const text = await readText(file);
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** Read one team directory into the wire shape the panel consumes. */
export async function readTeam(teamDir, teamId) {
	const team = await readTeamFile(path.join(teamDir, 'team.json'));
	if (team === undefined || typeof team !== 'object') return undefined;
	const tasks = Array.isArray(team.tasks) ? team.tasks : [];
	const members = [];
	for (const member of Array.isArray(team.members) ? team.members : []) {
		if (typeof member?.name !== 'string') continue;
		const inbox = await readText(path.join(teamDir, 'inbox', `${member.name}.jsonl`));
		const messages = parseMailbox(inbox);
		const held = currentTasks(member, tasks);
		members.push({
			name: member.name,
			role: typeof member.role === 'string' ? member.role : '',
			sessionId: typeof member.id === 'string' ? member.id : '',
			status: memberStatus(member, tasks),
			stopping: member.stopping === true,
			spawnError: typeof member.spawnError === 'string' ? member.spawnError : '',
			joinedAt: member.joinedAt ?? 0,
			current: held.map((task) => ({
				id: task.id,
				subject: task.subject,
				status: task.status,
				kind: task.kind ?? 'work',
				updatedAt: task.updatedAt ?? 0
			})),
			done: tasks.filter((task) => task.assignee === member.name && task.status === 'completed').length,
			recent: messages
		});
	}
	members.sort((left, right) => {
		const rank = { working: 0, idle: 1, removed: 2 };
		const delta = (rank[left.status] ?? 3) - (rank[right.status] ?? 3);
		return delta !== 0 ? delta : left.name.localeCompare(right.name);
	});
	return {
		id: teamId,
		name: typeof team.name === 'string' ? team.name : teamId,
		description: typeof team.description === 'string' ? team.description : '',
		halted: team.halted === true,
		phase: team.phase ?? 'running',
		createdAt: team.createdAt ?? 0,
		lastTouched: lastTouched(team),
		counts: taskCounts(tasks),
		tasks: tasks.map((task) => ({
			id: task.id,
			subject: task.subject,
			status: task.status,
			assignee: task.assignee ?? '',
			kind: task.kind ?? 'work',
			updatedAt: task.updatedAt ?? 0
		})),
		members
	};
}

/** Read every team under one workspace's `.agent-teams` directory. */
export async function readWorkspaceTeams(workspacePath) {
	const root = path.join(workspacePath, TEAM_STATE_DIR);
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
		throw error;
	}
	const teams = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const team = await readTeam(path.join(root, entry.name), entry.name);
		if (team !== undefined) teams.push(team);
	}
	teams.sort((left, right) => right.lastTouched - left.lastTouched);
	return teams;
}

/** Whether a workspace has any team state at all (cheap existence probe). */
export async function hasTeams(workspacePath) {
	try {
		const found = await stat(path.join(workspacePath, TEAM_STATE_DIR));
		return found.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Build the whole snapshot the panel polls.
 * @param workspaces - `{ path, title? }[]` candidate workspaces, already trusted.
 * @param now - clock injection for tests.
 */
export async function readMonitorSnapshot(workspaces, now = Date.now()) {
	const out = [];
	for (const workspace of workspaces) {
		const teams = await readWorkspaceTeams(workspace.path);
		if (teams.length === 0) continue;
		out.push({
			path: workspace.path,
			title: workspace.title ?? path.basename(workspace.path),
			teams
		});
	}
	const members = out.reduce(
		(total, group) => total + group.teams.reduce((sum, team) => sum + team.members.length, 0),
		0
	);
	return {
		generatedAt: now,
		workspaces: out,
		totals: {
			workspaces: out.length,
			teams: out.reduce((total, group) => total + group.teams.length, 0),
			members,
			working: out.reduce(
				(total, group) =>
					total +
					group.teams.reduce(
						(sum, team) => sum + team.members.filter((item) => item.status === 'working').length,
						0
					),
				0
			)
		}
	};
}
