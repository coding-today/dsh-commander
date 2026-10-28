# Changelog

## 0.1.0-rc.1

首个可发布候选版。

- 注册 `commander` 技能（83,752 字符，含 19 位专家名册、7 阶段工作流、实战教训）。
- 注入常驻纪律段（约 1.4k 字符，`promptOrder` 118，`interpolate: false`）。
- 四个工具：`commander_dispatch_check`、`commander_expert`、`commander_scoreboard`、`commander_ledger`。
- 19 位专家，每位带七项要求（何时召唤 / 必须给到 / 必须交回 / 验收判据 / 禁止动作 / 扣分项 / 交接）。
- 派发闸门：6 个阻断码（D1–D6）、4 个告警码（W1–W4）。
- 记分牌与台账通过宿主文件服务写入会话工作区，遵守会话沙箱；台账超过 256 KiB 自动按月归档。
- 无发布前需改动的本地路径依赖问题（依赖在插件目录内自装，`link:` 安装后可解析）。
