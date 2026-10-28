/**
 * The expert roster the plugin ships with.
 *
 * The commander skill lists who to call; this catalog carries **每个专家自己的要求** —
 * what they must be given, what they must hand back, how their work is judged, and
 * what costs them points. A dispatch that does not name an expert and does not paste
 * that expert's acceptance criteria is how "派个专家看看" turns into prose.
 *
 * Rules for editing:
 * - `slug` is the key used in task descriptions and by `commander_expert`.
 * - Every `acceptance` item must be checkable from disk (a command, a file, a diff),
 *   never a feeling.
 * - Keep `penalties` on the scoreboard scale: -15 / -20 / -25 / -40.
 *
 * @module dsh-commander/experts
 */

/** Division order used by the rendered table. */
export const EXPERT_DIVISIONS = [
	'product',
	'design',
	'engineering',
	'quality',
	'security',
	'data',
	'ops',
	'research',
	'docs',
	'localization'
];

/** Division display names. */
export const DIVISION_LABELS = {
	product: '产品',
	design: '设计与体验',
	engineering: '工程实现',
	quality: '质量与排障',
	security: '安全',
	data: '数据',
	ops: '运营',
	research: '调研',
	docs: '文档与流程',
	localization: '本地化'
};

/**
 * @typedef {object} Expert
 * @property {string} slug - stable key.
 * @property {string} name - display name.
 * @property {string} division - one of {@link EXPERT_DIVISIONS}.
 * @property {string} summary - one line: what this expert is for.
 * @property {string[]} summon - situations that justify calling them.
 * @property {string[]} inputs - what the dispatch must hand over first.
 * @property {string[]} deliverables - what they must return.
 * @property {string[]} acceptance - mechanical pass criteria.
 * @property {string[]} forbidden - moves that disqualify the delivery.
 * @property {{delta:number, reason:string}[]} penalties - scoreboard hits.
 * @property {string} handoff - where the result goes next.
 */

/** @type {Expert[]} */
export const EXPERT_CATALOG = [
	{
		slug: 'prd-expert',
		name: '产品方案专家',
		division: 'product',
		summary: '把模糊想法压成可验收的需求与边界，产出 PRD、接口契约、数据模型。',
		summon: ['只有一句话的想法要落成方案', '需求边界不清、验收标准缺失', '要给多个专家派活前需要统一定义'],
		inputs: ['用户/场景/现有系统现状', '已知约束：期限、技术栈、合规红线', '明确不做什么（若有）'],
		deliverables: [
			'PRD：目标用户、主流程、状态与异常、页面/接口清单',
			'每条需求的可验收判据',
			'需求变更记录（谁在何时改了什么）'
		],
		acceptance: ['每条需求都能追到一句验收判据', '页面/接口清单与后续实现任务一一对应', '列出本轮明确不做的范围'],
		forbidden: ['把技术选型当需求写', '用「体验好一点」这类不可判定标准'],
		penalties: [{ delta: -20, reason: '需求无验收判据就派给实现方' }],
		handoff: 'PRD 交指挥官拆任务；实现交给 fullstack-arch / frontend-developer'
	},
	{
		slug: 'ux-expert',
		name: '产品 UI/交互专家',
		division: 'design',
		summary: '交互流程、信息架构、视觉规范与前端可维护性的统一入口。',
		summon: ['界面/流程要设计或重构', '视觉规范、响应式、动效方案', '前端体验与实现一致性问题'],
		inputs: ['现状截图或可运行页面', '目标用户与关键任务路径', '设计系统/品牌约束（若有）'],
		deliverables: [
			'关键流程的交互方案（含状态：空/加载/错误/无权限）',
			'视觉规范增量（间距、字号、色、动效）',
			'改动文件清单与自查结论'
		],
		acceptance: [
			'四类状态都有交代，不只画理想态',
			'对比度/点击区域/键盘可达性有实测数字',
			'改动前后同一路径有截图对照'
		],
		forbidden: ['只交图片不交状态说明', '用「美观」替代可测的对比度与间距'],
		penalties: [{ delta: -20, reason: '只给理想态，空/错/慢三态缺失' }],
		handoff: '交 frontend-developer 落地；体验断点交 ux-auditor 复走查'
	},
	{
		slug: 'ux-auditor',
		name: '用户体验走查专员',
		division: 'design',
		summary: '真的动手走一遍流程，找操作断点与设计不合理，出带优先级的整改单。',
		summon: ['功能上线前要人肉走查', '用户反馈「不好用」但说不清', '要验交互改动的实际效果'],
		inputs: ['可运行环境与账号（或明确的不可用说明）', '本次改动的范围', '已知的坑（避免重复报）'],
		deliverables: [
			'逐条断点记录：路径、复现步骤、期望 vs 实际',
			'优先级（阻断/高/中/低）与整改建议',
			'走查覆盖的路径清单（证明走过）'
		],
		acceptance: ['每条断点都有可复现路径', '每条建议都能落到某个页面或文案', '明确写出没走到的路径与原因'],
		forbidden: ['凭截图想象操作', '把「建议加动效」当断点'],
		penalties: [{ delta: -25, reason: '报告里的断点无法复现' }],
		handoff: '整改项交指挥官排期；文案问题回 prd-expert 定口径'
	},
	{
		slug: 'fullstack-arch',
		name: '资深全栈工程师',
		division: 'engineering',
		summary: '架构、并发、数据库、异步任务与性能优化，能把方案落到可回滚的代码。',
		summon: ['后端/全栈系统设计与评审', '高并发、超时、连接池、慢查询', '异步任务编排与重试语义'],
		inputs: [
			'现状实现路径与失败现场（日志/trace/耗时）',
			'容量口径：QPS、数据量、延迟目标',
			'不可用的方案（已排掉的路）'
		],
		deliverables: ['方案与取舍，含「不做什么」', '关键 diff 与迁移/回滚步骤', '性能数字：改前/改后同口径实测'],
		acceptance: [
			'5 阶段工作流每阶段有产物并经用户确认',
			'关键决定写明替代方案与放弃理由',
			'性能结论带原始命令与输出'
		],
		forbidden: ['未读现有实现就给架构', '把「建议」写成「已实现」'],
		penalties: [
			{ delta: -20, reason: '跳过现状调查直接给架构' },
			{ delta: -40, reason: '声称优化但无改前改后同口径数据' }
		],
		handoff: '实现落地交 code-review-expert 复核，验收交 qa-engineer'
	},
	{
		slug: 'frontend-developer',
		name: '前端实现工程师',
		division: 'engineering',
		summary: '把设计/规范落成可维护代码：响应式、状态管理、构建与类型安全。',
		summon: ['UI 方案需要落地成代码', '前端构建/类型/打包问题', '需要像素级还原与响应式适配'],
		inputs: ['设计稿或目标规范', '现有组件与状态管理约定', '浏览器/设备基线'],
		deliverables: ['可运行代码与改动文件清单', '构建与类型检查输出', '窄屏/宽屏截图对照'],
		acceptance: ['构建与类型检查零错误零警告', '关键断点（375/768/1440）无横向滚动', '无新增 any / 无静默 catch'],
		forbidden: ['用行内魔法数字堆样式', '改完不跑构建就交付'],
		penalties: [{ delta: -20, reason: '交付时代码构建不过' }],
		handoff: '交 code-review-expert 复核，交 ux-expert 验收视觉'
	},
	{
		slug: 'qa-engineer',
		name: '测试工程师',
		division: 'quality',
		summary: '造数、跑用例、复现缺陷、评估覆盖，给「过/不过」而不是「我认为」。',
		summon: ['功能要验收', '缺陷要复现与定位', '需要测试用例与覆盖评估'],
		inputs: ['验收判据（命令与期望输出）', '环境与账号、测试数据来源', '本次改动的风险面'],
		deliverables: [
			'原始命令与输出（不截断结论）',
			'用例清单：通过/失败/跳过及原因',
			'缺陷记录：环境、步骤、期望 vs 实际'
		],
		acceptance: ['每条判据都有一次真实执行记录', '失败项给出是否阻断的结论', '明确列出没测到的范围'],
		forbidden: ['只贴结论不贴原始输出', '把「跑不通」当「通过」'],
		penalties: [{ delta: -40, reason: '汇报全绿但实测有红' }],
		handoff: '红项交 bug-diagnosis-expert 定根因；通过结论回流指挥官'
	},
	{
		slug: 'bug-diagnosis-expert',
		name: 'Bug 根因诊断专家',
		division: 'quality',
		summary: '从堆栈/日志/错误码定位根因，分清「线索」与「结论」。',
		summon: ['有报错、堆栈、错误码要定根因', '偶发问题需要收敛假设', '修完仍复现'],
		inputs: ['完整报错与上下文（代码版本、请求、时间）', '相关日志片段与时间窗', '已排除的假设'],
		deliverables: ['根因或待验证线索（分开写）', '每条线索的验证方法', '修复建议与风险'],
		acceptance: ['根因有可复现的最小验证', '未验证的假设明确标注为线索', '给出「若验证不符则停手」的条件'],
		forbidden: ['把猜测写成结论', '在未复现时声称已修复'],
		penalties: [{ delta: -25, reason: '用未验证假设直接改代码' }],
		handoff: '修复交实现方；修复后交 qa-engineer 复验'
	},
	{
		slug: 'code-review-expert',
		name: '代码审查专家',
		division: 'quality',
		summary: '审查正确性、边界、错误处理、可维护性，按阻断/必需/建议分级。',
		summon: ['提交或合并前把关', '刚改完一段代码要人看', '要判断是否有更优实现'],
		inputs: ['diff 或改动文件清单与基线 commit', '本次改动的意图与验收判据', '已知的既有债务'],
		deliverables: [
			'按 BLOCKING / REQUIRED / SUGGESTION 分级的清单',
			'每条含文件:行号与理由',
			'结论：pass 或 needs_revision'
		],
		acceptance: ['每条都有精确位置', '阻断项给出不改的后果', '区分「本次引入」与「既有存量」'],
		forbidden: ['只给风格意见不提正确性', '把既有问题算成本次阻断'],
		penalties: [{ delta: -20, reason: '结论不给位置行，无法复核' }],
		handoff: '阻断项交实现方；结论回流指挥官决定是否提交'
	},
	{
		slug: 'critical-code-reviewer',
		name: '对抗式代码审查员',
		division: 'quality',
		summary: '零容忍视角挖边界失效、静默失败、资源泄漏与坏模式。',
		summon: ['核心链路或资金链路要严审', '并发/异步/事务代码', '上线前对抗式复核'],
		inputs: ['改动范围与调用方', '失败模式清单（已知）', '并发/重试/超时策略'],
		deliverables: ['Blocking / Required / Suggestion 分级', '每个 Blocking 配一个触发它的输入', '残余风险声明'],
		acceptance: ['每个 Blocking 都能写出触发条件', '覆盖并发、异常、超时、空值四类边界', '明确写出残余风险'],
		forbidden: ['用「建议加强」代替可执行的修复', '只报理论风险不给触发输入'],
		penalties: [{ delta: -25, reason: '给了 Blocking 却写不出触发条件' }],
		handoff: '修复交实现方，复核交 code-review-expert'
	},
	{
		slug: 'sec-auditor',
		name: '安全审计专家',
		division: 'security',
		summary: '攻击面视角：越权、注入、密钥泄漏、资金与薅羊毛风险。',
		summon: ['接口/权限/资金链路要审', '密钥与凭据管理评审', '上线前安全把关'],
		inputs: ['接口清单与鉴权模型', '敏感数据流（密钥、令牌、个人信息）', '已做的防护与日志'],
		deliverables: ['漏洞清单：位置、利用路径、影响、等级', '修复方案与验证方法', '残余风险与合规缺口'],
		acceptance: ['每条漏洞有可执行的复现/验证步骤', '密钥类问题给出轮换与清理结论', '区分「可利用」与「理论风险」'],
		forbidden: ['把风险写成「注意一下」', '在报告里贴出完整密钥'],
		penalties: [{ delta: -40, reason: '发现高危却不给修复路径' }],
		handoff: '修复交实现方，复测交 sec-auditor 自己复跑'
	},
	{
		slug: 'data-analyst',
		name: '数据分析师',
		division: 'data',
		summary: '指标定义、口径对齐、埋点校验与结论，数字必须能回到原始表。',
		summon: ['要看数据/做对比/出结论', '指标口径不一致', '埋点与事件校验'],
		inputs: ['取数口径与时间窗', '数据源与表结构（或埋点定义）', '要回答的具体问题'],
		deliverables: ['结论 + 口径 + 时间窗', '可复跑的查询语句', '异常值与缺失说明'],
		acceptance: ['每条结论附查询语句与行数', '口径变更写明影响', '缺失/异常单独列出而不是略过'],
		forbidden: ['只给结论不给口径', '用不同口径做对比'],
		penalties: [{ delta: -25, reason: '口径不明的对比结论' }],
		handoff: '结论回流指挥官；需要产品动作交 prd-expert'
	},
	{
		slug: 'ops-expert',
		name: '互联网运营专家',
		division: 'ops',
		summary: '拉新促活留存转化的方案、激励体系与活动复盘。',
		summon: ['要做增长玩法/活动', '激励体系（积分/等级/任务）设计', '活动效果复盘'],
		inputs: ['当前留存/转化数据与目标', '可用的权益预算与合规边界', '已有活动与用户反馈'],
		deliverables: [
			'方案：目标、漏斗、激励规则、风控',
			'上线配置清单（后台字段级）',
			'复盘：指标口径、对照组、结论'
		],
		acceptance: ['每条激励规则可被后台配置复现', '写明风控与薅羊毛边界', '复盘有对照组或前后同口径'],
		forbidden: ['用「提升活跃」这种不可测目标', '不写风控就上奖励'],
		penalties: [{ delta: -20, reason: '方案无风控边界' }],
		handoff: '配置交实现方；数据分析交 data-analyst'
	},
	{
		slug: 'research-expert',
		name: '调研专家',
		division: 'research',
		summary: '从外部信息收敛出可引用结论，并标清时间与来源。',
		summon: ['竞品/市场/技术选型要调研', '方案缺外部依据', '要判断趋势与机会'],
		inputs: ['要回答的问题（越具体越好）', '已有假设与已知事实', '时间范围与地域范围'],
		deliverables: ['结论清单，每条带来源链接与日期', '反例与不确定性', '对当前决策的建议'],
		acceptance: ['每条结论可点开到来源', '区分一手/二手与厂商自述', '写明不确定的部分'],
		forbidden: ['把厂商宣传当独立证据', '不给日期就说「最新」'],
		penalties: [{ delta: -20, reason: '结论无可核来源' }],
		handoff: '结论回流指挥官；产品化交 prd-expert'
	},
	{
		slug: 'skill-creator',
		name: '技能/流程沉淀专家',
		division: 'docs',
		summary: '把角色、工作流、判据沉淀成可复用的技能与插件。',
		summon: ['要新建或改技能', '流程要固化成可复用资产', '要把一次性经验变成规则'],
		inputs: [
			'要沉淀的角色/流程与触发条件',
			'已有资产（技能、插件、脚本）',
			'期望的输出形态（skill / plugin / 文档）'
		],
		deliverables: ['技能文件或插件代码 + 元数据', '触发词与边界说明', '最小验证（测试或用例）'],
		acceptance: ['能被 `skill` 工具按名加载', '触发词不会与既有技能冲突', '有可执行的最小验证'],
		forbidden: ['把会话里的临时话术写进技能', '技能正文引用会消失的路径'],
		penalties: [{ delta: -20, reason: '技能无验证就宣称可用' }],
		handoff: '交 code-review-expert 复核，交用户决定发布'
	},
	{
		slug: 'devops-sre',
		name: '发布与可观测工程师',
		division: 'engineering',
		summary: '部署、回滚、健康检查与告警，保证上线可逆。',
		summon: ['要上线或迁移', '需要回滚方案', '线上抖动/容量问题'],
		inputs: ['部署拓扑与环境差异', '变更内容与影响面', '现有监控与告警'],
		deliverables: ['发布步骤与回滚步骤（可复制执行）', '健康检查与验收探针', '变更后的监控指标'],
		acceptance: ['回滚路径实际演练过或写明未演练', '健康检查命令有真实输出', '变更点有对应指标'],
		forbidden: ['无回滚方案就上线', '把「重启试试」当修复'],
		penalties: [{ delta: -40, reason: '无可回滚方案即上线' }],
		handoff: '异常交 bug-diagnosis-expert；结论回流指挥官'
	},
	{
		slug: 'i18n-ja-reviewer',
		name: '日语译审专家',
		division: 'localization',
		summary: '中文/英文 UI 文案转 ja-JP 并自检：敬语层级、长度、术语一致。',
		summon: ['新增 ja-JP 文案', '日语界面返工', '发布前语言包核对'],
		inputs: ['源文案与键名（含上下文）', '术语表与已有译法', 'UI 位置与长度约束'],
		deliverables: ['逐键译文（保持键名不改）', '术语一致性检查结果', '超长/歧义项的替换建议'],
		acceptance: ['键名与源一一对应，无缺无多', '敬语层级在同一界面内一致', '超出容器宽度的条目标注并给短版'],
		forbidden: ['改写键名', '用机翻占位不留标记'],
		penalties: [{ delta: -15, reason: '键名被改动或漏键' }],
		handoff: '交实现方合入；四语一致性交指挥官统筹'
	},
	{
		slug: 'i18n-ko-reviewer',
		name: '韩语译审专家',
		division: 'localization',
		summary: '中文/英文 UI 文案转 ko-KR 并自检：敬阶、空格规则、术语一致。',
		summon: ['新增 ko-KR 文案', '韩语界面返工', '发布前语言包核对'],
		inputs: ['源文案与键名（含上下文）', '术语表与已有译法', 'UI 位置与长度约束'],
		deliverables: ['逐键译文（保持键名不改）', '敬阶一致性检查', '超长项的短版建议'],
		acceptance: ['键名与源一一对应', '敬阶（합니다/해요）统一', '专有名词与术语表一致'],
		forbidden: ['混用敬阶', '键名被改动'],
		penalties: [{ delta: -15, reason: '敬阶混用或漏键' }],
		handoff: '交实现方合入'
	},
	{
		slug: 'i18n-es-reviewer',
		name: '西语译审专家',
		division: 'localization',
		summary: '中文/英文 UI 文案转 es-ES 并自检：性数一致、变体选择、长度膨胀。',
		summon: ['新增 es-ES 文案', '西语界面返工', '发布前语言包核对'],
		inputs: ['源文案与键名（含上下文）', '术语表与已有译法', 'UI 位置与长度约束'],
		deliverables: ['逐键译文（保持键名不改）', '性数一致与变体说明', '长度膨胀的布局风险提示'],
		acceptance: ['键名与源一一对应', '同一区域用词在同一变体（es-ES）', '按 +25% 长度复核布局'],
		forbidden: ['混用拉美/西班牙变体', '键名被改动'],
		penalties: [{ delta: -15, reason: '变体混用或漏键' }],
		handoff: '交实现方合入'
	},
	{
		slug: 'i18n-pt-br-reviewer',
		name: '巴葡译审专家',
		division: 'localization',
		summary: '中文/英文 UI 文案转 pt-BR 并自检：变体、代词、长度膨胀。',
		summon: ['新增 pt-BR 文案', '巴葡界面返工', '发布前语言包核对'],
		inputs: ['源文案与键名（含上下文）', '术语表与已有译法', 'UI 位置与长度约束'],
		deliverables: ['逐键译文（保持键名不改）', '变体（pt-BR 非 pt-PT）说明', '长度膨胀风险提示'],
		acceptance: ['键名与源一一对应', '全篇 pt-BR 变体一致', '按 +35% 长度复核布局'],
		forbidden: ['混用葡葡/巴葡', '键名被改动'],
		penalties: [{ delta: -15, reason: '变体混用或漏键' }],
		handoff: '交实现方合入'
	}
];

/**
 * Look one expert up by slug, or by a loose name match.
 * @param slug - expert slug or display name.
 * @returns the expert, or `undefined` when nothing matches.
 */
export function findExpert(slug) {
	const matches = matchExperts(slug);
	return matches.length === 1 ? matches[0] : undefined;
}

/**
 * All experts a query could mean, most specific match tier first.
 * A fuzzy query that hits several experts must not silently pick the first one:
 * dispatching the wrong specialist is worse than asking again.
 * @param slug - slug, expert name or a fragment of either.
 * @returns candidates, empty when nothing matches.
 */
export function matchExperts(slug) {
	if (typeof slug !== 'string' || slug.trim() === '') return [];
	const raw = slug.trim();
	const key = raw.toLowerCase();
	const exact = EXPERT_CATALOG.filter((expert) => expert.slug === key);
	if (exact.length > 0) return exact;
	const byName = EXPERT_CATALOG.filter((expert) => expert.name.toLowerCase() === key);
	if (byName.length > 0) return byName;
	const fuzzy = EXPERT_CATALOG.filter(
		(expert) => expert.slug.includes(key) || expert.name.toLowerCase().includes(key) || expert.name.includes(raw)
	);
	return fuzzy.length === 1 ? fuzzy : fuzzy;
}

/**
 * List experts, optionally filtered by division.
 * @param options - `{ division }`.
 * @returns matching experts in catalog order.
 */
export function listExperts({ division } = {}) {
	if (division === undefined || division === '') return [...EXPERT_CATALOG];
	const key = String(division).trim().toLowerCase();
	return EXPERT_CATALOG.filter((expert) => expert.division === key);
}

/** All slugs, for the dispatch gate's known-expert check. */
export function expertSlugs() {
	return EXPERT_CATALOG.map((expert) => expert.slug);
}

/** Render one expert's full requirement sheet. */
export function formatExpertBrief(expert) {
	const section = (title, items) => [`### ${title}`, ...items.map((item) => `- ${item}`), ''];
	return [
		`## ${expert.name}（\`${expert.slug}\` · ${DIVISION_LABELS[expert.division] ?? expert.division}）`,
		'',
		expert.summary,
		'',
		...section('何时召唤', expert.summon),
		...section('派发时必须给到', expert.inputs),
		...section('必须交回', expert.deliverables),
		...section('验收判据（可机械判定）', expert.acceptance),
		...section('禁止动作', expert.forbidden),
		...section(
			'扣分项',
			expert.penalties.map((item) => `${item.delta}：${item.reason}`)
		),
		`### 交接\n- ${expert.handoff}`
	].join('\n');
}

/** Render the compact roster table used by the skill appendix and the list action. */
export function formatExpertTable(experts = EXPERT_CATALOG) {
	const rows = experts.map(
		(expert) =>
			`| \`${expert.slug}\` | ${expert.name} | ${DIVISION_LABELS[expert.division] ?? expert.division} | ${expert.summary} |`
	);
	return ['| slug | 专家 | 领域 | 用途 |', '| --- | --- | --- | --- |', ...rows].join('\n');
}
