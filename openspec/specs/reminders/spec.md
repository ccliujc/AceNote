# reminders Specification

## Purpose

描述 AceNote 已有的本地截止时间计算、应用运行期间的提醒调度、去重、未来计划更新和当前事件展示方式，保留不补发错过提醒的产品约定。提醒中心首次打开后的活动查询及全局关闭状态仍是已知缺口，不能作为已交付的同步能力记录。

## Requirements

### Requirement: REM-01 Reminder times use due fields and task time zones

系统 SHALL 根据事项截止日期、具体时刻和保存的时区计算提醒时刻；只有日期时使用当地 09:00，没有截止日期时不创建提醒。

#### Scenario: 只有截止日期

- **WHEN** 未完成事项的截止日期在未来且没有具体时刻
- **THEN** 系统以该日期在事项时区的 09:00 计算提醒计划

#### Scenario: 有明确具体时刻

- **WHEN** 未完成事项具有合法截止日期和具体时刻
- **THEN** 系统将对应本地时刻转换为 UTC 计划时间，而不是按解析服务器的时区计算

#### Scenario: 无截止日期

- **WHEN** 事项没有截止日期，或时间字段无法形成合法计划
- **THEN** 系统不创建有效提醒计划

### Requirement: REM-02 Only future open-task schedules are maintained

系统 SHALL 在创建、编辑或恢复事项后，为具有未来截止时间的未完成事项建立或更新一条计划；截止时间过去、被清空，或事项完成、归档时取消仍待触发的计划。

#### Scenario: 编辑未来截止时间

- **WHEN** 用户把未完成事项的截止时间改为另一个未来时刻
- **THEN** 系统更新该事项唯一的计划，不额外保留一条旧的待触发计划

#### Scenario: 完成或归档取消计划

- **WHEN** 用户完成或归档存在待触发计划的事项
- **THEN** 系统取消该待触发计划，后续调度不再为它发出到期事件

#### Scenario: 过去时刻不立即补发

- **WHEN** 用户创建、编辑或恢复一个截止时间已过去的事项
- **THEN** 系统不为它立即触发提醒，也不自动改成明天的计划

### Requirement: REM-03 Due schedules are claimed once

系统 SHALL 在 Electron 主进程运行提醒调度器，默认按 15 秒间隔轮询；到期计划只有成功从 `scheduled` 条件更新为 `fired` 的处理者才能发送事件，并保存触发时间。

#### Scenario: 重复轮询不重复发送

- **WHEN** 同一计划已经触发，后续再次轮询或同时尝试处理该计划
- **THEN** 系统不再次产生该计划的到期事件

#### Scenario: 多个计划同时到期

- **WHEN** 同一轮询中发现多个合法到期计划
- **THEN** 系统按计划时间顺序处理，单个事件交付失败不阻止其他计划继续处理

### Requirement: REM-04 Missed schedules are not replayed at startup

系统 SHALL 在启动时记录会话起点，将计划时间早于会话起点且仍待触发的记录标记为 `missed`；应用退出或电脑关机期间到期的提醒不能在启动后补发。

#### Scenario: 应用退出期间错过截止时间

- **WHEN** 用户在计划到期前退出，并在计划时间之后重新启动
- **THEN** 系统把该待触发计划标为错过，不弹出迟到提醒

#### Scenario: 启动时计划仍在未来

- **WHEN** 应用启动时存在尚未到期的计划
- **THEN** 该计划继续参与当前会话的到期轮询

### Requirement: REM-05 Reminders use live in-app events

系统 SHALL 将到期事件广播给当时已经创建的窗口；已订阅的人物显示提示，已订阅的完整记录页面把事件加入提醒中心，并按提醒 ID 去重、按计划时间排序。

#### Scenario: 已打开的窗口收到提醒

- **WHEN** 人物与完整记录页面均已加载并订阅到期事件，且一个计划成功触发
- **THEN** 人物显示对应标题，完整记录中的提醒中心显示同一提醒

#### Scenario: 不重复展示同一事件

- **WHEN** 完整记录页面再次收到同一提醒 ID 的到期事件
- **THEN** 页面不为其额外增加一条相同提醒

### Requirement: REM-06 Received reminder cards can be dismissed locally

系统 SHALL 允许用户在当前完整记录页面逐条收起已经接收到的提醒；收起仅影响提醒展示，不改变任务完成或归档状态。关闭操作失败时页面应保留提醒并允许重试。

#### Scenario: 收起提醒卡片

- **WHEN** 用户成功关闭当前页面中的一条提醒
- **THEN** 该页面移除该卡片，关联事项的任务状态保持不变

### Requirement: REM-07 Reminder operation stays inside the running app

系统 SHALL 仅在 AceNote 运行期间调度应用内提醒，不申请系统通知权限，不在显式退出后继续调度，也不提供稍后提醒、重复提醒或后台唤醒。

#### Scenario: 显式退出

- **WHEN** 用户通过应用退出入口结束 AceNote
- **THEN** 系统停止提醒调度器，本应用不继续在后台发出提醒

## Known Gaps

- F02：`listActive()` 尚未接到当前窗口 API；提醒触发之后才首次打开完整记录时，页面不能查询此前的活动提醒。
- F02：关闭 IPC 当前只校验标识，关闭状态没有统一持久化或跨窗口传播；人物气泡关闭与提醒中心关闭尚未关联。
- 完成或归档取消的是 `scheduled` 计划，不能据此声称已经清理全部 `fired` 提醒或所有页面残留卡片。
- 本次不把上述局限变成未来功能约束；后续补齐见 [下一阶段需求说明书 F02](../../../spec/PRD-next-release.md#f02活动提醒查询与关闭状态同步)。

## Evidence

- 实现：[时间计算](../../../apps/desktop/src/main/reminder-time.ts)、[提醒服务](../../../apps/desktop/src/main/reminder-service.ts)、[调度器](../../../apps/desktop/src/main/reminder-scheduler.ts)、[提醒仓储](../../../apps/desktop/src/main/reminder-repository.ts)、[当前提醒 IPC](../../../apps/desktop/src/main/ipc.ts)。
- 已有测试：[时间计算](../../../apps/desktop/test/reminder-time.test.ts)、[调度器](../../../apps/desktop/test/reminder-scheduler.test.ts)、[业务联动](../../../apps/desktop/test/reminder-lifecycle.test.ts)、[提醒中心](../../../apps/desktop/test/reminder-center.test.tsx)。
- 历史依据：[reminders](../../../spec/SPEC-reminders.md)。本次证据范围见 [基线说明](../../README.md)。
