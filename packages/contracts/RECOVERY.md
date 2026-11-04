# 输入恢复契约

F01 的输入 `revision` 与任务 `revision` 分别维护。所有 `InputOutcome` 返回 `intakeRevision`；`retryInput(id, intakeRevision)`、`convertInputToTask(id, intakeRevision)` 必须携带看到的输入版本。候选确认中的 `revision` 仍表示任务版本，新增 `intakeRevision` 表示输入版本，不可相互替代。

旧 intake 的新增元数据可读为初始版本及空关联；迁移和主进程会填充实际值。恢复条目提供显示状态及可用操作，浮窗仅查询数量摘要。恢复候选允许零项、一项或多项，普通 `selection_required` 继续至少两项；旧输入缺少完成目标时返回 `requiresReparse`，由用户明确选择重新识别。

`INPUT_BUSY` 表示同一输入正在处理；`INPUT_ALREADY_RESOLVED` 表示已处理，应刷新而非重做；`INPUT_INTERRUPTED` 表示上次会话请求中断，可以手动重试。版本冲突继续使用 `CONCURRENT_EDIT`。`intake:changed` 仅包含输入 ID、版本及处理状态，不包含原文，订阅必须能够取消。

主窗口恢复 API 提供 listInputs、getCandidates、reparseCandidates；浮窗仅提供 getRecoverableSummary 和变化订阅，不开放历史原文列表。所有写入都经生命周期接口及版本校验，事件不携带原文或模型密钥。
