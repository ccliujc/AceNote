# 技术计划：AceNote task-lifecycle

依据：`spec/SPEC-task-lifecycle.md`（已批准）、`spec/SPEC-capture.md`（含已批准意图契约扩展）

## 交付目标

在现有本地 capture 客户端上交付每日列表、三态任务生命周期、统一输入意图分流、自然语言完成匹配、状态恢复和按实际完成日期统计。

本计划不实现提醒、完整桌宠、账号或云端同步。capture 已完成并保持可运行；本模块通过迁移扩展其数据，不重写已验收的原文保存、编辑和重试语义。

## 组件与依赖

| 组件 | 主要职责 | 依赖 |
|---|---|---|
| 契约扩展 | `TaskStatus`、完成字段、intake 状态、意图联合、IPC 与统计 schema | 现有 contracts |
| SQLite 迁移 002 | 为历史任务补充 `open` 状态与空完成字段；创建 `intake_events` 和索引 | 契约扩展 |
| 任务数据层 | 状态字段映射、原子状态转换、修订冲突、按日期查询和统计查询 | 迁移 002 |
| Intake 数据层 | 统一输入原文先保存、状态机、重启恢复和失败重试 | 迁移 002、契约扩展 |
| 意图解析服务 | DeepSeek 判别联合输出、严格校验、错误映射；更新现有 parse 契约 | 契约扩展 |
| 生命周期服务 | create/complete 分流、本地完成匹配、完成/归档/恢复、统计 | 任务与 intake 数据层、意图解析 |
| 安全 IPC | 扩展最小操作集：统一提交、完成候选、选候选、归档、恢复、按日期查询 | 生命周期服务 |
| 每日界面 | 日期导航、状态筛选、统一输入、候选选择、归档/恢复和统计 | IPC、现有 React 界面 |
| 验证 | 迁移、状态机、匹配、意图、UI、时区和集成测试 | 各实现组件 |

## 数据与接口设计

### SQLite 迁移 002

- `tasks` 增加 `status TEXT NOT NULL DEFAULT 'open'`，约束为 `open|completed|archived`。
- 增加可空 `completed_at`、`completion_date`、`completion_time_zone`、`archived_at`。
- 历史任务迁移后状态为 `open`，原有字段不变；迁移在单事务中执行并记录版本 2。
- 新增 `intake_events`：UUID、原文、接收时间、本地日期、本地时间、时区、状态、意图、错误码、创建和更新时间。
- 为 `tasks(record_date, created_at)` 和 `tasks(completion_date, status)` 建立索引；已有记录日期索引按需保留或合并。

### 状态与原子更新

- 状态转换由单一服务函数校验，仓储层用 `WHERE id = ? AND revision = ? AND status = ?` 原子更新。
- 完成时写入 `completedAt`、`completionDate` 和设备 IANA 时区，`revision + 1`。
- 归档仅允许 `open`；写入 `archivedAt`，`revision + 1`。
- 恢复仅允许 `completed|archived`；原子清空对应时间字段并回到 `open`。
- 所有失败返回稳定错误码：`NOT_FOUND`、`INVALID_TRANSITION`、`CONCURRENT_EDIT`、`NO_MATCH`、`MULTIPLE_MATCHES`。

### 统一输入

1. 校验原文后立即写入 `intake_events(pending)`。
2. 调用解析服务，得到 `create` 或 `complete` 联合。
3. `create`：事务中按 intake UUID 创建任务并解析 resolved；记录时间取 intake 接收时间。
4. `complete`：本地匹配 open 任务。唯一则完成；多个保存候选集合进入 awaiting_selection；零个返回无匹配。
5. 解析或匹配失败保留 intake 原文，允许重试或明确转为新待办。
6. 相同完成后再次提交同一指令，因任务不再是 open 而返回无匹配，不重复写入完成时间。

### 完成匹配

- 模型只返回 `completionTarget`，不得返回任务 ID。
- 规范化去除空白、标点及完成指令词。
- 优先标题完全相等，其次标题双向包含或对接人完全相等。
- 只查询 `open` 任务；结果按规范化标题、记录日期和 revision 稳定排序。
- 候选选择携带任务 ID 与 revision；状态已变化时返回 `CONCURRENT_EDIT`。

### 每日列表与统计

- `GET tasks by recordDate` 返回该日全部状态，按创建时间降序。
- 完成统计按 `completionDate` 与所选日期相等且 `status='completed'` 计数。
- 归档不计入；恢复清空完成信息后统计自动减少。
- 所有本地日期使用显式 IANA 时区生成，测试注入固定时钟。

### 解析服务契约

```ts
type ParseIntentResult =
  | { intent: 'create'; task: ParsedTask }
  | { intent: 'complete'; completionTarget: string };
```

- 使用 Zod 判别联合严格校验，保留 `requestId` 关联。
- 提示要求模型不得输出任务 ID、状态、完成时间或额外字段。
- `complete` 目标为空、超长或非法时返回 `PARSE_INVALID_RESPONSE`。
- 更新现有 capture 测试以消费 `create` 分支，并新增 `complete` 分支断言。

## 实现顺序

1. **契约与迁移**：扩展类型和 Zod schema，创建迁移 002，验证历史数据升级。
2. **任务仓储**：实现状态字段映射、按日期查询、原子转换、恢复和统计查询。
3. **Intake 与意图解析**：实现 intake 仓储和解析服务判别联合，可并行推进。
4. **生命周期服务**：串联 create/complete 分流、完成匹配、归档恢复和统计。
5. **IPC 扩展**：仅暴露必要操作，所有参数使用 UUID、revision 和 Zod 校验。
6. **每日界面**：重构统一输入，增加日期导航、状态筛选、候选选择、归档恢复和统计展示。
7. **集成验证**：完成迁移、断网、重启、竞态、跨时区和完整用户流程测试。

## 可并行与串行关系

- 契约与迁移必须先完成，仓储和服务依赖新字段。
- 任务仓储与意图解析服务可在契约完成后并行。
- Intake 仓储可与任务仓储并行，生命周期服务必须等待二者完成。
- IPC 必须先固定，界面才能并行使用测试替身开发。
- 迁移集成和跨时区测试必须最后串行执行。

## 风险与缓解

| 风险 | 缓解策略 |
|---|---|
| 模型误判新增与完成意图 | 原文先入 intake；失败保留并允许改存；不自动改任务状态 |
| 名称相似导致错误完成 | 仅唯一候选自动完成；多候选必须选择；零匹配不猜测 |
| 旧客户端状态覆盖新状态 | 所有状态操作使用 `status + revision` 原子条件 |
| 迁移损坏已有 capture 数据 | 单事务、默认值与回滚测试；迁移前后逐字段对比 |
| 时区变化导致统计漂移 | 完成时持久化 `completionDate` 和时间区，查询不再重算 |
| 重复完成导致重复统计 | 只匹配 open；completed/archived 排除并加幂等测试 |
| 解析契约扩展破坏 capture | 先更新契约测试；capture 仅消费 create，complete 不建任务 |
| UI 状态与候选列表过期 | 选择时提交 revision；冲突提示刷新，不静默重试 |

## 验证检查点

### 检查点 1：契约与迁移

- `npm run typecheck` 通过。
- 迁移测试从 capture 数据库升级到版本 2，历史任务全部为 open 且原字段一致。
- 重复执行迁移不重复建表或改数据。

### 检查点 2：状态机与统计

- 全部合法和非法状态转换测试通过。
- 完成、归档、恢复的 revision 冲突被拒绝。
- 固定时区测试证明旧任务今天完成计入今天，恢复后从统计移除。

### 检查点 3：意图与匹配

- 解析服务覆盖 create、complete、空目标、额外字段和非法 JSON。
- 匹配测试覆盖精确标题、双向包含、对接人、多候选、零候选、重复完成和候选状态变化。
- 测试证明模型无法传入任务 ID、状态或完成时间。

### 检查点 4：用户流程

- 断网输入保留原文；重启后可重试或改为新待办。
- 唯一完成、歧义选择、无匹配提示、归档、恢复和日期切换均可操作。
- 状态筛选与完成统计同步更新。

### 检查点 5：交付验证

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage --workspace @acenote/desktop
npm run build
```

- 所有命令通过；task-lifecycle 关键模块语句和分支覆盖率不低于 80%，状态机和完成匹配分支全覆盖。
- 在 macOS 上人工检查完整用户流程，并记录 Windows 验证为发布前事项，不伪造结果。
- 对照 `spec/SPEC-task-lifecycle.md` 的 13 条成功标准逐项记录验证结果。

## 完成定义

计划获批后才拆解任务并开始编码。任何对状态含义、统计口径、完成匹配规则、数据库 schema 或解析契约的进一步修改，必须先更新并批准规格。
