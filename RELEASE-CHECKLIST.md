# 发布前清单（0.1.0-rc.1）

更新时间：2026-10-29
结论：**代码与工程规范已就绪，可以建远端仓库；npm 发布前还剩三件事要你拍板/替换。**

---

## 一、已验证（有证据，可复跑）

| 项 | 证据 |
| --- | --- |
| 单元与集成测试 | `node --test test/*.test.mjs` → **71/71 通过** |
| 静态检查 | `npx eslint .` → 0 问题；`npx prettier --check .` → `All matched files use Prettier code style!` |
| 名册与技能附录同步 | `node scripts/render-roster.mjs --check` → `roster appendix is up to date` |
| 一条命令跑全 | `pnpm run check`（lint + format:check + roster:check + test） |
| 真机挂载 | `DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open` → `skill "commander" registered (83751 chars)` / `tools registered: 四工具` / `mounted (skill=true charter=true tools=true)` |
| 与宿主无关的激活失败 | `did not activate` 仅 2 条：`web-ui-task-board`（ledger 被另一进程占用）、`experimental-inspector`（fetch accessor），与本插件无关 |
| profile 侧可解析 | `cd ~/.dsh/profiles/web && node -e "import('dsh-commander')"` → 导出 `Config/apply/inject/name` |
| 打包内容 | `npm pack --dry-run` → **32 files / 502.1 kB packed / 710.0 kB unpacked**（含 README 截图） |
| 依赖可从公网安装 | `devDependencies` 里的 `@deepseek-ai/dsh-tools@0.2.1-rc.2` 与 `@deepseek-ai/schemastery@3.18.5` 在 npmjs 与 npmmirror 均可解析（CI 不会因私有包失败）；运行时这两个包由宿主提供（`peerDependencies`） |
| Git 历史 | `main` 分支，`git log --oneline` 见提交清单；工作树干净 |

## 二、开源工程规范（本轮补齐）

| 面 | 文件 | 说明 |
| --- | --- | --- |
| 格式化 | `.prettierrc.json` / `.prettierignore` | tab 缩进、单引号、120 列、LF |
| 静态检查 | `eslint.config.js` | `@eslint/js` recommended + 少量正确性规则（`eqeqeq`/`no-var`/`no-unused-vars`） |
| 编辑器一致性 | `.editorconfig` / `.gitattributes` | 编码、行尾、缩进；文本统一 LF |
| CI | `.github/workflows/ci.yml` | Node 22 + pnpm，跑 lint → format:check → roster:check → test → pack |
| 贡献流程 | `CONTRIBUTING.md` | 代码与 JSDoc 用英文、用户文案用中文；新增工具/专家的步骤与清单 |
| 安全 | `SECURITY.md` | 私有渠道报告 + 本插件的安全边界（沙箱、路径校验、无 shell 执行） |
| 社区 | `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 改编 |
| Issue/PR | `.github/ISSUE_TEMPLATE/*`、`pull_request_template.md` | 结构化必填项，要求贴证据 |
| 示例 | `examples/` | 一份能通过的批次、一份被三条阻断拦下的批次，输出由脚本真跑生成 |
| 忽略规则 | `.gitignore` | node_modules / tgz / 日志 / .env 等 |

## 三、npm 发布阻断项（必须处理）

1. **包名冲突**：npm 上 `dsh-commander` 已被 `yusi5587` 占用（v0.1.4，2026-08-19）。
   - 方案：`@coding-today/dsh-commander`（实测 GitHub 账号 `coding-today`；npm 上该 scope 是否为你所有，`npm login` 后 `npm whoami` 验证）。
   - 改名三处同步：`package.json.name`、`cordis.patch.yml` 的 `id`/`name`、README 安装命令 + 徽章链接。
   - 备选：`dsh-cmdr`、`dsh-commander-plugin`、`dsh-discipline`（`dsh-crew` 已占）。

2. **仓库地址是占位**：`package.json` 的 `repository` / `homepage` / `bugs` 与 README 的 CI 徽章都指向
   `https://github.com/coding-today/dsh-commander`。建仓库后如果用户名不同，**四处一起替换**，否则徽章 404、npm 的 `repository` 也会指错。

3. ~~**依赖双份（结构性取舍）**~~ → **已推翻（issue #1）**：宿主包必须走 `peerDependencies`，绝不能写进 `dependencies`。
   - 原来的假设「宿主的 peer 在 profile 内解析不到」是错的：插件解析宿主包走的是
     `~/.dsh/profiles/node_modules/@deepseek-ai/*` 这组软链（指向应用自带的包），实测可解析。
   - 写进 `dependencies` 的后果不是「各持一份」而是**启动失败**：profile 是 hoisted 安装，
     `@deepseek-ai/dsh-tools` 会被装成实体副本并顶掉宿主的 `tools` 服务，副本缺
     `@deepseek-ai/cordis`（`autoInstallPeers: false` 不补）→ 导入失败 → `1 required plugin did not activate`。
   - 现在由 `test/package.test.mjs` 守着；发布前确认 `dependencies` 为空、两个宿主包在 `peerDependencies`。
   - 仍需跟版本的是 `engines.dsh`：宿主升到 0.2.2+ 时同步调下限。

## 四、发布步骤

```bash
cd ~/.dsh/local-plugins/dsh-commander
# 1) 改包名（三处）+ 替换四处仓库地址
pnpm run check
# 2) 官源登录（本机 ~/.npmrc 指向 npmmirror 时 npm whoami 会 401）
npm login --registry=https://registry.npmjs.org
# 3) 看清单
npm pack --dry-run
# 4) 发 RC
npm publish --tag next
# 5) 干净环境冒烟
dsh plugin --profile web add <新包名>@next
DSH_COMMANDER_TRACE=1 dsh --profile web --port 8100 --no-open
```

## 五、已知限制（写进 README 即可，不算 bug）

- 名册 19 位硬编码在 `lib/experts.js`，增删要改代码 + `pnpm run roster` + 重启。
- 只读会话下写盘会被沙箱拒绝并返回错误，不自动降级为「输出到对话」（有意）。
- 仅在 macOS + Node 22.22.3 + DSH 0.2.1-rc.2 实测；Linux/Windows 未测（`assertSafeRelative` 已处理 `\`）。
- 插件不自动派活，`spawn_teammate` 链路未做集成测试。
- 技能可被项目级同名技能覆盖：runtime 优先级 250 比 project 的 100/200 **大**（数字越小越优先），
  故项目级同名技能会盖住本插件的技能正文；工具与纪律段不受影响。
- README 为中文主文档，完整英文版见 `README.en.md`，两版结构一一对应。
