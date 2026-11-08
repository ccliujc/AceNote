# 已有事项重新识别接口

主窗口独占 `window.taskReparse.reparseTask({ id, revision, mode })`。`mode` 必须是 `preserve` 或 `replace`，发起前展示两种选择，默认保留；人物和日程浮窗不暴露此方法。旧 `AceNoteApi.reparseTask(id, mode)` 不是当前入口。

三态事项均可识别。主进程读取原文、原记录时刻和原时区，只应用 `create` 的四个识别字段；不执行 `complete`，不创建事项或 intake。保留模式只补当前空缺，标题非空就保持；已有日期只接收同一识别日期下的空缺时刻。覆盖模式允许用合法结果中的 `null` 清空可选字段。

结果经过 `taskReparseOutcomeSchema` 校验：

- `updated`：返回已提交的完整 `task`，以及 `warning: null | REMINDER_SYNC_FAILED`。警告表示字段已保存、计划同步未完成，不是任务失败。
- `failed`：返回稳定 `error`。版本冲突必须先读取最新事项，再由用户重新选择模式；普通模型失败允许用户明确重试。临时错误不持久化到 task 或 intake。

原文、事项 ID、原记录上下文、状态、完成或归档元数据、完成统计及 editedAt 保持；成功递增 revision 并更新识别成功元数据。请求携带旧 revision 或在请求期间事项变化时拒绝覆盖。同一事项最多一个活动重新识别请求，显式退出使未提交请求失效，重启不重放。

IPC 或刷新失败不能证明提交未发生。界面应提示刷新核对，不自动再次识别或声称已回退。未提交的模型、校验、存储失败则保持原字段和原识别元数据；不返回模型正文、SQL、密钥或堆栈。
