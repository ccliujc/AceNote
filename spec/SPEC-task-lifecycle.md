# Spec: AceNote 每日记录与任务生命周期（task-lifecycle）

上游能力地图：`spec/CAPABILITY-MAP.md`

## 目标

在本地 capture 能力之上，提供按记录日期浏览待办、完成与归档状态、自然语言完成指令、状态恢复和每日完成统计。

成功意味着：用户能在同一条输入框中记录新待办或告诉桌宠某项已完成；唯一匹配时直接完成，多个或零个匹配时绝不擅自修改数据；已完成和已归档任务可恢复到未完成；每日统计按实际完成日期计算。

## 范围

### 包含

- 按 `recordDate` 选择日期并查看当天记录的待办。
- 未完成、已完成、手动归档三种互斥状态。
- 完成时间、完成日期和完成时区的记录。
- 统一输入框的“新增待办”与“完成事项”意图判断。
- 自然语言完成目标的本地唯一匹配、歧义选择和零匹配提示。
- 手动归档、状态恢复和恢复后的时间字段清理。
- 按实际完成日期计算的每日完成统计。
- 统一输入的本地原文暂存、解析失败和重试。

### 不包含

- 截止提醒、提醒补发和系统通知；由 `reminders` 负责。
- 悬浮桌宠、网球场和击球动效；由 `desktop-experience` 负责。
- 账号、云端同步和跨设备数据归属；由 `identity` 负责。
- 任务删除、批量操作、重复任务、子任务和标签。
- 基于完成时间的历史趋势图表。

## 技术栈

沿用已批准技术栈：Electron、React、TypeScript、SQLite（`better-sqlite3`）、Node.js + NestJS、DeepSeek API、Zod、Vitest。

本模块新增或扩展：

- SQLite `tasks` 表状态字段与 `intake_events` 本地输入表。
- `packages/contracts` 中的意图联合类型、状态转换和统计契约。
- 本地解析服务 `POST /v1/parse` 的意图联合响应。
- React 日期导航、状态操作和完成目标选择界面。

## 数据与行为约定

### 任务状态

`tasks.status` 为互斥枚举：

- `open`：未完成，显示空心网球。
- `completed`：已完成，显示实心网球，记录 `completedAt`。
- `archived`：手动归档，显示带斜线网球，记录 `archivedAt`。

新增字段：

- `status`：默认 `open`，数据库约束为上述三个值。
- `completedAt`：可空带时区时间戳；仅 `completed` 状态非空。
- `completionDate`：可空 `YYYY-MM-DD`；完成时按设备本地时区生成，用于稳定统计。
- `completionTimeZone`：可空 IANA 时区；完成时写入。
- `archivedAt`：可空带时区时间戳；仅 `archived` 状态非空。

状态转换：

| 当前状态 | 允许操作 | 结果 |
|---|---|---|
| `open` | 文字完成指令或确认完成 | `completed`，写入完成时间和完成日期 |
| `open` | 手动归档 | `archived`，写入归档时间 |
| `completed` | 恢复 | `open`，清空完成相关字段 |
| `archived` | 恢复 | `open`，清空归档时间 |

任何非法转换必须由服务层拒绝。恢复和状态变更使用当前任务 `revision` 做原子条件更新，避免旧界面覆盖新状态。

`recordedAt`、`recordDate`、`dueDate`、`dueTime` 与完成、归档字段相互独立。完成或归档不得改写记录日期和截止信息。

### 统一输入与意图

统一输入框的一次提交按以下顺序处理：

1. 去除首尾空白并校验非空、最长 2,000 字符。
2. 在 SQLite `intake_events` 中保存原文、接收时间、设备本地日期、时间和时区，状态为 `pending`；保存失败时不得调用模型。
3. 调用本地解析服务判断意图：
   - `create`：返回一个 `ParsedTask`，沿用 capture 的字段校验。
   - `complete`：返回 `completionTarget`，即用户所指事项的文字片段。
4. `create` 时，在同一本地事务中创建任务并标记 intake 为 `resolved`；任务的 `recordedAt` 使用 intake 接收时间。
5. `complete` 时，不创建新任务；通过本地匹配规则处理完成目标。
6. 解析失败、超时或输出非法时，intake 标记为 `failed`，保留原文并允许重试。不得自动改为新增待办。
7. 用户可将失败或无法匹配的输入明确选择“作为新待办保存”，此时才进入 `create` 流程。

`intake_events` 至少包含：UUID、原文、接收时间、本地日期、本地时间、时区、状态（`pending`、`awaiting_selection`、`resolved`、`failed`）、意图、错误码、创建和更新时间。

完成指令处理成功后保留最小审计信息，不重复创建任务。相同任务重复完成时，应提示已无未完成匹配，不重复写入完成时间。

### 完成目标匹配

模型不得返回或修改任务 ID、状态或时间。完成目标必须由本地规则裁决：

1. 去除目标中的空白、常见标点，以及“已完成”“做完了”“完成了”“搞定”等指令词。
2. 仅在 `open` 状态任务中筛选。
3. 规范化后与任务标题完全相等，视为明确候选。
4. 若无完全相等项，则筛选满足以下任一条件的任务：
   - 目标包含于任务标题，或任务标题包含于目标；
   - 目标与 `contact` 规范化后完全相等。
5. 唯一候选：立即更新为 `completed` 并记录完成信息。
6. 多个候选：intake 进入 `awaiting_selection`，展示候选列表；用户选择前不得修改任何任务。
7. 零候选：提示未找到匹配事项，并提供重新输入或“作为新待办保存”，不得猜测任务。
8. 同一候选被用户通过其他界面先完成或归档时，本次选择必须失败并提示状态已变化。

候选列表至少显示标题、记录日期和对接人，避免同名任务误选。

### 每日列表与统计

- 日期导航默认选中设备当前本地日期，可选择其他日期。
- 列表按所选 `recordDate` 查询，包含当天记录的全部状态，并按创建时间排序。
- 已完成、已归档事项在当天列表中继续可见，并可通过状态筛选查看。
- 每日完成统计定义：`completionDate` 等于所选日期的 `completed` 任务数，与任务 `recordDate` 无关。
- 恢复任务后清空 `completionDate`，该任务不再计入原完成日统计。
- `archived` 任务不计入完成统计，也不自动视为完成。
- 统计使用任务完成时保存的 `completionDate` 和 `completionTimeZone`，不因之后切换系统时区而改变。

### 解析服务契约扩展

`POST /v1/parse` 响应调整为意图联合：

```ts
type ParseIntentResult =
  | { intent: 'create'; task: ParsedTask }
  | { intent: 'complete'; completionTarget: string };
```

- 模型提示必须要求只输出上述两种结构之一，禁止输出任务 ID、状态或完成时间。
- `completionTarget` 去空白后长度 1–200；不得返回空字符串。
- 服务端使用 Zod 判别联合校验，非法输出返回稳定错误码，不写入任务状态。
- 本次扩展需在实施前同步修订 `spec/SPEC-capture.md` 的解析响应契约和对应测试。

## 命令

```bash
# 安装依赖
npm ci

# 启动本地解析服务和桌面端
npm run dev

# lint、类型检查与全量测试
npm run lint
npm run typecheck
npm test

# 运行本模块测试
npm run test --workspace @acenote/desktop -- lifecycle
npm run test --workspace @acenote/server -- intent

# 覆盖率门槛
npm run test:coverage --workspace @acenote/desktop

# 全量构建
npm run build
```

## 项目结构

```text
AceNote/
├── apps/
│   ├── desktop/
│   │   ├── src/main/
│   │   │   ├── lifecycle-service.ts       # 状态转换、完成匹配与统计
│   │   │   ├── intake-repository.ts      # 原文暂存与意图状态
│   │   │   ├── task-repository.ts        # 扩展状态字段和原子更新
│   │   │   └── migrations/002-task-lifecycle.sql
│   │   ├── src/renderer/
│   │   │   ├── date-navigator.tsx
│   │   │   ├── completion-picker.tsx
│   │   │   └── task-list.tsx
│   │   └── test/lifecycle/
│   └── server/
│       ├── src/parse/intent-parser.ts
│       └── test/intent/
├── packages/contracts/src/lifecycle.ts
├── spec/SPEC-task-lifecycle.md
└── tasks/
```

## 代码风格

沿用 TypeScript 严格模式、Zod 边界校验、显式 `null` 和主进程独占 SQLite 访问。状态转换集中定义，禁止在组件中直接拼装 SQL 或修改状态字符串。

```ts
export type TaskStatus = 'open' | 'completed' | 'archived';

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ['completed', 'archived'],
  completed: ['open'],
  archived: ['open'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}
```

- 状态值、错误码和模型响应使用判别联合，避免布尔标志堆叠。
- 日期工具必须显式接收 IANA 时区，禁止依赖测试机器的默认时区。
- 界面操作使用“未完成 / 已完成 / 已归档”用户语言。

## 测试策略

- 状态机单元测试覆盖所有合法和非法转换，以及并发修订冲突。
- 完成匹配测试覆盖精确标题、包含关系、对接人、多候选、零候选、重复完成和候选状态变化。
- intake 测试覆盖调用模型前保存、重启恢复、失败重试、作为新待办保存和原文不可变。
- 模型契约测试覆盖 `create`、`complete`、缺失字段、空目标、额外字段和非法联合类型。
- UI 测试覆盖日期切换、状态筛选、歧义选择、零匹配提示、归档、恢复和统计更新。
- 统计测试固定时区，覆盖旧任务今天完成、完成任务恢复、归档任务排除和跨时区稳定性。
- 迁移测试从现有 `capture` 数据库升级，默认将历史任务设为 `open`，且不改变已保存字段。
- task-lifecycle 关键模块语句和分支覆盖率均不低于 80%；状态机和完成匹配分支必须全部覆盖。
- 测试不访问真实 DeepSeek，不使用系统当前时间作为隐式输入。

## 边界

### 总是做

- 调用模型前保存统一输入原文，失败后保留可重试入口。
- 使用本地确定性规则匹配任务，并仅对唯一 `open` 候选执行完成。
- 在服务层集中校验状态转换、修订号和时间字段。
- 完成时写入设备本地 `completionDate` 与 `completionTimeZone`。
- 恢复时清空对应状态时间字段，原子更新统计来源。
- 提交前运行本模块测试、类型检查和 lint。

### 先问再做

- 修改已完成任务与归档任务的状态含义、恢复规则或统计口径。
- 增加手动“标记完成”按钮之外的新操作入口或批量操作。
- 修改完成匹配规则、模糊匹配阈值或候选排序。
- 扩展数据库 schema、解析响应契约或增加跨模块依赖。
- 引入任务删除、历史趋势或云端同步。

### 绝不做

- 让模型直接返回、修改或选择任务 ID、状态和完成时间。
- 在多个或零个候选时自动完成某个任务。
- 因意图解析失败而丢弃原文、静默创建任务或修改已有任务。
- 将完成日期、截止日期和记录日期混为同一字段。
- 用客户端状态覆盖已变化的服务层任务状态。

## 成功标准

1. 用户可选择日期，查看该 `recordDate` 记录的全部状态任务；切换日期不改变任务状态。
2. 统一输入在调用模型前写入 intake；断网或模型失败后，应用重启仍能看到原文并重试。
3. 输入明确的新待办时，创建任务并使用 intake 接收时间作为 `recordedAt`，不额外生成重复记录。
4. 输入完成指令且只有一个明确匹配项时，该任务变为 `completed`，写入完成时间、完成日期和时区。
5. 存在多个匹配项时显示候选，选择前任何任务状态都不改变；选择后仅目标任务完成。
6. 不存在匹配项时提示未找到并允许改存为新待办，不自动修改或创建任务。
7. 重复提交同一完成指令不会重复写入完成时间或影响统计。
8. 未完成可归档为 `archived`；已完成和已归档均可恢复为 `open`，并清空对应状态时间字段。
9. 已完成和已归档分别显示为不同状态，归档任务不计入完成统计。
10. 日期选择的完成统计按 `completionDate` 计算，今天完成的旧任务计入今天；恢复后从统计中移除。
11. 模型输出额外字段、任务 ID、状态或空目标时被拒绝，任务数据保持不变。
12. 现有 capture 数据迁移后全部为 `open`，原文、记录日期、截止字段和解析状态不丢失。
13. task-lifecycle 测试、类型检查和 lint 全部通过，覆盖率达到本规格要求。

## 待决问题

无规格阻塞项。实施前需按本规格修订 capture 的解析响应契约，并单独获得该修订批准。
