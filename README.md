<div align="center">

# DSH Commander

**让「指挥官」不再是一段提示词。** 专家名册、派发闸门、记分牌、经验台账——四样东西从纸面规则变成插件里的机械动作。

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-0f766e.svg)](#兼容性)
[![DSH through 0.2.1-rc.2](https://img.shields.io/badge/DSH-up%20to%200.2.1--rc.2-2563eb.svg)](#兼容性)
[![Node.js ≥22.19](https://img.shields.io/badge/Node.js-%E2%89%A522.19-339933.svg)](https://nodejs.org/)
[![ci](https://github.com/yuxianglin/dsh-commander/actions/workflows/ci.yml/badge.svg)](https://github.com/yuxianglin/dsh-commander/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![state: local plugin](https://img.shields.io/badge/state-local%20plugin-lightgrey.svg)](#兼容性)

</div>

---

## 这是什么

一个 DeepSeek Harness 插件：把**多专家协同作战**的指挥官方法论装进 DSH 本体，而不是留在一份 Markdown 技能里、等模型想起来才加载。

装完之后，你的 DSH 里会多出四样东西：

- **一段常驻纪律**（约 1.4k 字符，注入 system prompt，每个会话都在场）
- **一份作战手册**（`commander` 技能，83k 字符，含名册、7 阶段工作流、实战教训）
- **19 位带要求的专家**（何时召唤 / 必须给到什么 / 必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接）
- **四个工具**（派发闸门、专家名册、记分牌、经验台账）

它不替你思考，也不替你派活。它做的是**在你派活之前和收活之后卡住几个口子**，让「派出去、收回来、判对错」留下可复核的痕迹。

## 它解决什么问题

多专家协作最常见的四种失效，光靠提示词堵不住：

| 失效现场 | 没有插件时 | 有插件时 |
| --- | --- | --- |
| 派活没验收标准 | 「找个专家看看，做完告诉我」→ 收回来一段自述 | `commander_dispatch_check` 返回 **D2_no_acceptance 阻断**，派不出去 |
| 派活没点名专家 | 落共享池没人认领，或随便起个 subagent | **W4_no_expert 告警**；名册外的「专家」直接 **D6_unknown_expert 阻断** |
| 专家各按各的标准交活 | 每人一套脾气，质量靠运气 | 每位专家自带**可机械判定的验收判据**，缺一条按未交付计 |
| 经验只活在当轮上下文 | 换个会话、换个人，教训全忘 | 记分牌与台账落盘 `.agent/plans/`，跨会话可复核 |

## 它带来什么价值

**1. 纪律从「希望它记得」变成「做不到就派不出去」**
派发闸门是纯函数：执行者、验收标准、上下游、并发上限、专家名册、写者冲突，逐条给阻断码。模型可以绕过一段话，绕不过一个返回「未通过」的工具。

**2. 每个专家的要求第一次被写死**
19 位专家不是一张名单，是 19 份要求书。以安全审计专家为例：必须交回漏洞清单（位置 / 利用路径 / 影响 / 等级）、修复方案与验证方法、残余风险；验收判据是「每条漏洞都有可执行复现步骤」；发现高危却不给修复路径记 **-40**。

**3. 结论必须回到磁盘**
记分牌（`<task>-expert-scoreboard.md`）与经验台账（`commander-ledger.md`）写在工作区。谁加的分、为什么扣、哪轮踩了什么坑，翻文件就能看到，不依赖任何人的记忆。

**4. 会话不加载技能，纪律也在场**
技能只在被调用时加载；常驻纪律段在**每个会话**的系统提示里。哪怕这轮没人说「指挥官」，派活时那几条闸门仍在。

## 四个工具

| 工具 | 一句话 | 落盘 |
| --- | --- | --- |
| `commander_dispatch_check` | 派发前跑闸门，阻断项清零再派 | 不落盘 |
| `commander_expert` | `list` 看名册 / `divisions` 看领域 / `brief <slug>` 取某位专家的完整要求 | 不落盘 |
| `commander_scoreboard` | `init` 建牌 / `adjust` 加减分（必须写理由）/ `show` 读取 | `<plansDir>/<task>-expert-scoreboard.md` |
| `commander_ledger` | 追加「有效做法 / 踩坑教训 / 新铁律」，最新在最上 | `<plansDir>/<ledgerFile>` |

两个写盘工具都走宿主文件服务（`ctx.fs`），不是 `node:fs`：**只读会话写不了**，工作区会话写不出工作区；插件不接受 `dir` 参数，根永远是会话工作目录。

闸门判据：

- **阻断**：`D1_no_assignee` 没执行者、`D2_no_acceptance` 没有可机械判定的验收标准、`D3_review_without_upstream` 审查没上游、`D4_self_review` 自己审自己、`D5_over_concurrency` 超并发、`D6_unknown_expert` 名册里没这个专家
- **告警（不阻断）**：`W1_no_files` 实现任务没写影响文件、`W2_write_conflict` 两个实现者撞同一文件、`W3_no_dependencies` 整批没有依赖、`W4_no_expert` 没点名专家

### 工具签名（0.1.x 冻结）

工具名、参数名、阻断码是**公开契约**，改它们等于破坏兼容性；内部实现可以改。

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `commander_dispatch_check` | `tasks[]`（`subject` / `assignee` / `role?` / `expert?` / `acceptance` / `dependsOn?` / `files?`）、`running?`、`maxConcurrency?` | 文本报告（阻断 + 提醒 + 计数） |
| `commander_expert` | `action`: `list` \| `brief` \| `divisions`、`expert?`、`division?` | 名册表 / 专家要求书 / 领域概览 |
| `commander_scoreboard` | `action`: `init` \| `adjust` \| `show`、`task`、`experts?`、`adjustments?` | 记分牌全文 |
| `commander_ledger` | `kind`: `success` \| `failure` \| `rule`、`title`、`body` | 写入后的条目 |

`dependsOn` 的数字是 **1 起的任务序号**（与阻断报告里的「任务 N」一致），也可以直接写 `subject`；越界或自指会被忽略，不会误判成自审。

## 30 秒看懂它怎么拦人

派这么一坨活：

```json
{ "tasks": [{ "subject": "改退款逻辑", "assignee": "backend", "expert": "fullstack-arch" }] }
```

`commander_dispatch_check` 的回应：

```text
派发闸门：未通过（1 项阻断）
任务 1 条 · 在跑 0 / 上限 8

阻断：
- [D2_no_acceptance] 改退款逻辑：没有验收标准，交付物无法判定完成。→ 写出可机械验证的验收标准（命令 + 期望输出，或文件清单）。
提醒：
- [W1_no_files] 改退款逻辑：实现任务没有声明影响面文件。→ 写 files（受影响文件或目录），便于做写者冲突检查。
```

补上 `acceptance` 和 `files` 才放行。完整的输入/输出在 [`examples/`](examples/)：一份能通过的批次、一份被三条阻断拦下的批次，输出都是脚本真跑出来的。

派之前照例先取该专家的要求：

```text
commander_expert brief fullstack-arch
→ 何时召唤 / 派发时必须给到 / 必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接
```

## 19 位专家（每位都带要求）

| 领域 | 专家 |
| --- | --- |
| 产品 | `prd-expert` |
| 设计与体验 | `ux-expert`、`ux-auditor` |
| 工程实现 | `fullstack-arch`、`frontend-developer`、`devops-sre` |
| 质量与排障 | `qa-engineer`、`bug-diagnosis-expert`、`code-review-expert`、`critical-code-reviewer` |
| 安全 | `sec-auditor` |
| 数据 | `data-analyst` |
| 运营 | `ops-expert` |
| 调研 | `research-expert` |
| 文档与流程 | `skill-creator` |
| 本地化 | `i18n-ja-reviewer`、`i18n-ko-reviewer`、`i18n-es-reviewer`、`i18n-pt-br-reviewer` |

六项要求写在 `lib/experts.js`；技能末尾的名册表由脚本生成，测试里有一条断言两者同步——**不会出现「工具里有、技能里看不到」**。

## 安装

```bash
# 1) 插件目录装好自己的依赖（link: 安装不会代装依赖，见常见问题第 2 条）
cd ~/.dsh/local-plugins/dsh-commander && pnpm install

# 2) 装进 web profile
dsh plugin --profile web add ~/.dsh/local-plugins/dsh-commander

# 3) 重启 DSH（插件在启动时挂载）
```

确认挂上了（可选，另起实例不打扰你正在用的那个）：

```bash
DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open
```

```text
[dsh-commander] skill "commander" registered (83751 chars) from .../assets/commander.md
[dsh-commander] tools registered: commander_dispatch_check / commander_scoreboard / commander_ledger / commander_expert
[dsh-commander] mounted (skill=true charter=true tools=true)
```

## 怎么用

- 说「**指挥官**」或「**组个专家团队**」→ 加载作战手册，按 7 阶段工作流推进。
- 准备派活时 → 先跑 `commander_dispatch_check`，阻断清零再派。
- 派活前 → `commander_expert brief <slug>` 取该专家要求，原样写进任务书。
- 收活后 → `commander_scoreboard adjust` 记账，`commander_ledger` 沉淀教训。
- 什么都不说也行：常驻纪律段在每个会话里，闸门工具随调随用。

## 配置

改 `cordis.patch.yml` 的 `config`，都有默认值：

| 键 | 默认 | 作用 |
| --- | --- | --- |
| `skillName` | `commander` | 注册进技能目录的名字 |
| `skillDescription` | 一段中文描述 | 技能目录里显示的一句话简介 |
| `registerSkill` | `true` | 是否注册作战手册 |
| `promptSection` | `true` | 是否注入常驻纪律段 |
| `promptOrder` | `118` | 纪律段在 system prompt 的位次 |
| `tools` | `true` | 是否注册四个工具 |
| `plansDir` | `.agent/plans` | 记分牌 / 台账落盘目录（工作区相对） |
| `ledgerFile` | `commander-ledger.md` | 台账文件名 |
| `maxConcurrency` | `8` | 闸门默认并发上限 |

`DSH_COMMANDER_TRACE=1` 打开启动追踪（默认关闭）。

## 技能加载优先级（为什么有时你看到的是项目里那份）

技能解析是分层的，同名技能按层取第一个：

| 层 | 来源 | 优先级 |
| --- | --- | --- |
| `project-dsh` | 项目 `.dsh/skills/` | 100（最高） |
| `project-agents` | 项目 `AGENTS.md` 侧 | 200 |
| `runtime` | **本插件注册** | 250 |
| `custom` | 自定义 | 300 |
| `user-dsh` | `~/.dsh/skills/` | 400 |
| `user-agents` | `~/.dsh/AGENTS.md` 侧 | 500 |

也就是说：**项目里若有一份同名 `commander` 技能，它会压过插件的正文**，但工具只认插件内的 19 人名册——正文可被覆盖，闸门不会被覆盖。想让插件正文生效，删掉项目里那份同名技能，或改 `skillName`。

## 成本

- 常驻纪律段 **约 1.4k 字符**（≈ 700–900 tokens），**每个会话**都要付；嫌贵就把 `promptSection` 关掉，只用工具。
- 作战手册 83.7k 字符只在技能被调用时进上下文，不调用不计费。
- 四个工具的输出都是纯文本，闸门报告通常 10–30 行。

## 卸载与回滚

```bash
dsh plugin --profile web remove dsh-commander
# 恢复被覆盖的用户技能：~/.dsh/skills/commander.md 一直都在，删掉插件后它重新生效
```

已落盘的 `.agent/plans/*.md` 不会被卸载删除——那是你的工作产物，要清自己清。

## 来源与边界

- 本插件的作战手册改写自作者自用的「指挥官」Markdown 技能（`~/.dsh/skills/commander.md`），**非官方插件**，与 DeepSeek 官方无关。
- 名册里的 19 位专家是**角色设定**，不是独立进程；真正的执行者是 Agent Teams 的队友或 subagent，插件只负责「要求写清楚、闸门卡住、痕迹落盘」。
- 依赖 `@deepseek-ai/dsh-tools` 的**工具定义契约**；DSH 大版本升级后如果契约变了，本插件要跟着改（见兼容性）。

## 和「一份 Markdown 技能」的区别

| 能力 | 纯 Markdown 技能 | 本插件 |
| --- | --- | --- |
| 会话没加载技能时纪律仍在 | ❌ | ✅ 常驻 system prompt |
| 派发缺验收标准能拦住 | ❌ 只能靠自觉 | ✅ 机械阻断 |
| 专家要求统一且可查 | 散落在正文里 | ✅ 名册 + `brief` 工具 |
| 记分与教训跨会话存活 | ❌ | ✅ 落盘可复核 |
| 升级方式 | 手改 md | 改代码 + 测试 + 重启 |

## 它不做什么

- **不自动派活**：闸门只判断「这批活能不能派」，派发动作仍由你或模型执行。
- **不替专家做专业判断**：要求书写在名册里，判断留给专家。
- **不保证质量**：它保证的是「没有验收标准就派不出去」，不是「派出去一定对」。
- **不改你的代码**：除了 `.agent/plans/` 下的两个 Markdown 台账，不写别的文件。

## 常见问题

**1. 为什么要重启 DSH？**
插件在启动时挂载（`dsh.bundle.patch`），改代码、装插件都要重启一次才生效。

**2. 启动报 `ERR_MODULE_NOT_FOUND Cannot find package '@deepseek-ai/schemastery'`？**
`dsh plugin add` 走 pnpm 的 `link:`，本地目录装出来是符号链接，pnpm **不会**给链接目标装依赖。先在插件目录 `pnpm install` 再装。

**3. 装的时候被 `installation rejected: ... incompatible with dsh 0.2.1-rc.2` 拒了？**
版本闸读的是 `engines.dsh`（声明了它就不再比对 `peerDependencies`）。升级 dsh 后把 `engines.dsh` 的下限跟着调；实在要装就按提示加 `--accept-risk`。

**4. 我原来的 `~/.dsh/skills/commander.md` 怎么不生效了？**
技能目录优先级 `project > runtime > user`：插件注册的 `commander` 盖住了用户目录里的同名技能。改要求请改 `lib/experts.js` 后 `node scripts/render-roster.mjs`，不要改那份 md。

**5. 只读会话里记账会怎样？**
写盘走宿主文件服务，只读会话下 `commander_scoreboard` / `commander_ledger` 会被沙箱拒绝并返回错误——这是有意的：只读就是只读，工具不会绕过它。

**6. `brief` 说「对应多位专家」怎么办？**
名册支持 slug / 全名 / 子串三级匹配，但**只在唯一命中时返回**。像 `expert` 这种碎片会命中 6 位，插件会让你写完整 slug，而不是随便挑一个。

**7. 怎么加一位自己的专家？**
改 `lib/experts.js` 增一条（六项要求 + 交接 + 扣分）→ `node scripts/render-roster.mjs` → `npm test` → 重启。闸门会自动认这个新 slug。

## 兼容性

- DSH：`>=0.2.1-rc.2`（`engines.dsh` 声明；安装时 dsh 以它做版本闸，不再看 `peerDependencies`）
- Node.js：≥ 22.19（`node --test` 需要 22+）
- 运行时依赖：`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery`（与 DSH 运行时对齐）
- 状态：**本地插件**，未发布到 npm（npm 上 `dsh-commander` 已被他人占用，发布需改用带 scope 的包名）

## 发布（npm）

发布前要做三件事，缺一件会被 npm 或用户撞上：

1. **换名字**：`dsh-commander` 在 npm 上已属他人（`yusi5587`，v0.1.4）。用带 scope 的名字，例如 `@yuxianglin/dsh-commander`；改名要同步 `cordis.patch.yml` 的 `id` / `name` 与 `package.json`。
2. **官方源登录**：本机 `~/.npmrc` 指向 npmmirror 时 `npm whoami` 会 401；发布前 `npm login --registry=https://registry.npmjs.org`。
3. **首发用 rc tag**：`npm publish --tag next`，别直接顶 `latest`。

```bash
npm run roster:check && npm test   # prepack 也会跑这两步
npm pack --dry-run                 # 看清单与体积
npm publish --tag next             # 首次；稳定后再 dist-tag 到 latest
```

## 开发

```bash
pnpm install
node --test test/*.test.mjs              # 43 个用例
node scripts/render-roster.mjs           # 改完名册后重新生成技能附录
node scripts/render-roster.mjs --check   # 只校验
```

`test/plugin.test.mjs` 用 stub ctx 跑 `apply()`，断言技能注册、纪律段（name / order）、四个工具、闸门阻断、名册查询、记分牌真写文件、台账最新在最上、非法参数被拒。`test/experts.test.mjs` 盯名册完整性（slug 唯一、六项齐全、扣分在标尺内、与技能附录同步）。

## 仓库结构

```text
lib/           插件实现（index 入口 / charter 纪律段 / experts 名册 / dispatch 闸门 / scoreboard / ledger / workspace 文件访问）
assets/        commander.md —— 作战手册正文（名册附录由脚本生成，勿手改）
scripts/       render-roster.mjs —— 生成并校验名册附录
test/          node --test 用例（43 个）
examples/      可直接跑的派发批次与闸门输出
cordis.patch.yml  插件装载清单与默认配置
```

## 参与

- 发现 bug / 想要新能力：用 [issue 模板](.github/ISSUE_TEMPLATE/)。
- 提 PR 前先读 [CONTRIBUTING.md](CONTRIBUTING.md)：代码与 JSDoc 用英文，面向用户的文案用中文，格式化与 lint 由机器跑。
- 安全漏洞走 [SECURITY.md](SECURITY.md) 的私有渠道，别开公开 issue。
- 参与即同意 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 与 MIT 许可。

## English summary

DSH Commander turns a prose "commander" playbook into a DeepSeek Harness plugin: a 19-expert roster where each expert carries its own inputs, deliverables, mechanical acceptance criteria, forbidden moves and penalties; a standing discipline section injected into every session; and four tools — a dispatch gate that refuses tasks without an owner, acceptance criteria or upstream, an expert lookup, an on-disk scoreboard, and a lesson ledger. Nothing is auto-dispatched; the plugin only makes "dispatch, collect, judge" leave verifiable traces on disk.

## License

MIT
