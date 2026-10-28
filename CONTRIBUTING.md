# 贡献指南

先说清楚这个项目的边界：本插件只做四件事——**常驻纪律、专家名册、派发闸门、落盘留痕**。它不自动派活、不替专家做专业判断、不改你的业务代码。超出这个边界的功能，先开 issue 讨论，不要直接提 PR。

## 开发环境

- Node.js **≥ 22.19**（`node --test` 需要 22+）
- pnpm（`corepack enable pnpm` 或自行安装）
- DeepSeek Harness **≥ 0.2.1-rc.2**（只有跑真机挂载验证才需要）

```bash
git clone <repo> && cd dsh-commander
pnpm install
pnpm run check        # lint + format:check + roster:check + test
```

## 代码规范

格式化与静态检查是**机器执行**的，不要靠手写对齐：

| 项                 | 规则                                                                             | 由谁保证                   |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------- |
| 缩进               | tab（宽度 4），YAML/JSON/Markdown 用 2 空格                                      | Prettier + `.editorconfig` |
| 引号 / 分号 / 行宽 | 单引号、必须有分号、120 列                                                       | Prettier                   |
| 语言               | **代码与 JSDoc 用英文**；面向用户的字符串（工具描述、输出、报错、文档）用中文    | 人工评审                   |
| 注释               | 只解释「为什么」，不复述「做了什么」                                             | 人工评审                   |
| 错误               | 抛 `Error`，消息以 `dsh-commander:` 开头，说明用户该怎么做                       | 人工评审                   |
| 日志               | 不直接用 `console.log`；走 `ctx.logger`，追踪日志由 `DSH_COMMANDER_TRACE=1` 控制 | ESLint + 评审              |

```bash
pnpm run lint          # eslint
pnpm run format        # prettier --write
pnpm run format:check  # CI 用
```

## 提交信息

Conventional Commits，中文正文可：

```text
feat(tools): 给 commander_expert 增加 divisions 动作
fix(workspace): 拒绝包含 .. 的 plansDir
docs(readme): 补技能加载优先级表
test(dispatch): 覆盖越界依赖序号
```

改动面较大时，提交信息正文写清「改了什么 / 为什么 / 怎么验证」。

## 新增一个工具（例如 `commander_xxx`）

1. 在 `lib/index.js` 用 `defineTool` 定义：`name`、`description`（写清**什么时候用**）、`parameters`（每项带 `description`）、`output: TEXT_OUTPUT`、显式 `isConcurrencySafe`。
2. 写盘只能走 `lib/workspace.js` 的 `resolvePlansTarget` / `readPlansText` / `writePlansText`——**禁止 `node:fs` 直接写**，否则破坏会话沙箱。
3. 在 `test/plugin.test.mjs` 用 stub ctx 覆盖：正常路径、非法参数、写盘失败、跨任务/跨文件保护。
4. 同步更新：README 的工具表与「工具签名（0.1.x 冻结）」、`CHANGELOG.md`、`lib/charter.js` 的机械动作列表。
5. 工具名与参数一旦发布就是**公开契约**：改名/改语义要走 major。

## 新增或修改一位专家

1. 改 `lib/experts.js` 的 `EXPERT_CATALOG`：`slug`、`name`、`division`、`summary`、`summon`、`inputs`、`deliverables`、`acceptance`、`forbidden`、`penalties`、`handoff`。
2. 验收判据必须**可机械判定**（命令 + 期望输出，或文件清单）；扣分只能在 `-15 / -20 / -25 / -40` 四档。
3. `pnpm run roster` 重新生成技能附录，`pnpm run roster:check` 应通过（测试里也有同步断言）。
4. 真机验证：`DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open` → 看到 `skill "commander" registered (... chars)`。

## 提 PR 之前

- [ ] `pnpm run check` 全绿
- [ ] 改了工具签名/阻断码 → README 与 `RELEASE-CHECKLIST.md` 同步
- [ ] 改了常驻纪律段 → 贴出新的字符数（每个会话都要付 token）
- [ ] 没有新增 `node:fs` 写盘、没有把密钥/本地绝对路径写进代码
- [ ] 本地路径（`/Users/...`）不该出现在源码里；示例用 `<workspace>` 占位

## 报告问题

用 `.github/ISSUE_TEMPLATE/bug_report.yml`，附：DSH / Node / 插件版本、`DSH_COMMANDER_TRACE=1` 启动日志、工具原始返回、会话权限档位。安全类问题不要开公开 issue，见 [SECURITY.md](SECURITY.md)。

## 许可

贡献即同意以 [MIT](LICENSE) 许可发布。
