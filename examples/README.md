# 示例

这里的输出是**真跑出来的**，不是手写的：`gate-output*.txt` 由 `lib/dispatch.js` 对同目录的 JSON 输入生成。

| 文件 | 说明 |
| --- | --- |
| `dispatch-batch.json` | 一批能通过的派发：两条任务、审查依赖实现、都点名了专家、都有可机械判定的验收标准 |
| `gate-output.txt` | 上面那批的闸门报告：`通过（无阻断项）` |
| `dispatch-batch-blocked.json` | 一批典型的坏派发：没写验收标准、执行者空着、审查没有上游 |
| `gate-output-blocked.txt` | 上面那批的闸门报告：逐条给出阻断码与改法 |

重新生成（改完 `lib/dispatch.js` 后应重跑）：

```bash
node - <<'JS' > examples/gate-output-blocked.txt
import { checkDispatch, formatDispatchReport } from './lib/dispatch.js';
import { expertSlugs } from './lib/experts.js';
import { readFileSync } from 'node:fs';
const args = JSON.parse(readFileSync('examples/dispatch-batch-blocked.json', 'utf8'));
const result = checkDispatch(args.tasks, { running: args.running, knownExperts: expertSlugs() });
console.log(formatDispatchReport(result).trim());
JS
```
