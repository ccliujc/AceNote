# 活动提醒接口

F02 将计划、触发与活动展示分开。`Reminder` / `ReminderView` 的旧存储和显示字段保留；活动状态只存在于单次应用会话，不以历史 `fired` 恢复。

- `ActiveReminderState`：`sessionId`、集合 `revision` 和有序 `reminders`；条目包含 `activationId` 及 `reminder`，同一任务最多一条活动提醒。
- 主窗口 `ReminderApi`：查询、订阅完整状态，`dismissReminder({ sessionId, activationId })` 返回最新状态。不再接受单独数据库 ID，也没有页面本地关闭绕过。
- 人物 `PetApi`：只读查询、状态订阅和新到期订阅，不暴露全局关闭；浮窗不增加提醒管理能力。
- `reminder:due` 包含会话、触发身份、登记后的 revision 和 reminder；`reminder:active-changed` 是完整快照。查询及状态更新本身不播放气泡。
- 集合版本、F01 输入版本与任务 revision 各自独立。旧关闭引用不能关闭同任务的新触发；相同会话重复关闭幂等，旧会话报 `CONCURRENT_EDIT`。

IPC 请求、返回状态及主进程事件以共享 schema 校验。沙箱 preload 保持自包含，并校验必要事件结构、准确释放原监听器；不在 preload 运行时加载工作区包或共享 chunk。
