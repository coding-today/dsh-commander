# 发布前清单（0.1.0-rc.1）

更新时间：2026-10-29
结论：**可以进入 RC 发布流程，但发布前必须处理「包名」与「依赖重复」两项**，其余为可选改进。

---

## 一、已验证（有证据）

| 项 | 证据 |
| --- | --- |
| 单元与集成测试 | `node --test test/*.test.mjs` → **43/43 通过**（77ms） |
| 名册与技能附录同步 | `node scripts/render-roster.mjs --check` → `roster appendix is up to date` |
| 真机挂载 | `DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open` 日志：`skill "commander" registered (83751 chars)` / `tools registered: commander_dispatch_check / commander_scoreboard / commander_ledger / commander_expert` / `mounted (skill=true charter=true tools=true)` |
| 与宿主无关的激活失败 | `did not activate` 仅 2 条：`web-ui-task-board`（ledger 已被另一进程占用）与 `experimental-inspector`（fetch accessor），均与 commander 无关 |
| profile 侧可解析 | `cd ~/.dsh/profiles/web && node -e "import('dsh-commander')"` → 导出 `Config/apply/inject/name` |
| 打包内容 | `npm pack --dry-run` → **13 files / 120.1 kB packed / 277.1 kB unpacked** |
| 沙箱合规 | 写盘全部经 `ctx.fs`（`resolve` / `lstat` / `readText` / `writeText`），插件**不接受 `dir` 参数**，根为会话工作目录 |
| 关键改造 | B1/B2/B3、R1–R9、S1–S8、D1/D5/D6/D7/D9 已落地（见 CHANGELOG 与 git 历史） |

## 二、发布阻断项（必须先做）

1. **包名冲突**：npm 上 `dsh-commander` 已被 `yusi5587` 占用（v0.1.4，2026-08-19）。
   - 方案：改 `@yuxianglin/dsh-commander`（作者 npm scope 推定，未验证归属）。
   - 改名必须三处同步：`package.json.name`、`cordis.patch.yml` 的 `id` 与 `name`、README 安装命令。
   - 若 `@yuxianglin` scope 不可用，备选：`dsh-cmdr`、`dsh-commander-plugin`、`dsh-discipline`（`dsh-crew` 已占）。

2. **依赖重复（R5 未真正解决）**：profile 内解析不到 `@deepseek-ai/dsh-tools` 的 peer，插件只能在 `dependencies` 里自带一份 **0.2.1-rc.2**。
   - 后果：宿主与插件各自持有一份 `defineTool`，`instanceof` 类身份检查若被加严会分裂。
   - 缓解：版本精确钉死 + `engines.dsh` 版本闸；需要上游提供「工具定义契约包」作为纯 peer 才能根治。
   - 发布时在 README 的兼容性段保留这条说明，别让用户以为是普通依赖。

## 三、发布前建议做（非阻断）

3. **全新环境的安装冒烟**：现在只在已装过依赖的本机验证。发布后应在一个干净 profile 里 `dsh plugin --profile web add @scope/pkg@next` → 启动 → 看 `mounted` 三行。
4. **官方源登录**：本机 `~/.npmrc` 指 npmmirror，`npm whoami` 401。发布用 `npm login --registry=https://registry.npmjs.org`，首发 `npm publish --tag next`。
5. **README 双语**：当前中文主文档 + English summary；市场里的样板（dsh-pua / dsh-code-review）是双文件或双语全文。
6. **截图**：工具输出是纯文本，没有 UI 可截；若要做图，用终端渲染的闸门报告截图即可，别伪造界面。
7. **CI**：无。建议加一个只跑 `npm test && npm run roster:check` 的 workflow，防名册与代码漂移。
8. **类型**：纯 JS，无 `.d.ts`。若插件被别的插件 import（`exports` 已开 `./experts`、`./dispatch` 等），建议补 JSDoc→`tsc --checkJs`。

## 四、已知限制（写进文档即可，不算 bug）

9. **名册硬编码**：19 位专家写在 `lib/experts.js`，用户增删要改代码 + 跑 `render-roster.mjs` + 重启；运行时不可配置。
10. **只读会话写盘失败只报错**，不自动降级为「输出到对话」——这是有意的（只读就是只读）。
11. **仅在 macOS + Node 22.22.3 + DSH 0.2.1-rc.2 验证过**；Windows 路径分隔符（`assertSafeRelative` 已处理 `\`）与 Linux 未实测。
12. **不自动派活**：插件只做闸门/名册/落盘，真正派发仍靠 Agent Teams 或 subagent；`spawn_teammate` 链路未做集成测试。
13. **技能可被项目级同名技能覆盖**（优先级 250 < project 100/200）：正文可被盖，工具不会被盖——已写入 README「技能加载优先级」。

## 五、发布步骤（照做即可）

```bash
cd ~/.dsh/local-plugins/dsh-commander
# 1) 改名（三处同步）后确认
npm run roster:check && npm test
# 2) 官源登录
npm login --registry=https://registry.npmjs.org
# 3) 看清单
npm pack --dry-run
# 4) 发 RC
npm publish --tag next
# 5) 干净环境冒烟
dsh plugin --profile web add <新包名>@next
DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open
```
