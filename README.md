<div align="center">

# DSH Commander

**把多专家协作的纪律，装进宿主本体。** 专家名册、派发闸门、专家交接、记分牌、经验台账——规则不再是建议，而是会拦人、会落盘的机械动作。

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-0f766e.svg)](#兼容性)
[![DSH through 0.2.1-rc.2](https://img.shields.io/badge/DSH-tested%20on%200.2.1--rc.2-2563eb.svg)](#兼容性)
[![Node.js ≥22.19](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933.svg)](https://nodejs.org/)
[![tests](https://img.shields.io/badge/tests-81%20passing-3fb950.svg)](https://github.com/coding-today/dsh-commander/actions/workflows/ci.yml)
[![ci](https://github.com/coding-today/dsh-commander/actions/workflows/ci.yml/badge.svg)](https://github.com/coding-today/dsh-commander/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文](./README.md) ｜ [English](./README.en.md)

</div>

---

## 这是什么

一个 DeepSeek Harness 插件：把**多专家协同作战**的纪律装进 DSH 本体——会话一开始就在场，不必等谁想起。

装完之后，你的 DSH 里会多出五样东西：

- **一段常驻纪律**（约 1.7k 字符，注入 system prompt，每个会话都在场）
- **一份作战手册**（`commander` 技能，约 84.9k 字符，含名册、7 阶段工作流、实战教训）
- **19 位带要求的专家**（何时召唤 / 必须给到什么 / 必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接）
- **五个工具**（派发闸门、专家名册、专家交接、记分牌、经验台账）
- **一块侧边栏面板**（每位专家此刻在干什么，3 秒一刷）

它不替你思考，也不替你派活。它做的是**在你派活之前和收活之后卡住几个口子**，让「派出去、收回来、判对错」留下可复核的痕迹。

**目录**：[它解决什么问题](#它解决什么问题) · [截图](#截图) · [三分钟上手](#三分钟上手) ·
[五个工具](#五个工具) · [专家名册](#专家名册19-位) · [CLI](#不装插件也能验) · [配置](#配置) ·
[它不做什么](#它不做什么) · [常见问题](#常见问题) · [兼容性](#兼容性) · [仓库结构](#仓库结构)

---

## 它解决什么问题

多智能体协作最常见的失败不是「模型不够聪明」，而是**派出去的活没法验收**。指令一旦模糊，子智能体就会各自发挥，最后你收到一堆「已完成」，却判断不了完成的是什么。

| 你平时说的话 | 没有闸门时会发生什么 | 有闸门之后 |
| --- | --- | --- |
| 「让某位专家看看这个 PR」 | 任务落进共享池，没人认领，两小时后才发现 | `D1_no_assignee` 直接拦下：写明 assignee |
| 「改一下退款逻辑，做完告诉我」 | 交付物无法判定完成，只能凭感觉验收 | `D2_no_acceptance` 拦下：要命令 + 期望输出，或文件清单 |
| 「审查一下他刚写的代码」 | 审查者拿不到被审对象，只能凭空点评 | `D3_review_without_upstream` 拦下：用 `dependsOn` 指向上游 |
| 「你先写，写完自己看看」 | 同一位专家既实现又自审，等于没审 | `D4_self_review` 拦下：审查必须换人 |
| 「这些一起上」 | 一次派满 12 个子智能体，全部卡住 | `D5_over_concurrency` 拦下：超过并发上限 |
| 「找个专家来处理」 | 专家名不存在，模型自由发挥 | `D6_unknown_expert` 拦下：名册里没有这个名字 |
| 「这轮谁做得好？」 | 只活在聊天记录里，下次从零开始 | 记分牌落盘，加减分必须写理由 |
| 「让 B 接着 A 的活」 | A 的结论只剩一句口头转述，B 拿不到证据 | `commander_handoff` 交接单落盘：结论、证据、未决项、下一棒要求 |

## 截图

**① 派发闸门真的会拦人**：三条阻断 + 两条提醒，每条都给出改法。

![派发闸门拦下三条阻断](docs/screenshots/gate-blocked.png)

**② 通过时干净利落**（`gate` 退出码 0，可直接接进 CI）：

![派发闸门通过](docs/screenshots/gate-pass.png)

**③ 派发前先取专家的要求**：`brief` 把七节要求原样抄进任务书。

![专家派遣要求](docs/screenshots/expert-brief.png)

**④ 自带检查与真机挂载证据**：`node scripts/check.mjs` 全绿；`DSH_COMMANDER_TRACE=1` 打印三行挂载日志。

![检查与真机挂载](docs/screenshots/check-and-mount.png)

> 这几张图是**真实运行输出的转录渲染**：源文本在 `docs/screenshots/src/*.txt`（命令真跑后保存），
> 由 `python3 scripts/render-screenshots.py` 画成终端样式。输出一变，图可重生成并在 diff 里看见。

## 三分钟上手

```bash
# 1) 在插件目录装它自己的依赖（关键：link: 安装不会替你装依赖）
cd ~/.dsh/local-plugins/dsh-commander && pnpm install

# 2) 装进 web profile
dsh plugin --profile web add ~/.dsh/local-plugins/dsh-commander

# 3) 重启 DSH（插件在启动时挂载）
```

重启后先体检，确认三行挂载日志都在：

```bash
DSH_COMMANDER_TRACE=1 dsh --profile web --no-open 2>&1 | grep dsh-commander
# [dsh-commander] skill "commander" registered (83751 chars) from …/assets/commander.md
# [dsh-commander] tools registered: commander_dispatch_check / commander_scoreboard / commander_ledger / commander_expert
# [dsh-commander] mounted (skill=true charter=true tools=true)
```

然后在会话里按这个节奏用：

```text
1. 你说：帮我用指挥官把这活拆了          → 模型加载 commander 技能 + 常驻纪律段
2. 派活前调 commander_dispatch_check     → 被拦就补 assignee / acceptance / dependsOn
3. 派活前调 commander_expert brief <slug> → 把七节要求抄进任务书
4. 换人或交棒时调 commander_handoff      → 交接单落到 .agent/plans/handoffs/
5. 完成后调 commander_scoreboard adjust  → 落盘加减分与理由（专家 + 指挥官自己各看一遍）
6. 下一轮派活前调 commander_scoreboard evolve → 生成 expert-evolution.md（指挥官 + 专家两段），把失分项写进新任务书
7. 收尾调 commander_ledger               → 把有效做法与踩坑写进台账
```

### 不装插件也能验

自带 CLI 直接跑同一套逻辑（`gate` 未通过时退出码为 1）：

```bash
node scripts/commander-cli.mjs gate examples/dispatch-batch-blocked.json
node scripts/commander-cli.mjs gate examples/dispatch-batch.json
node scripts/commander-cli.mjs brief qa-engineer
node scripts/commander-cli.mjs experts quality
```

## 五个工具

### `commander_dispatch_check` — 派发前闸门

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `tasks` | array | 待派发的任务，字段见下 |
| `running` | integer | 当前已在跑的子智能体数，默认 0 |
| `maxConcurrency` | integer | 并发上限，默认取插件配置（8） |

任务字段：`subject`（必填）、`assignee`、`expert`（名册 slug）、`role`（`impl`/`review`/`qa`/`doc`/`research`）、
`acceptance`、`files`（影响面）、`dependsOn`（任务序号，**1 起**，也可写 subject）、`running`。

阻断码：`D1_no_assignee`、`D2_no_acceptance`、`D3_review_without_upstream`、`D4_self_review`、
`D5_over_concurrency`、`D6_unknown_expert`、`D7_unknown_peer`（`peers` 里写了名册外的专家）。
告警码：`W1_no_files`、`W2_write_conflict`、`W3_no_dependencies`、`W4_no_expert`。

### `commander_expert` — 专家名册

`action: list`（按领域筛选）｜`brief`（取某位的七节要求）｜`divisions`（列领域）。

### `commander_handoff` — 专家交接

`create`（写交接单）｜`read`（取回）。

参数：`task`、`from`、`to`（名册 slug）、`summary`（一句话结论，空着会被拒）、
`evidence`（可复核证据）、`openItems`（未决项）、`asks`（额外要求）、`at`。
落盘 `.agent/plans/handoffs/<task>--<from>-to-<to>.md`，并直接输出**可粘贴进 `send_message` /
`agent_teams_send_message` 的消息正文**——投递归宿主，交接内容与证据归这张单子。

加 `deliver: true` + `toMember: "<团队成员名|captain>"` 可以免去手工粘贴：插件调用宿主的
`agent_teams_send_message` 把正文直接投进对方收件箱，回执给出 `live / wake / mailbox / duplicate`。
**`from` 由宿主按调用者身份认定**，插件与模型都不能冒充专家署名；会话里没有团队时工具会明确拒绝。

### `commander_scoreboard` — 记分牌（指挥官 + 专家）

`init`（建牌，需 `task` + `experts`）｜`adjust`（加减分，必须写理由）｜`show`（读取）｜`evolve`（聚合历史，生成进化卡）。
落盘：`.agent/plans/<task>-expert-scoreboard.md`。起始 100 分，单次增减绝对值 ≤ 100，累计不钳制。

**牌上有两方**：`init` 自动在最前面写入 `captain`（指挥官）行；`adjust` 的 `expert` 写
`captain` / `指挥官` / `commander` 都是给指挥官自己记分。指挥官派错了——验收不可机械判定、漏了
`dependsOn`、写者撞车、把线索当结论——照样扣分。只给专家打分的记分牌，等于指挥官永远不进化。

`evolve` 不带 `task`，只读扫描 `<plansDir>/*-expert-scoreboard.md`，把全部历史汇总成
`.agent/plans/expert-evolution.md`，结构是四段：

1. **下轮必读（派发前 30 秒）**：指挥官最近一次自身失误 + 每个非「正常派发」档专家的必写扣分项；
2. **`## captain，指挥官`**：分数、本轮派发纪律、自身失误（原样抄进新任务书开头「我不要重复」）、做对的地方；
3. **每个专家一段**：分数档位 + 历史失分 + 可复用做法；
4. **下一轮派发指令**：`| 角色 | 档位 | 必写进任务书 |` 表格——直接抄进任务书，不是看过就算。

**记分牌不是账本**——它的目的是让下一轮派发与上一轮不同：

- 分数不跨任务相加（每张牌独立从 100 起），取「最近一张牌的当前分」+ 完整理由历史；
- 每条历史失分原样写进该专家下一份任务书的「扣分项 / 禁止动作」，同一理由复发 ≥ 2 次会标 `×N 复发`，
  指挥官同时要在台账记一条 failure（纠正是指挥官的责任，不只是专家的）；
- 指挥官的同一派发错误复发 ≥ 2 次会升为硬闸门：派发前必跑 `commander_dispatch_check`；
- 分数决定派发档位，不是参考值：**≥90 正常派发｜70–89 加严验收｜50–69 加严 + 二次复核｜<50 降级只派 research·doc**；
- 坏文件、非记分牌文件只跳过并上报，不影响其余聚合；还没有任何牌时也照样写卡，说明「下一轮才有东西可进化」。

### `commander_ledger` — 经验台账

把「有效做法 / 踩坑教训 / 固化规则」追加到 `.agent/plans/commander-ledger.md`，最新在最上；
超过 256 KiB 自动归档为 `commander-ledger-YYYYMM.md`。

## 侧边栏：专家进展实时面板

插件在 Web 端注册一个右侧栏标签「专家」，每 3 秒读一次本机团队状态，把**每位专家正在干什么**摊开：

- 绿点 = 在跑（团队记录为 `working`，或手上压着 `claimed` / `in_progress` 的活）；
  灰点 = 空闲；红点 = 已移除。找不到活的专家不会被画成「忙」。
- 每人一行：名字、角色、当前任务（任务号 + 标题 + 状态 + 多久没动）、收件箱最后一条消息。
- 团队头：在跑人数 / 总人数、待办数、完成数、失败数；`halted` 的团队直接标「已暂停」。

数据来自宿主团队插件写在 `<workspace>/.agent-teams/` 的状态，插件只读不驱动：

```bash
curl -s http://127.0.0.1:<port>/ext/commander/state | jq .totals
# { "workspaces": 1, "teams": 1, "members": 3, "working": 2 }
```

`monitor: false` 可以整块关掉（不注册路由，也不加载面板）。面板只显示宿主的团队记录：
**它不会伪造进度**——专家真的不动，你看到的就是越来越旧的时间戳。

## 专家名册（19 位）

| 领域 | 专家 |
| --- | --- |
| 产品 | `prd-expert` |
| 设计 | `ux-expert`、`ux-auditor` |
| 工程 | `fullstack-arch`、`frontend-developer`、`devops-sre` |
| 质量与排障 | `qa-engineer`、`bug-diagnosis-expert`、`code-review-expert`、`critical-code-reviewer` |
| 安全 | `sec-auditor` |
| 数据 | `data-analyst` |
| 运营 | `ops-expert` |
| 调研 | `research-expert` |
| 文档 | `skill-creator` |
| 本地化 | `i18n-ja-reviewer`、`i18n-ko-reviewer`、`i18n-es-reviewer`、`i18n-pt-br-reviewer` |

每位专家的七节要求都在 `lib/experts.js`（单一来源），并同步进技能附录（`pnpm run roster`）。
想看某位的完整要求：`node scripts/commander-cli.mjs brief sec-auditor`。

## 配置

插件配置写在 profile 的 `cordis.patch.yml` 里：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `skillName` | `commander` | 注册的技能名 |
| `registerSkill` | `true` | 是否注册技能正文 |
| `promptSection` | `true` | 是否注入常驻纪律段 |
| `promptOrder` | `118` | 纪律段顺序（0 之后、宿主 PLAN_POLICY 500 之前） |
| `tools` | `true` | 是否注册五个工具 |
| `plansDir` | `.agent/plans` | 记分牌与台账目录（工作区相对路径） |
| `ledgerFile` | `commander-ledger.md` | 台账文件名（不能带目录） |
| `maxConcurrency` | `8` | 纪律段与闸门共用的并发上限 |
| `skillDescription` | 内置 | 技能的市场描述 |
| `monitor` | `true` | 是否提供侧边栏面板与 `/ext/commander/state` 路由 |

`plansDir` / `ledgerFile` 会过白名单校验：绝对路径、`~`、`..` 一律拒绝并回退默认值（同时打一条 warn）。
所有写入都走宿主 `ctx.fs`，**只读会话写不进去**——这是有意的边界，工具不绕过会话权限。

## 它不做什么

- **不自动派活**：闸门只判断「这批活能不能派」，派发动作仍由模型执行。
- **不替专家做判断**：要求写在名册里，专业结论留给专家。
- **不保证质量**：它保证「没有验收标准就派不出去」，不保证「派出去一定对」。
- **不联网、不发请求**：除两份台账外不写文件，也不碰网络。

## 常见问题

**1. 为什么要重启 DSH？** 插件在启动时挂载（`dsh.bundle.patch`），改代码或装插件都要重启一次。

**2. 启动报 `ERR_MODULE_NOT_FOUND Cannot find package '@deepseek-ai/schemastery'`？**
`dsh plugin add` 走 pnpm 的 `link:`，不会给链接目标装依赖。先在插件目录 `pnpm install` 再装。

**3. 安装时被 `incompatible with dsh …` 拒了？** 版本闸读 `engines.dsh`。升级 DSH 后同步调下限；
确认风险可加 `--accept-risk`（会记在 profile 里）。

**4. 项目里也有一个同名 `commander` 技能，谁生效？**
技能优先级是 `project > runtime > user`：项目级同名技能盖住插件注册的 runtime 技能，反过来盖住 `user` 目录。
要让插件这份手册说了算，就别在项目里放同名技能。改名册请改 `lib/experts.js` 后跑 `pnpm run roster`。

**5. 专家之间怎么互相通信？** 消息投递是宿主的能力（`send_message` / `agent_teams_send_message`），
本插件不接管传输、也不冒充任何专家。它管的是**通信纪律 + 交接内容**：任务书里写 `peers` 才允许横向联系
（不在名册 → `D7_unknown_peer`），交接必须产出 `commander_handoff` 单据（可 `deliver:true` 直投），
未列名的一律经指挥官转达，对外结论只有一个来源。

**6. 只读会话里记账会怎样？** 会被沙箱拒绝并返回错误。工具不提供绕过会话权限的写盘路径。

**7. `brief` 说「对应多位专家」怎么办？** 匹配支持 slug / 全名 / 子串，但只在唯一命中时返回结果；
`expert` 这种碎片会命中 6 位，请写完整 slug。

**8. 设了 `DSH_COMMANDER_TRACE=1` 却看不到那三行？** 宿主在启动阶段会过滤 `logger.info`，
所以本插件把追踪直接写 stderr；确认命令带了 `2>&1 | grep dsh-commander`。

**9. 怎么加一位自己的专家？** 在 `lib/experts.js` 增一条（七节要求 + 扣分标尺 `-15/-20/-25/-40`）
→ `pnpm run roster` → `pnpm test` → 重启。闸门会自动认这个新 slug。

## 兼容性

| 项 | 版本 |
| --- | --- |
| DeepSeek Harness | 已在 **0.2.1-rc.2** 实测；`engines.dsh` 要求 `>=0.2.1-rc.2` |
| Node.js | `>=22.19.0`（CI 用 22.22.3） |
| 平台 | 只在 macOS 实测；Linux 预期可用，Windows 未验证 |

> `engines.dsh` 没有上界：能过闸不等于已测试。宿主大版本升级后请重跑 `node scripts/check.mjs`，
> 再用 `DSH_COMMANDER_TRACE=1` 做一次真机挂载确认。

## 仓库结构

```text
dsh-commander/
├── lib/
│   ├── index.js        # apply：技能注册 / 纪律段 / 五个工具 / 监控路由
│   ├── defaults.js     # 目录、文件名、并发上限、错误前缀的单一来源
│   ├── charter.js      # 常驻纪律段文案
│   ├── experts.js      # 19 位专家与七节要求（单一来源）
│   ├── handoff.js      # 交接单的生成与消息正文
│   ├── dispatch.js     # 派发闸门（纯函数）
│   ├── scoreboard.js   # 记分牌生成/解析 + 指挥官/专家进化卡聚合
│   ├── ledger.js       # 台账插入、归档
│   ├── monitor.js      # 只读聚合团队状态，供侧边栏轮询
│   ├── client.js       # Web 侧边栏「专家」面板
│   └── workspace.js    # 路径白名单 + 走宿主 fs 的读写（含 plans 目录列举）
├── assets/commander.md # 技能正文（末尾名册附录是生成物）
├── scripts/            # 名册生成、示例重生成、CLI、截图渲染、一条命令检查
├── test/               # 109 个用例（node --test，含真机 fs 契约）
├── examples/           # 可运行的批次与真实闸门输出
├── docs/screenshots/   # README 截图与其真实输出源文本
├── .github/            # CI、issue / PR 模板
└── cordis.patch.yml    # profile 挂载入口
```

## 开发

```bash
pnpm install
pnpm run check      # lint → format → roster → examples → test（CI 跑同一条）
pnpm run roster     # 改完 lib/experts.js 后重生成技能里的名册附录
pnpm run screenshots # 改完 docs/screenshots/src/*.txt 后重渲染截图
```

`pnpm test` 里除桩测试外还有 `test/live-fs.test.mjs`：它直接从本机 DSH 安装里加载**真实的
`@deepseek-ai/dsh-fs-local`**，验证 `lstat` 对不存在的路径返回 `undefined`、`listDir` 对不存在的目录抛
`FS_NOT_FOUND`、目录项 `type` 是否 `file`——`evolve` 的正确性就压在这三条契约上。找不到 DSH 安装
（或设了别的 `DSH_HOME`）时该文件**跳过而不是失败**。

规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)：代码与 JSDoc 用英文，用户可见文案用中文；
不变量（改代码前必须知道的六条）见 [AGENTS.md](./AGENTS.md)；安全报告方式见 [SECURITY.md](./SECURITY.md)。

## 许可证

[MIT](./LICENSE) © 2026 二锅头不上头
