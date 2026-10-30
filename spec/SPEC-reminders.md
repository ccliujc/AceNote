# Spec: AceNote 截止提醒（reminders）

上游能力地图：`spec/CAPABILITY-MAP.md`

2026-10-30：新增明确时刻省略日期默认今天的解析规则，见 [SPEC-time-only-today.md](SPEC-time-only-today.md)；已过时刻仍不补发，提醒调度规则不变。

## 目标

在桌面应用运行期间，对具有明确截止时间的未完成待办触发一次应用内提醒。只有日期的事项在当地时间 09:00 提醒；没有截止信息的任务永不提醒。

成功意味着：提醒准时、一次且可取消，不依赖系统通知权限；应用退出期间错过的提醒不会补发；修改截止时间、完成、归档或恢复时，提醒状态与任务状态保持一致。

## 已确认决策

- 应用退出或电脑关机期间错过的提醒**不补发**。
- 首期**不支持稍后提醒**。
- **不主动申请系统通知权限**，所有提醒仅在应用内呈现。
- 只有日期时默认当天 09:00；有具体时刻时按该时刻。
- 已完成或已归档任务不提醒。

## 范围

### 包含

- 根据 `dueDate`、`dueTime` 和设备时区计算提醒时间。
- 应用运行期间的本地调度、一次触发和去重。
- 应用内提醒横幅/提醒中心及手动关闭。
- 截止时间修改后的重新调度。
- 完成、归档后的提醒取消；恢复且截止时间仍在未来时重新调度。
- 重启后识别错过的历史提醒并标记为错过，不弹窗补发。

### 不包含

- macOS/Windows 系统通知、通知权限申请和通知中心集成。
- 应用完全退出后的后台唤醒、开机启动或关机期间提醒。
- 稍后提醒、重复提醒、多个自定义提醒。
- 声音、桌宠动画或击球反馈；由 `desktop-experience` 负责。
- 云端推送、跨设备提醒和账号同步。

## 技术栈

沿用 Electron、React、TypeScript、SQLite（`better-sqlite3`）、Vitest。

- 调度器运行在 Electron 主进程，使用可注入时钟和定时器。
- SQLite 保存提醒计划与触发结果，保证重启和重复轮询幂等。
- 渲染进程只接收类型化提醒事件并调用关闭操作。
- 所有日期计算显式使用 IANA 时区。

## 数据与行为约定

### 提醒记录

新增 `reminders` 表，每个任务最多一条当前提醒：

- `task_id`：唯一外键，关联 `tasks.id`。
- `scheduled_at`：UTC 带时区时间戳。
- `time_zone`：计算提醒时使用的 IANA 时区。
- `status`：`scheduled`、`fired`、`cancelled`、`missed`。
- `fired_at`：可空 UTC 时间戳。
- `created_at`、`updated_at`。

`reminders` 仅由主进程访问。任务删除不在本期范围，因此无需级联删除 UI。

### 提醒时间计算

- `dueDate` 与 `dueTime` 均为空：不创建提醒。
- 仅有 `dueDate`：提醒时间为该日期当地时间 `09:00:00`。
- 同时存在 `dueDate` 与 `dueTime`：提醒时间为该日期当地时间的具体时刻。
- 只有 `dueTime` 而没有 `dueDate` 的非法数据不创建提醒，并记录安全警告。
- 使用任务创建时的 `timeZone` 计算；缺少有效时区时回退到设备当前时区，并保存实际使用值。
- 提醒与截止时间不同：提醒可以在截止前，但本期提醒时间等于用户填写的截止时间。
- 日期解析必须处理夏令时；不存在或重复的本地时间按 JavaScript Temporal/`Intl` 规则归一化，并纳入测试。

### 调度与会话规则

- 应用启动时记录 `sessionStartedAt`；只有 `scheduled_at >= sessionStartedAt` 的提醒有资格在本会话触发。
- 启动扫描时，`scheduled` 且 `scheduled_at < sessionStartedAt` 的记录标记为 `missed`，不弹出提醒。
- 调度器按最多 15 秒间隔轮询；到期条件为 `scheduled_at <= now`。
- 触发前使用条件更新将 `scheduled → fired`；只有更新成功者可以发送应用内提醒，确保并发轮询只显示一次。
- 触发后写入 `fired_at`，直到用户关闭横幅才从活动提醒中移除；关闭不修改任务。
- 已完成或已归档任务即使提醒已到期也不得触发。

### 状态联动

- 创建或编辑任务后，若存在未来的截止时间，创建或替换 `scheduled` 提醒。
- 截止时间改为未来：取消旧计划并重新计算。
- 截止时间改为过去或移除：取消提醒；不得立即补发。
- 任务完成或归档：将当前提醒置为 `cancelled`。
- 任务从完成或归档恢复为未完成：若截止时间仍在未来，重新建立提醒；若已过去，不提醒，仅保留逾期显示。
- 任何状态联动必须与任务更新使用同一修订语义；晚到操作不得覆盖新计划。

### 应用内呈现

- 到期的提醒进入应用内提醒区域，显示任务标题、截止日期与时间。
- 同一任务最多显示一次；多个同时到期按 `scheduled_at` 升序排列。
- 用户可逐条关闭提醒；关闭仅影响提醒展示。
- 提醒区域不阻塞输入和每日列表操作。
- 任务列表对已过截止时间且仍为 `open` 的任务显示“已逾期”，与是否提醒无关。
- 不请求系统通知权限；README 明确提醒仅在应用运行时生效。

### 解析契约

提醒不改变 DeepSeek 输出结构。`dueDate` 和 `dueTime` 仍由 capture 解析，提醒模块只读取已校验字段；模型不得直接产生提醒时间、提醒状态或通知内容。

## 命令

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run test --workspace @acenote/desktop -- reminders
npm run test:coverage --workspace @acenote/desktop
npm run build
```

## 项目结构

```text
AceNote/
├── apps/desktop/
│   ├── src/main/
│   │   ├── migrations/003-reminders.sql
│   │   ├── reminder-repository.ts
│   │   ├── reminder-scheduler.ts       # 计算、轮询、会话过滤和一次触发
│   │   └── lifecycle-service.ts         # 状态变更后取消/重建提醒
│   ├── src/renderer/
│   │   ├── reminder-center.tsx
│   │   ├── lifecycle-page.tsx
│   │   └── lifecycle-task-list.tsx
│   └── test/reminders/
├── packages/contracts/src/reminders.ts
├── spec/SPEC-reminders.md
└── tasks/
```

## 代码风格

沿用严格 TypeScript、Zod 边界和主进程独占 SQLite。时间计算集中在纯函数中，禁止组件自行计算提醒。

```ts
export function reminderAt(dueDate: string, dueTime: string | null, timeZone: string): Date | null {
  if (!dueDate) return null;
  const time = dueTime ?? '09:00';
  const local = `${dueDate}T${time}:00`;
  const instant = zonedTimeToUtc(local, timeZone);
  return instant.getTime() > 0 ? instant : null;
}

export function shouldFire(reminder: Reminder, sessionStartedAt: Date, now: Date): boolean {
  return reminder.status === 'scheduled'
    && reminder.scheduledAt >= sessionStartedAt
    && reminder.scheduledAt <= now;
}
```

- 时间参数显式注入，测试不使用真实 `Date.now()` 或系统时区。
- 提醒状态转换集中实现，UI 不写状态字符串。
- 用户可见文案使用“即将截止”“已逾期”，不使用内部枚举。

## 测试策略

- 纯函数覆盖仅有日期 09:00、具体时刻、无截止、非法时间和 IANA 时区。
- 固定时钟覆盖启动前错过标记、会话内到期、轮询重复和并发条件更新。
- 状态联动覆盖截止时间修改、移除、完成、归档、恢复和晚到操作。
- SQLite 覆盖唯一约束、重启持久化、提醒只触发一次和状态查询。
- React 测试覆盖多提醒排序、逐条关闭、逾期标识和不阻塞其他操作。
- 必须证明应用重启不会补发启动前错过的提醒。
- 提醒关键模块语句和分支覆盖率均不低于 80%。
- 不访问真实系统通知接口，不依赖真实当前时间。

## 边界

### 总是做

- 在触发前原子抢占提醒状态，保证一次展示。
- 使用显式时区和可注入时钟计算提醒。
- 完成、归档或移除截止时间后取消未触发提醒。
- 启动时将历史未触发提醒标记为错过且不补发。
- 在 README 和界面明确提醒仅在应用运行时有效。

### 先问再做

- 增加系统通知、权限申请、后台常驻或开机启动。
- 增加稍后提醒、重复提醒或自定义提前量。
- 修改 09:00 默认、错过不补发或仅应用内呈现的决策。
- 修改提醒数据库 schema 或与任务状态的联动规则。
- 引入云端推送或跨设备提醒。

### 绝不做

- 在用户关闭后重复弹出同一提醒。
- 为已过期或已完成任务补发提醒。
- 因时间计算失败而阻塞任务编辑、完成或归档。
- 将提醒时间交给模型生成。
- 未经说明就静默申请系统通知权限。

## 成功标准

1. 只有日期、无具体时刻的未完成任务，在当地时间当天 09:00 触发一次应用内提醒。
2. 有日期的具体时刻任务在对应本地时刻触发一次；无截止时间任务不创建提醒。
3. 应用运行期间轮询多次或并发轮询，同一提醒只展示一次。
4. 应用启动前已到期的提醒标记为错过，启动后不补发。
5. 同时到期的多个提醒按计划时间排序展示，用户可逐条关闭。
6. 截止时间改为未来后只保留一个新计划；改为过去或清空后不再提醒。
7. 完成任务或归档后取消提醒；恢复且截止时间仍未来时重新调度，已过去则不提醒。
8. 提醒模块不会请求系统通知权限，也不会在应用退出后唤醒。
9. 逾期任务在列表中显示“已逾期”，与提醒是否已经展示相互独立。
10. 修改、完成或归档失败时，不会留下错误提醒；时间计算失败不影响任务操作。
11. 重启、迁移和时区边界测试通过；关键模块覆盖率不低于 80%。

## 待决问题

无规格阻塞项。后续若增加系统通知或后台常驻，需要单独修订本规格并重新审批。
