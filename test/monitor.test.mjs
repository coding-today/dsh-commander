import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	hasTeams,
	memberStatus,
	parseMailbox,
	preview,
	readMonitorSnapshot,
	readWorkspaceTeams,
	taskCounts
} from '../lib/monitor.js';

function withWorkspace(build) {
	const root = mkdtempSync(path.join(tmpdir(), 'commander-monitor-'));
	build(root);
	return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeTeam(root, teamId, team, inbox = {}) {
	const dir = path.join(root, '.agent-teams', teamId);
	mkdirSync(path.join(dir, 'inbox'), { recursive: true });
	writeFileSync(path.join(dir, 'team.json'), JSON.stringify(team), 'utf8');
	for (const [name, lines] of Object.entries(inbox)) {
		writeFileSync(path.join(dir, 'inbox', `${name}.jsonl`), lines.join('\n'), 'utf8');
	}
}

const TEAM = {
	name: '支付重构',
	id: 'team-1',
	captainSessionId: 's-captain',
	createdAt: 1_700_000_000_000,
	members: [
		{ id: 's-qa', name: 'qa', role: '测试', status: 'working', joinedAt: 1_700_000_001_000 },
		{ id: 's-arch', name: 'arch', role: '架构', status: 'idle', joinedAt: 1_700_000_002_000 }
	],
	tasks: [
		{ id: 't1', subject: '退款状态机', status: 'in_progress', assignee: 'qa', updatedAt: 1_700_000_010_000 },
		{ id: 't2', subject: '拆长事务', status: 'completed', assignee: 'arch', updatedAt: 1_700_000_020_000 },
		{ id: 't3', subject: '写验收报告', status: 'pending', updatedAt: 1_700_000_030_000 }
	]
};

test('a member holding a live task reads as working', () => {
	const tasks = TEAM.tasks;
	assert.equal(memberStatus({ name: 'qa', status: 'idle' }, tasks), 'working');
	assert.equal(memberStatus({ name: 'arch', status: 'idle' }, tasks), 'idle');
	assert.equal(memberStatus({ name: 'ghost', status: 'removed' }, tasks), 'removed');
});

test('counts cover every status once', () => {
	assert.deepEqual(taskCounts(TEAM.tasks), {
		pending: 1,
		claimed: 0,
		in_progress: 1,
		completed: 1,
		failed: 0,
		cancelled: 0
	});
});

test('mailbox parsing keeps the newest messages and survives a broken line', () => {
	const text = [
		JSON.stringify({ from: 'qa', to: 'captain', ts: 1, content: '开始跑了' }),
		'{ not json',
		JSON.stringify({ from: 'qa', to: 'captain', ts: 2, content: '3 failed / 12 passed' }),
		''
	].join('\n');
	const messages = parseMailbox(text, 1);
	assert.equal(messages.length, 1);
	assert.equal(messages[0].ts, 2);
	assert.match(messages[0].content, /3 failed/);
});

test('preview flattens newlines and truncates with an ellipsis', () => {
	assert.equal(preview('a\n b   c'), 'a b c');
	assert.equal(preview('x'.repeat(200)).endsWith('…'), true);
});

test('a workspace without team state reads as empty, not as an error', async () => {
	const { root, cleanup } = withWorkspace(() => {});
	try {
		assert.equal(await hasTeams(root), false);
		assert.deepEqual(await readWorkspaceTeams(root), []);
	} finally {
		cleanup();
	}
});

test('teams read with members, current tasks and mailbox tails', async () => {
	const { root, cleanup } = withWorkspace((dir) =>
		writeTeam(dir, 'team-1', TEAM, {
			qa: [
				JSON.stringify({ from: 'captain', to: 'qa', ts: 5, content: '先跑退款用例' }),
				JSON.stringify({ from: 'qa', to: 'captain', ts: 6, content: '退款用例 3 红' })
			]
		})
	);
	try {
		const teams = await readWorkspaceTeams(root);
		assert.equal(teams.length, 1);
		const team = teams[0];
		assert.equal(team.name, '支付重构');
		assert.equal(team.counts.in_progress, 1);
		// working members sort first
		assert.deepEqual(
			team.members.map((member) => member.name),
			['qa', 'arch']
		);
		const qa = team.members[0];
		assert.equal(qa.status, 'working');
		assert.deepEqual(
			qa.current.map((task) => task.subject),
			['退款状态机']
		);
		assert.equal(qa.done, 0);
		assert.equal(qa.recent.length, 2);
		assert.match(qa.recent.at(-1).content, /退款用例 3 红/);
		assert.equal(team.members[1].done, 1);
	} finally {
		cleanup();
	}
});

test('a team.json that cannot be parsed is skipped instead of crashing', async () => {
	const { root, cleanup } = withWorkspace((dir) => {
		mkdirSync(path.join(dir, '.agent-teams', 'broken'), { recursive: true });
		writeFileSync(path.join(dir, '.agent-teams', 'broken', 'team.json'), '{ nope', 'utf8');
	});
	try {
		assert.deepEqual(await readWorkspaceTeams(root), []);
	} finally {
		cleanup();
	}
});

test('the snapshot totals what the panel shows', async () => {
	const { root, cleanup } = withWorkspace((dir) => writeTeam(dir, 'team-1', TEAM));
	const empty = mkdtempSync(path.join(tmpdir(), 'commander-empty-'));
	try {
		const snapshot = await readMonitorSnapshot(
			[
				{ path: root, title: '支付' },
				{ path: empty, title: '空' }
			],
			1_700_000_100_000
		);
		assert.equal(snapshot.generatedAt, 1_700_000_100_000);
		assert.equal(snapshot.workspaces.length, 1, 'workspaces without teams are dropped');
		assert.deepEqual(snapshot.totals, { workspaces: 1, teams: 1, members: 2, working: 1 });
	} finally {
		cleanup();
		rmSync(empty, { recursive: true, force: true });
	}
});
