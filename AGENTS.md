# AGENTS.md

给在本仓库里干活的 AI 代理（以及人）看的硬约束。违反其中任何一条，PR 会被退。

## 不变量（别破）

1. **写盘只能走 `lib/workspace.js`**：`resolvePlansTarget` / `readPlansText` / `writePlansText`。
   禁止 `node:fs` 直接写文件——那会绕过会话沙箱（只读会话必须写不进去）。
2. **工具名、参数名、阻断码是公开契约**：`commander_dispatch_check` / `commander_expert` / `commander_scoreboard` / `commander_ledger`，
   以及 `D1_no_assignee` … `D6_unknown_expert`、`W1_no_files` … `W4_no_expert`。改名/改语义 = major 版本。
3. **不接受 `dir` 参数**：写入根永远是会话工作目录；`plansDir` / `ledgerFile` 必须过 `assertSafeRelative`。
4. **常驻纪律段要短**：`lib/charter.js` 每个会话都要付 token，涨到 2k 字符以上要先说明理由。
5. **名册两处必须同步**：改 `lib/experts.js` 后跑 `pnpm run roster`；`pnpm run roster:check` 不过就是没改完。
6. **语言分工**：代码与 JSDoc 英文；面向用户的字符串（工具描述、输出、报错、文档）中文。

## 改完必须跑

```bash
pnpm run check      # lint + format:check + roster:check + test（114 个用例）
```

真机验证（可选，但改动了注册逻辑就要做）：

```bash
DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open
# 期望三行：skill ... registered / tools registered / mounted (skill=true charter=true tools=true)
```

## 目录直觉

- `lib/index.js`：唯一入口，`apply()` 里三段 `ctx.effect`（技能 / 纪律段 / 工具）。
- `lib/charter.js`：常驻纪律段文案（参数化 `maxConcurrency` / `plansDir`）。
- `lib/experts.js`：19 位专家与七项要求，`findExpert` 只在唯一命中时返回。
- `lib/dispatch.js`：纯函数闸门，无 I/O，可以放心单测。
- `lib/scoreboard.js` / `lib/ledger.js`：Markdown 生成与解析，纯函数 + 一处 `assertSameTask` 防跨任务误写。
- `assets/commander.md`：作战手册正文，末尾名册附录是脚本生成物，**不要手改**。
