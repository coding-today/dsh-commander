# Changelog

本文件格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **记分牌进化闭环**：`commander_scoreboard` 新增 `evolve`（不需要 `task`），只读聚合
  `<plansDir>/*-expert-scoreboard.md`，写入 `<plansDir>/expert-evolution.md`。分数不跨任务相加，
  取最近一张牌的当前分 + 完整理由历史；每条历史失分原样写进该专家下一份任务书，同一理由复发
  标 `×N 复发`，并按分数给出派发档位（≥90 / 70–89 / 50–69 / <50）。坏文件与无关文件只跳过上报。
- `lib/scoreboard.js` 新增 `bandFor` / `aggregateExperts` / `formatEvolution` 与 `EVOLUTION_BANDS`；
  `lib/workspace.js` 新增 `resolvePlansDirectory` / `listPlansFiles`（目录不存在视为空，后端没有 `listDir` 则明确报错而不是假装「没有历史」）。
- 新增 `test/live-fs.test.mjs`：从本机 DSH 安装加载真实的 `@deepseek-ai/dsh-fs-local`，验证
  `lstat` / `listDir` / 目录项 `type` 三条契约；找不到安装时跳过而不是失败。
- 常驻纪律段新增两条：记分牌为进化服务（收尾 `adjust`、下轮派发前 `evolve`、复发 ≥2 次要记 failure）；
  分数决定派发档位，不是参考值。
- 侧边栏「专家」面板：`GET /ext/commander/state` 只读快照 + Web 客户端 tab，
  每 3 秒展示每位专家的状态、当前任务、最近一条消息；`monitor: false` 可关闭。
- 服务端 `lib/monitor.js`：解析 `<workspace>/.agent-teams/*/team.json` 与 `inbox/*.jsonl`，
  成员判活优先看团队记录，其次看是否压着未完成任务；坏 JSONL 行跳过而不是整块失败。

### Added（续）

- **指挥官也上牌**：`commander_scoreboard init` 自动写入 `captain` 行（角色 `指挥官`）；`adjust` 的
  `expert` 接受 `captain` / `指挥官` / `commander` 三个别名。指挥官的派发失误（验收不可机械判定、
  漏 `dependsOn`、写者撞车、把线索当结论）现在和专家一样计分。
- 进化卡改为**两方**：新增 `## captain，指挥官` 段（分数、派发纪律、自身失误、做对的地方）、
  顶部「下轮必读（派发前 30 秒）」、末尾「下一轮派发指令」表格（`| 角色 | 档位 | 必写进任务书 |`，
  可直接抄进任务书）；同一派发错误复发 ≥ 2 次升级为硬闸门（派发前必跑 `commander_dispatch_check`）。
- `lib/scoreboard.js` 新增 `CAPTAIN` / `CAPTAIN_ROLE` / `isCaptain` / `normalizeName` / `formatDirectives`；
  `parseScoreboard` 归一化三个别名并合并重复的指挥官行（手改过的牌不会变成两个分数）。

### Changed

- `commander_scoreboard` 的 `task` 不再全局必填：只有 `init` / `adjust` / `show` 需要，缺失时报明确中文错误。

首个可运行版本已就绪，尚未发布到 npm。发布前需要处理的事项见
[RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md)（包名占用、仓库地址、依赖双份取舍）。

## [0.1.0-rc.1] - 2026-10-29

首个候选版本：指挥官的纪律、名册与机械动作，作为一个 DSH 插件发布。

### Added

- **技能注册**：`assets/commander.md`（约 84.9k 字符）在运行时注册为 `commander` 技能，
  随插件版本走，不受用户目录里旧同名技能影响。
- **常驻纪律段**：`buildCharter()` 生成约 1.8k 字符的系统提示段落，每个会话都在场，
  含派发闸门 5 条、专家召集纪律 4 条、通信纪律 3 条、裁决纪律 6 条、记忆与留痕 4 条、工具速查 5 条。
- **五个工具**：
  - `commander_dispatch_check`：派发前闸门，7 个阻断码（`D1_no_assignee`、`D2_no_acceptance`、
    `D3_review_without_upstream`、`D4_self_review`、`D5_over_concurrency`、`D6_unknown_expert`、
    `D7_unknown_peer`）与 4 个告警码（`W1_no_files`、`W2_write_conflict`、`W3_no_dependencies`、`W4_no_expert`）。
  - `commander_handoff`：`create` / `read` 专家交接单，落盘 `.agent/plans/handoffs/`，
    并输出可直接粘贴进 `send_message` 的消息正文；`deliver: true` + `toMember` 时经宿主的
    `agent_teams_send_message` 直投（`from` 由宿主认定，不冒充专家）。
  - `commander_expert`：19 位专家的名册查询与派遣要求（七节：何时召唤 / 派发时必须给到 /
    必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接）。
  - `commander_scoreboard`：`init` / `adjust` / `show`，落盘为 `.agent/plans/<task>-expert-scoreboard.md`。
  - `commander_ledger`：把有效做法、踩坑教训追加到 `.agent/plans/commander-ledger.md`，超过 256 KiB 自动归档。
- **安全边界**：所有写入走宿主 `ctx.fs`（只读会话写不进去），无 `dir` 参数，
  `plansDir` / `ledgerFile` 经 `assertSafeRelative` 拒绝绝对路径、`~` 与 `..`。
- **CLI**：`scripts/commander-cli.mjs` 提供 `gate` / `brief` / `experts` 三个子命令，
  不装插件也能验证闸门与名册（`gate` 未通过时退出码为 1）。
- **示例**：`examples/` 下两份批次与对应闸门输出，由 `scripts/regen-examples.mjs` 真跑生成并进测试比对。
- **工程规范**：Prettier + ESLint + EditorConfig + gitattributes，`node scripts/check.mjs` 一条命令跑全；
  GitHub Actions 跑 lint → format → roster → examples → test → pack。
- **文档**：中文 README、英文 README、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、AGENTS、发布清单。

### Known trade-offs

- `@deepseek-ai/dsh-tools` 放在 `dependencies` 并精确钉版本：宿主 profile 内不装该 peer，
  插件必须自带一份，代价是宿主与插件各持一个 `defineTool` 实例。
- 只在 macOS + Node 22.22.3 + DSH 0.2.1-rc.2 实测；其他平台未验证。
- 名册与专家要求硬编码在 `lib/experts.js`，增删专家需要改代码并重跑 `scripts/render-roster.mjs`。
- 插件不做消息投递：横向通信靠宿主的 agent team，插件只产出交接单与 `peers` 白名单校验。

[Unreleased]: https://github.com/coding-today/dsh-commander/compare/v0.1.0-rc.1...HEAD
[0.1.0-rc.1]: https://github.com/coding-today/dsh-commander/releases/tag/v0.1.0-rc.1
