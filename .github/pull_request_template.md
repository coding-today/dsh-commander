## 这个 PR 做了什么

<!-- 一句话；如果改的是工具名/参数/阻断码，明确写出「破坏兼容性」 -->

## 为什么

<!-- 对应 issue、失效现场、或之前的讨论 -->

## 改完的验证

- [ ] `pnpm run check`（lint + format + roster + test）全绿
- [ ] 若改了 `lib/experts.js`：已跑 `pnpm run roster`，`assets/commander.md` 同步更新
- [ ] 若改了工具签名：README 的「工具签名（0.1.x 冻结）」与 `RELEASE-CHECKLIST.md` 已同步
- [ ] 若改了 `charter.js`：贴出新的字符数（常驻段每个会话都要付 token）

## 兼容性

<!-- 是否影响 0.1.x 已冻结的工具名/参数/阻断码；是否影响 DSH 版本下限 -->
