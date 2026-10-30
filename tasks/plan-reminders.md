# 技术计划：AceNote reminders

依据：`spec/SPEC-reminders.md`（已批准）

## 交付目标

在 Electron 运行期间，为具有截止时间的未完成任务提供一次、可取消的应用内提醒。只有日期的事项在当地时间 09:00 提醒；应用退出期间错过的不补发；不申请系统通知权限。

本计划不实现系统通知、后台唤醒、稍后提醒、桌宠动效、账号或云端推送。

## 组件与依赖

| 组件 | 职责 | 依赖 |
|---|---|---|
| Reminder 契约 | 提醒状态、提醒视图、调度输入、IPC 事件 schema | 现有 contracts |
| SQLite 迁移 003 | 创建 `reminders` 表、任务唯一约束、状态和查询索引 | 契约 |
| 时间工具 | 本地日期时间与时区转 UTC、09:00 默认、DST 处理 | 无新增运行时依赖 |
| Reminder 仓储 | 创建/替换计划、取消、错过标记、条件触发、活动列表 | 迁移 003 |
| Reminder 调度器 | 15 秒轮询、会话起点过滤、原子抢占、到期事件 | 仓储、时间工具 |
| 任务联动 | 创建、编辑、完成、归档、恢复后更新提醒计划 | LifecycleService、ReminderService |
| 应用内提醒 IPC | 主进程推送、渲染进程关闭；最小类型化通道 | 调度器、契约 |
| Reminder Center | 活动提醒排序、逐条关闭、逾期标识 | IPC、现有页面 |
| 验证 | 时间、调度、持久化、状态联动和 UI 集成测试 | 各组件 |

## 数据设计

`reminders` 表：

- `task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE`，一个任务最多一条当前计划。
- `scheduled_at TEXT NOT NULL`：UTC ISO 时间。
- `time_zone TEXT NOT NULL`：计算时使用的 IANA 时区。
- `status TEXT NOT NULL`：`scheduled|fired|cancelled|missed`。
- `fired_at TEXT`、`created_at TEXT NOT NULL`、`updated_at TEXT NOT NULL`。
- 索引：`(status, scheduled_at)` 用于到期查询。

迁移 003 单事务、幂等并写入 schema 版本 3。迁移只为已有未来截止任务生成计划时需要明确：为避免启动时误补发，历史任务不批量回填；首次启动扫描时按未来截止时间补建计划，过去截止任务不创建提醒。

## 时间计算

- 纯函数 `reminderAt(dueDate, dueTime, timeZone): Date | null`。
- 无 `dueDate` 返回 `null`；无 `dueTime` 使用 `09:00`。
- 将本地年月日时分转换为 UTC 时，使用 `Intl.DateTimeFormat` 获取时区偏移，并进行二次偏移校正以覆盖 DST。
- 不存在的本地时间按 `Intl` 的实际归一化结果处理；重复的本地时间选择第一次出现。
- 只有 `dueTime`、非法日期、非法时区或无法解析时返回 `null`，不阻塞任务操作。
- 所有函数接收显式 `now` 与时区，测试不读取系统默认值。

## 调度与并发

- 主进程启动时记录 `sessionStartedAt`。
- 启动扫描把 `scheduled_at < sessionStartedAt` 的记录标记为 `missed`，绝不发送。
- 调度器每 15 秒查询 `scheduled && scheduled_at <= now` 且任务仍为 `open` 的计划。
- 触发使用 `UPDATE ... WHERE task_id = ? AND status = 'scheduled'` 条件抢占；只有 `changes=1` 才发送事件。
- 触发后写入 `fired_at`，同一任务后续轮询不会再次产生事件。
- 查询必须联表检查任务状态；已完成或已归档任务即使有残留计划也不触发，并顺手取消。
- 定时器依赖注入，单元测试使用 fake timer；应用退出时停止定时器。
- 关闭事件只移除渲染层活动提醒，不修改数据库任务或提醒历史。

## 任务状态联动

- `LifecycleService` 在任务创建成功后调用提醒服务，未来截止时间则 upsert `scheduled`。
- 编辑截止字段后重新计算：未来则替换 `scheduled_at`、`time_zone`、`status=scheduled`、`fired_at=NULL`；无未来截止则取消。
- 完成和归档后取消计划。
- 恢复后若截止时间仍未来，重新创建计划；已过去则保持取消或不创建。
- 提醒更新失败不得回滚已成功的任务操作；记录稳定错误并依赖下一次调度扫描/启动对账修正。
- 对账规则：任务无有效未来截止或非 open 时取消；任务 open 且有未来截止但无计划时创建。
- 使用任务 revision 读取快照，提醒写入不直接修改任务。

## 应用内呈现与 IPC

- 主进程增加事件 `reminder:due`，payload 仅含提醒 ID、任务 ID、标题、截止日期时间、计划时间。
- preload 只暴露 `onReminderDue(listener)` 和 `dismissReminder(reminderId)`；返回取消订阅函数。
- 渲染进程维护当前会话活动提醒列表，按 `scheduledAt` 升序排列，以提醒 ID 去重。
- `ReminderCenter` 在已有页面顶部以非阻塞横幅/侧栏呈现；逐条关闭。
- 列表任务根据本地日期比较显示“已逾期”，与提醒状态无关。
- 不调用 Electron Notification API，不触发权限请求。
- README 补充“仅应用运行期间提醒”的限制和“不补发”规则。

## 实现顺序

1. **契约与时间工具**：提醒 schema、提醒视图、IPC 事件和时区转换纯函数。
2. **迁移与仓储**：建立 reminders 表，实现 upsert、cancel、miss、条件触发和活动查询。
3. **调度器**：实现会话起点、轮询、并发抢占和到期事件。
4. **状态联动**：在生命周期服务中接入创建、编辑、完成、归档、恢复对账。
5. **IPC 与界面**：主进程推送、preload 订阅、Reminder Center 和逾期标识。
6. **集成验证**：重启、错过、重复轮询、DST、状态变更和完整 UI 流程。

## 可并行与串行关系

- 契约完成后，时间工具与迁移/仓储可并行。
- 调度器依赖仓储；状态联动依赖调度服务和生命周期服务。
- IPC 契约固定后，Reminder Center 可与调度器并行开发。
- 重启、DST 和端到端测试必须最后串行验证。

## 风险与缓解

| 风险 | 缓解策略 |
|---|---|
| 重启后补发历史提醒 | `sessionStartedAt` 过滤 + 启动扫描标记 missed |
| 并发轮询重复提醒 | 条件更新抢占，只有成功者发事件 |
| DST 导致提前/延后一小时 | 显式时区偏移二次校正，固定 DST 边界测试 |
| 任务完成后仍提醒 | 到期查询联表校验 `open`，状态联动取消失败时对账 |
| 提醒失败阻塞任务操作 | 联动采用 best-effort，不回滚已成功任务 |
| 时间计算依赖系统时区 | 显式 timeZone 参数和可注入时钟 |
| 多提醒 UI 重复或乱序 | 按 reminder ID 去重，按计划时间稳定排序 |
| 用户误以为退出后仍通知 | README 和界面明确限制，不申请系统权限 |

## 验证检查点

### 检查点 1：时间与迁移

- 日期-only 得到当地 09:00；有时刻得到指定时刻；无日期返回 null。
- DST 前后、跨午夜和非法时区测试通过。
- 迁移 003 幂等；已有任务不丢失；版本为 3。

### 检查点 2：一次触发与错过

- 启动前到期计划被标记 missed，重启/轮询均不发送。
- 会话内到期只发送一次；并发轮询条件更新只有一个成功。
- 多提醒按 scheduledAt 排序。

### 检查点 3：状态联动

- 编辑未来截止后只有新计划；编辑为过去/清空取消。
- 完成/归档取消；恢复未来重新开始，恢复过去不提醒。
- 提醒写入失败不阻断任务状态操作，对账可修复。

### 检查点 4：UI 与集成

- Reminder Center 显示、去重、排序和逐条关闭正常，不阻塞列表操作。
- 逾期标识独立于提醒。
- 应用重启后的旧提醒不出现；系统通知 API 未被调用。

### 检查点 5：交付

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage --workspace @acenote/desktop
npm run build
```

- 全部命令通过；提醒关键模块语句和分支覆盖率不低于 80%。
- macOS 人工完成到期、关闭、修改、完成和重启检查；Windows 结果不在未执行时声称通过。

## 完成定义

计划获批后进入任务拆解。任何增加系统通知、后台常驻、稍后提醒、自定义提前量或修改 09:00/不补发规则的变更，必须先更新并批准规格。
