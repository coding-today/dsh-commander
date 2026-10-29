/**
 * DSH-commander: the "commander" discipline as a DeepSeek Harness plugin.
 *
 * Four contributions:
 * 1. a `commander` skill — the full playbook (roster, scoring, 7-phase workflow,
 *    field notes) registered at runtime so it ships with the plugin version;
 * 2. a system-prompt section — the standing charter that must survive a session
 *    which never loads the skill;
 * 3. four mechanical tools — dispatch gate check, expert roster lookup, on-disk
 *    expert scoreboard and a lesson ledger — so the disciplines that cannot be
 *    enforced by prose at least leave a verifiable artifact on disk;
 * 4. a read-only monitor route plus a web sidebar panel showing what every
 *    expert is doing right now (the host team plugin owns the transport and the
 *    state; this plugin only renders it);
 * 5. the tool calls write through the harness filesystem service, so a
 *    read-only session cannot write and a workspace session cannot escape it.
 *
 * @module dsh-commander
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { buildCharter } from './charter.js';
import {
	DEFAULT_LEDGER_FILE,
	DEFAULT_MAX_CONCURRENCY,
	DEFAULT_PLANS_DIR,
	DEFAULT_PROMPT_ORDER,
	PACKAGE_NAME
} from './defaults.js';
import { checkDispatch, formatDispatchReport } from './dispatch.js';
import { HANDOFF_DIR, buildHandoff, handoffFileName, handoffMessage } from './handoff.js';
import { MONITOR_ROUTE, readMonitorSnapshot } from './monitor.js';
import { formatDelivered, relayMessage } from './relay.js';
import {
	EXPERT_CATALOG,
	EXPERT_DIVISIONS,
	DIVISION_LABELS,
	expertSlugs,
	findExpert,
	formatExpertBrief,
	formatExpertTable,
	listExperts,
	matchExperts
} from './experts.js';
import { archiveFileName, formatLedgerEntry, insertLedgerEntry, ledgerNeedsArchive, rotatedLedger } from './ledger.js';
import {
	aggregateExperts,
	applyAdjustments,
	assertSameTask,
	createScoreboard,
	EVOLUTION_FILE,
	formatEvolution,
	formatScoreboard,
	parseScoreboard,
	SCOREBOARD_SUFFIX,
	scoreboardFileName
} from './scoreboard.js';
import {
	assertSafeRelative,
	listPlansFiles,
	posixDisplay,
	readPlansText,
	resolvePlansDirectory,
	resolvePlansTarget,
	writePlansText
} from './workspace.js';

/** Plugin name, used as the system-prompt section name and the store key. */
export const name = PACKAGE_NAME;

/** Services this plugin needs; `skills`, `systemPrompt`, `fs` and `workingDirectory` are optional. */
export const inject = ['tools'];

/** Bundled skill body, resolved next to this module. */
const SKILL_BODY_PATH = fileURLToPath(new URL('../assets/commander.md', import.meta.url));

/** Tool output contract: one text block. */
const TEXT_OUTPUT = {
	schema: {
		type: 'object',
		additionalProperties: false,
		properties: { text: { type: 'string', required: true } }
	},
	render: (_args, value) => [{ type: 'text', text: value.text }]
};

export const Config = z.object({
	/** Runtime skill name; it shadows a user skill of the same name inside one layer. */
	skillName: z.string().default('commander'),
	/** Skill description shown in the skill catalog. */
	skillDescription: z
		.string()
		.default(
			'指挥官：多角色专家协同作战的总指挥，负责专家团队组建、任务拆解与派发、进度把控与专家调度，并综合各专家意见做出最优判断。'
		),
	/** Register the bundled skill body. */
	registerSkill: z.boolean().default(true),
	/** Inject the standing charter into the system prompt. */
	promptSection: z.boolean().default(true),
	promptOrder: z.number().step(1).default(DEFAULT_PROMPT_ORDER),
	/** Register the commander_* tools. */
	tools: z.boolean().default(true),
	/** Workspace-relative directory for scoreboard and ledger files. */
	plansDir: z.string().default(DEFAULT_PLANS_DIR),
	/** Ledger file name inside {@link plansDir}. */
	ledgerFile: z.string().default(DEFAULT_LEDGER_FILE),
	/** Active subagent ceiling used by the dispatch gate when a call omits one. */
	maxConcurrency: z.number().step(1).min(1).default(DEFAULT_MAX_CONCURRENCY),
	/** Serve the read-only team snapshot the sidebar panel polls. */
	monitor: z.boolean().default(true)
});

/**
 * Resolve the logger the host handed us: `ctx.logger` (object or factory), the
 * `logger` service, or the console in a hand-wired test context.
 * @param ctx - plugin context.
 * @returns a logger-like object.
 */
function resolveLogger(ctx) {
	const direct = ctx.logger;
	if (direct !== undefined && typeof direct.info === 'function') return direct;
	if (typeof direct === 'function') return direct(name);
	const service = typeof ctx.get === 'function' ? ctx.get('logger') : undefined;
	if (service !== undefined && typeof service.info === 'function') return service;
	return console;
}

/** Read the bundled skill body; a broken install degrades instead of killing the row. */
function readSkillBody() {
	if (!existsSync(SKILL_BODY_PATH)) throw new Error(`dsh-commander: 缺少技能正文 ${SKILL_BODY_PATH}`);
	return readFileSync(SKILL_BODY_PATH, 'utf8');
}

/** Register the four commander tools, each in its own effect so a failure disposes cleanly. */
function registerTools(ctx, settings, trace) {
	const resolvePlans = (exec, fileName) => resolvePlansTarget(ctx, { plansDir: settings.plansDir, fileName }, exec);
	const resolveHandoff = (exec, fileName) =>
		resolvePlansTarget(ctx, { plansDir: settings.plansDir, subdir: HANDOFF_DIR, fileName }, exec);
	/** Resolve a roster entry or throw with the candidate list. */
	const requireExpert = (value, label) => {
		const found = findExpert(value);
		if (found !== undefined) return found;
		const candidates = matchExperts(value);
		if (candidates.length > 1) {
			throw new Error(
				`dsh-commander: ${label}「${value}」对应多位专家：${candidates.map((item) => item.slug).join(', ')}。请写完整 slug。`
			);
		}
		throw new Error(`dsh-commander: ${label}「${value}」不在名册里。可用：${expertSlugs().join(', ')}`);
	};

	const dispatchCheck = defineTool({
		name: 'commander_dispatch_check',
		description:
			'跑一遍派发闸门：检查每条任务是否有执行者、可机械判定的验收标准、显式上下游，并核对并发上限、专家名册与写者冲突。有阻断项时不要派发。',
		parameters: {
			tasks: {
				type: 'array',
				items: { type: 'json' },
				required: true,
				description:
					'将要派发的任务数组。每项：{ subject, assignee, role?: impl|review|qa|doc|research, expert?: <名册 slug>, acceptance, dependsOn?: string[]|number[]（数字为 1 起的序号）, files?: string[] }。'
			},
			running: { type: 'integer', description: '当前在跑的活跃子智能体数量（先 list_agents 数）。' },
			maxConcurrency: { type: 'integer', description: `本机并发上限，默认 ${DEFAULT_MAX_CONCURRENCY}。` }
		},
		output: TEXT_OUTPUT,
		isConcurrencySafe: () => true,
		execute: (args) => {
			const result = checkDispatch(args.tasks, {
				running: args.running ?? 0,
				maxConcurrency: args.maxConcurrency ?? settings.maxConcurrency,
				knownExperts: expertSlugs()
			});
			return { text: formatDispatchReport(result) };
		}
	});

	const scoreboard = defineTool({
		name: 'commander_scoreboard',
		description:
			'记分牌：init 建牌、adjust 加减分（必须写理由）、show 读取、evolve 聚合出「指挥官 + 专家进化卡」。' +
			'记分牌不是账本，有三条硬规矩：① init 自动带上 `captain`（指挥官）行，指挥官自己也计分——派发失误扣分、派得对加分；' +
			'② adjust 的 expert 写 `captain` / `指挥官` 就是给指挥官自己记分；' +
			'③ evolve 把两人的历史失分与派发档位回流成下一轮任务书的硬约束，写入 <plansDir>/expert-evolution.md。',
		parameters: {
			action: {
				type: 'string',
				enum: ['init', 'adjust', 'show', 'evolve'],
				required: true,
				description: 'init | adjust | show | evolve（evolve 不需要 task）'
			},
			task: {
				type: 'string',
				description: '任务名，用作文件名与标题。evolve 不需要。'
			},
			experts: {
				type: 'array',
				items: { type: 'json' },
				description: 'init 用：专家列表，字符串或 { name, role }。`captain` 行由工具自动加在最前，不要手填。'
			},
			adjustments: {
				type: 'array',
				items: { type: 'json' },
				description:
					'adjust 用：[{ expert, delta, reason, at? }]，delta 为整数且非 0，reason 必填。expert 写 `captain`（或 `指挥官`）即给指挥官自己记分。'
			}
		},
		output: TEXT_OUTPUT,
		isConcurrencySafe: () => false,
		execute: async (args, exec) => {
			if (args.action === 'evolve') {
				// The evolution card is the only cross-task read: aggregate every
				// scoreboard on disk so this round's dispatch can carry the last
				// round's corrections instead of rediscovering them.
				const directory = await resolvePlansDirectory(ctx, { plansDir: settings.plansDir }, exec);
				const names = await listPlansFiles(directory.fs, directory.target, exec.signal);
				const boards = [];
				const skipped = [];
				for (const name of names) {
					if (!name.endsWith(SCOREBOARD_SUFFIX)) continue;
					const file = await resolvePlans(exec, name);
					const text = await readPlansText(file.fs, file.target, exec.signal);
					if (text === undefined) continue;
					try {
						boards.push(parseScoreboard(text));
					} catch (error) {
						skipped.push(`${name}：${error instanceof Error ? error.message : String(error)}`);
					}
				}
				const card = formatEvolution(aggregateExperts(boards), { plansDir: settings.plansDir });
				const target = await resolvePlans(exec, EVOLUTION_FILE);
				const written = await writePlansText(target.fs, target.target, card, exec.signal);
				const skipNote = skipped.length === 0 ? '' : `\n\n跳过：${skipped.join('；')}`;
				return {
					text: `已生成进化卡：${written}（聚合 ${boards.length} 张记分牌）${skipNote}\n\n${card}`
				};
			}
			const taskName = String(args.task ?? '').trim();
			if (taskName === '') {
				throw new Error(`dsh-commander: commander_scoreboard 的 ${args.action} 需要 task`);
			}
			const { fs, target } = await resolvePlans(exec, scoreboardFileName(taskName));
			const previous = await readPlansText(fs, target, exec.signal);
			if (args.action === 'init') {
				if (previous !== undefined) {
					throw new Error(
						`dsh-commander: 记分牌已存在，用 show 读取或换任务名：${posixDisplay(target.displayPath)}`
					);
				}
				const experts = args.experts ?? [];
				if (experts.length === 0) {
					throw new Error(
						'dsh-commander: commander_scoreboard 的 init 需要 experts：[{ name, role? }]，至少一位'
					);
				}
				const board = createScoreboard({ task: taskName, experts });
				const text = formatScoreboard(board);
				await writePlansText(fs, target, text, exec.signal);
				return { text: `已创建记分牌：${posixDisplay(target.displayPath)}\n\n${text}` };
			}
			if (previous === undefined) {
				throw new Error(`dsh-commander: 找不到记分牌 ${posixDisplay(target.displayPath)}，先 init`);
			}
			const board = assertSameTask(parseScoreboard(previous, taskName), taskName);
			if (args.action === 'show') return { text: formatScoreboard(board) };
			const next = applyAdjustments(board, args.adjustments ?? []);
			const text = formatScoreboard(next);
			await writePlansText(fs, target, text, exec.signal);
			const applied = (args.adjustments ?? [])
				.map(
					(entry) => `${entry.expert} ${Number(entry.delta) > 0 ? '+' : ''}${entry.delta}（${entry.reason}）`
				)
				.join('；');
			return { text: `已记账：${posixDisplay(target.displayPath)}\n${applied}\n\n${text}` };
		}
	});

	const ledger = defineTool({
		name: 'commander_ledger',
		description:
			'把本轮的有效做法 / 踩坑教训 / 新铁律追加到会话工作区的 <plansDir>/<ledgerFile>，最新在最上；超过 256 KiB 自动归档到按月文件。用于让经验跨会话、跨名册丢失存活。',
		parameters: {
			kind: {
				type: 'string',
				enum: ['success', 'failure', 'rule'],
				required: true,
				description: 'success 有效做法 / failure 踩坑 / rule 拟固化铁律'
			},
			title: { type: 'string', required: true, description: '一句话标题，写清是什么情形。' },
			body: { type: 'string', required: true, description: '具体内容：现象、证据、固化的做法。' }
		},
		output: TEXT_OUTPUT,
		isConcurrencySafe: () => false,
		execute: async (args, exec) => {
			const entry = formatLedgerEntry({ kind: args.kind, title: args.title, body: args.body });
			const { fs, target } = await resolvePlans(exec, settings.ledgerFile);
			const previous = await readPlansText(fs, target, exec.signal);
			let next = insertLedgerEntry(previous, entry);
			let archived = '';
			if (ledgerNeedsArchive(next)) {
				const archiveName = archiveFileName(settings.ledgerFile);
				const archive = await resolvePlans(exec, archiveName);
				const archivePrevious = await readPlansText(archive.fs, archive.target, exec.signal);
				await writePlansText(
					archive.fs,
					archive.target,
					`${archivePrevious ?? ''}${previous ?? ''}`,
					exec.signal
				);
				next = rotatedLedger(archiveName, entry);
				archived = `\n旧条目已归档到 ${posixDisplay(archive.target.displayPath)}`;
			}
			const written = await writePlansText(fs, target, next, exec.signal);
			return { text: `已写入台账：${written}${archived}\n\n${entry}` };
		}
	});

	const expert = defineTool({
		name: 'commander_expert',
		description:
			'专家名册：list 看全部（可按 division 过滤），brief 取某个专家的「何时召唤 / 必须给到什么 / 必须交回 / 验收判据 / 禁止动作 / 扣分项」——派发前把这份要求原样写进任务书。',
		parameters: {
			action: {
				type: 'string',
				enum: ['list', 'brief', 'divisions'],
				required: true,
				description: 'list 名册 | brief 单个专家 | divisions 领域概览'
			},
			expert: {
				type: 'string',
				description: 'brief 用：专家 slug（也接受名称/局部匹配；多命中时会要求写得更具体）。'
			},
			division: { type: 'string', enum: EXPERT_DIVISIONS, description: 'list 用：只列某个领域。' }
		},
		output: TEXT_OUTPUT,
		isConcurrencySafe: () => true,
		execute: (args) => {
			if (args.action === 'divisions') {
				const lines = ['## 专家领域', ''];
				for (const division of EXPERT_DIVISIONS) {
					const members = listExperts({ division })
						.map((item) => `\`${item.slug}\``)
						.join(' / ');
					lines.push(`- **${DIVISION_LABELS[division]}**（${division}）：${members}`);
				}
				lines.push('', `合计 ${EXPERT_CATALOG.length} 位专家；用 action=brief + expert=<slug> 取详单。`);
				return { text: lines.join('\n') };
			}
			if (args.action === 'list') {
				const members = listExperts({ division: args.division });
				if (members.length === 0) throw new Error(`dsh-commander: 领域 ${args.division} 下没有专家`);
				return {
					text: [
						`## 专家名册（${members.length} 位）`,
						'',
						formatExpertTable(members),
						'',
						'用 action=brief + expert=<slug> 取该专家的输入/交付/验收/扣分要求。'
					].join('\n')
				};
			}
			const found = findExpert(args.expert);
			if (found === undefined) {
				const candidates = matchExperts(args.expert);
				if (candidates.length > 1) {
					throw new Error(
						`dsh-commander: 「${args.expert}」对应多位专家：${candidates.map((item) => item.slug).join(', ')}。请写完整 slug。`
					);
				}
				throw new Error(`dsh-commander: 名册里没有「${args.expert}」。可用：${expertSlugs().join(', ')}`);
			}
			return { text: formatExpertBrief(found) };
		}
	});

	const handoff = defineTool({
		name: 'commander_handoff',
		description:
			'专家之间的交接单：create 把「从谁到谁、结论、证据、未决项、下一棒要求」写成 <plansDir>/handoffs/ 下的 Markdown，并给出可直接发送的消息正文；加 deliver:true + toMember 时，同时用宿主的 agent_teams_send_message 把这段正文投递给团队成员（不冒充专家，from 由宿主认定）。read 取回交接单。',
		parameters: {
			action: {
				type: 'string',
				enum: ['create', 'read'],
				required: true,
				description: 'create 写交接单 | read 读回'
			},
			task: { type: 'string', required: true, description: '任务名，用作文件名与标题。' },
			from: { type: 'string', description: 'create 用：交出的专家 slug（也接受名称/子串）。' },
			to: { type: 'string', description: 'create 用：接手的专家 slug（会带上其输入要求与验收判据）。' },
			summary: { type: 'string', description: 'create 用：一句话结论，空着会被拒。' },
			evidence: {
				type: 'array',
				items: { type: 'string' },
				description: 'create 用：可复核的证据（命令 + 原始输出摘要）。'
			},
			openItems: { type: 'array', items: { type: 'string' }, description: 'create 用：未决项。' },
			asks: {
				type: 'array',
				items: { type: 'string' },
				description: 'create 用：额外要求，并入「下一棒必须给到」。'
			},
			at: { type: 'string', description: 'create 用：时间戳（默认为现在）。' },
			deliver: {
				type: 'boolean',
				description:
					'create 用：写完交接单后直接投递给 toMember（需要会话里有 agent team 的 agent_teams_send_message）。'
			},
			toMember: {
				type: 'string',
				description: 'deliver 用：投递目标，团队成员名或 captain。'
			}
		},
		output: TEXT_OUTPUT,
		isConcurrencySafe: () => false,
		execute: async (args, exec) => {
			const fromExpert = args.action === 'create' ? requireExpert(args.from, 'from') : undefined;
			const toExpert = args.action === 'create' ? requireExpert(args.to, 'to') : undefined;
			const fileName = handoffFileName({
				task: args.task,
				from: fromExpert?.slug ?? args.from,
				to: toExpert?.slug ?? args.to
			});
			const { fs, target } = await resolveHandoff(exec, fileName);
			const previous = await readPlansText(fs, target, exec.signal);
			if (args.action === 'read') {
				if (previous === undefined) {
					throw new Error(`dsh-commander: 找不到交接单 ${posixDisplay(target.displayPath)}`);
				}
				return { text: previous };
			}
			const at = args.at === undefined ? new Date() : new Date(args.at);
			if (Number.isNaN(at.getTime())) throw new Error('dsh-commander: at 不是合法时间');
			const content = {
				task: args.task,
				from: fromExpert,
				to: toExpert,
				summary: args.summary,
				evidence: args.evidence,
				openItems: args.openItems,
				asks: args.asks,
				at
			};
			const note = buildHandoff(content);
			const written = await writePlansText(fs, target, note, exec.signal);
			const message = handoffMessage({ ...content, path: written });
			let deliveredLine;
			if (args.deliver === true) {
				const value = await relayMessage(ctx.tools, exec, { to: args.toMember, content: message });
				deliveredLine = formatDelivered(value);
			}
			return {
				text: [
					`已写入交接单：${written}`,
					'',
					`--- 可直接发送给 ${toExpert.name} 的消息（send_message / agent_teams_send_message）---`,
					'',
					message,
					'',
					...(deliveredLine === undefined ? [] : ['--- 已投递 ---', '', deliveredLine, '']),
					'--- 交接单全文 ---',
					'',
					note
				].join('\n')
			};
		}
	});

	for (const tool of [dispatchCheck, scoreboard, ledger, expert, handoff]) {
		ctx.effect(() => ctx.tools.register(tool), `dsh-commander: tool ${tool.name}`);
	}
	trace(
		'tools registered: commander_dispatch_check / commander_scoreboard / commander_ledger / commander_expert / commander_handoff'
	);
}

/**
 * Serve the read-only team snapshot that the sidebar panel polls.
 *
 * Optional scope: on a host without a web server (CLI, tests) the panel simply
 * never receives data and nothing else changes. The route only reads
 * `<workspace>/.agent-teams`, and only for workspaces the registry already
 * knows, so a caller cannot point it at an arbitrary directory.
 */
function registerMonitor(ctx, trace) {
	ctx.inject(['webServer', 'workspaceRegistry'], (scope) => {
		const route = {
			kind: 'exact',
			path: MONITOR_ROUTE,
			handler: async (req, res) => {
				if (req.method !== 'GET' && req.method !== 'HEAD') {
					res.writeHead(405, { allow: 'GET, HEAD' });
					res.end();
					return;
				}
				try {
					const workspaces = scope.workspaceRegistry
						.list()
						.map((workspace) => ({ path: workspace.path, title: workspace.title }))
						.filter((workspace) => typeof workspace.path === 'string' && workspace.path !== '');
					const snapshot = await readMonitorSnapshot(workspaces);
					const body = JSON.stringify(snapshot);
					res.writeHead(200, {
						'content-type': 'application/json; charset=utf-8',
						'cache-control': 'no-store',
						'content-length': Buffer.byteLength(body)
					});
					res.end(req.method === 'HEAD' ? undefined : body);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					res.writeHead(500, {
						'content-type': 'application/json; charset=utf-8',
						'cache-control': 'no-store'
					});
					res.end(JSON.stringify({ error: `dsh-commander: ${message}` }));
				}
			}
		};
		scope.effect(() => scope.webServer.register(route), 'dsh-commander: monitor route');
		trace(`monitor route registered at ${MONITOR_ROUTE}`);
	});
}

/**
 * Install the plugin on the Cordis context.
 * @param ctx - plugin context.
 * @param config - loader-resolved configuration.
 */
export function apply(ctx, config = {}) {
	// Defaults live here as well as in `Config`, so a direct `apply(ctx, {})`
	// (tests, hand-wired profiles) behaves exactly like a loader-resolved config.
	const settings = {
		skillName: 'commander',
		skillDescription:
			'指挥官：多角色专家协同作战的总指挥，负责专家团队组建、任务拆解与派发、进度把控与专家调度，并综合各专家意见做出最优判断。',
		registerSkill: true,
		promptSection: true,
		promptOrder: DEFAULT_PROMPT_ORDER,
		tools: true,
		plansDir: DEFAULT_PLANS_DIR,
		ledgerFile: DEFAULT_LEDGER_FILE,
		monitor: true,
		...config,
		maxConcurrency: config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY
	};
	const log = resolveLogger(ctx);
	// Opt-in boot trace: a plugin that registers no visible surface is otherwise
	// indistinguishable from one that failed to mount. It writes straight to
	// stderr because the host's logger filters `info` at boot, so
	// `2>&1 | grep dsh-commander` must not depend on log level.
	const trace = (line) => {
		if (process.env.DSH_COMMANDER_TRACE !== '1') return;
		process.stderr.write(`[dsh-commander] ${line}\n`);
	};

	try {
		settings.plansDir = assertSafeRelative(settings.plansDir, 'plansDir');
	} catch (error) {
		log.warn?.(`${error.message}；回退到 ${DEFAULT_PLANS_DIR}`);
		settings.plansDir = DEFAULT_PLANS_DIR;
	}
	try {
		settings.ledgerFile = assertSafeRelative(settings.ledgerFile, 'ledgerFile', { allowSegments: false });
	} catch (error) {
		log.warn?.(`${error.message}；回退到 ${DEFAULT_LEDGER_FILE}`);
		settings.ledgerFile = DEFAULT_LEDGER_FILE;
	}

	if (settings.registerSkill) {
		const skills = ctx.get('skills');
		if (skills === undefined) {
			log.warn?.('skills service unavailable; commander skill not registered');
		} else {
			let body;
			try {
				body = readSkillBody();
			} catch (error) {
				log.warn?.(`${error.message}；跳过技能注册，纪律段与工具仍可用`);
			}
			if (body !== undefined) {
				const whenToUse =
					'当用户说「指挥官」「指挥专家们」「多专家协作」「组个专家团队」「让几个专家一起做」「派专家干活」「综合专家意见」「专家们一起搞定这个功能」或要求多角色协同完成一个功能点时使用。';
				ctx.effect(
					() =>
						skills.register({
							name: settings.skillName,
							description: settings.skillDescription,
							whenToUse,
							content: body,
							source: 'runtime',
							path: SKILL_BODY_PATH
						}),
					'dsh-commander: register skill'
				);
				trace(`skill "${settings.skillName}" registered (${body.length} chars) from ${SKILL_BODY_PATH}`);
			}
		}
	}

	if (settings.promptSection) {
		const systemPrompt = ctx.get('systemPrompt');
		if (systemPrompt === undefined) {
			log.warn?.('systemPrompt service unavailable; commander charter not injected');
		} else {
			const text = buildCharter({
				maxConcurrency: settings.maxConcurrency,
				plansDir: settings.plansDir,
				ledgerFile: settings.ledgerFile
			});
			ctx.effect(
				() =>
					systemPrompt.section({
						name: `${name}-charter`,
						order: settings.promptOrder,
						text,
						interpolate: false
					}),
				'dsh-commander: charter section'
			);
		}
	}

	if (settings.tools) {
		registerTools(ctx, settings, trace);
	}

	if (settings.monitor) registerMonitor(ctx, trace);

	trace(`mounted (skill=${settings.registerSkill} charter=${settings.promptSection} tools=${settings.tools})`);
}
