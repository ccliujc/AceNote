# task-lifecycle Specification

## Purpose

描述 AceNote 当前任务状态、按记录日期浏览、自然语言完成匹配、手动完成、归档恢复及按实际完成日期统计的行为，供已有项目持续演进时核对兼容性。F01 已实现输入恢复、候选重算与同一输入的重复处理保护，相关需求已同步到本规格，变更 `recover-submitted-inputs` 已归档；账号数据归属仍属于后续需求。

## Requirements

### Requirement: LIFE-01 Three mutually exclusive task states

系统 SHALL 为每个事项保存 `open`、`completed`、`archived` 中的一种状态；新事项初始为 `open`，界面分别使用未完成、已完成和已归档表示这些状态。

#### Scenario: 新建事项

- **WHEN** 系统成功创建一条本地事项
- **THEN** 事项处于未完成状态，完成时间和归档时间为空

### Requirement: LIFE-02 Daily records use the record date

系统 SHALL 按 `recordDate` 查询每日记录，并允许在完整记录中选择日期及全部、未完成、已完成、已归档筛选；选择浏览日期不能改变新输入的实际记录日期。

#### Scenario: 查看某天的记录

- **WHEN** 用户选择一个日期及任务状态筛选
- **THEN** 系统展示该记录日期及相应状态的事项，不把截止日期相同的其他记录自动并入

#### Scenario: 浏览历史时新增事项

- **WHEN** 用户正在查看历史日期并提交一条新输入
- **THEN** 新输入使用实际接收时的设备记录日期，而不是历史浏览日期

### Requirement: LIFE-03 Intent routing separates creation and completion

系统 SHALL 将合法 `create` 意图转换为事项，将 `complete` 意图交给本地完成匹配；完成指令不能因此额外创建待办，模型不能指定要修改的任务标识、状态或完成时间。成功的新增、明确转换或完成操作与对应输入标记已处理必须共同提交或共同失败，不能留下任务已经修改而输入仍可重复执行的中间状态。

#### Scenario: 新增意图使用输入标识

- **WHEN** 新增意图首次处理成功
- **THEN** 新事项使用该 intake UUID 和接收上下文，系统将 intake 标记为已处理

#### Scenario: 完成意图进入本地匹配

- **WHEN** 模型返回合法完成目标文字
- **THEN** 系统在本地未完成事项中查找目标，不直接执行模型生成的任务写入操作

#### Scenario: 提交中途失败

- **WHEN** 新增、转换或完成事项与输入终态记录之间发生存储失败
- **THEN** 相关写入共同回滚，不存在可再次处理而任务已被本次操作修改的输入，也不发送成功事件

#### Scenario: 已提交但界面未收到结果

- **WHEN** 任务操作与输入终态已经提交，随后应用退出或结果返回丢失
- **THEN** 下次查询看到已处理状态，重复请求不再次写任务、不重记完成时间、不再次发送本次操作的成功事件

### Requirement: LIFE-04 Local matching only considers open tasks

系统 SHALL 去除目标中的空白、常见标点及完成指令词，优先使用规范化标题的完全匹配；没有完全匹配时使用标题包含关系或对接人完全匹配，并且只考虑未完成事项。恢复已有待确认输入时，必须按其已保存的完成目标重新获取当前候选，即使只剩一项也保持显式确认；该恢复规则不改变普通新输入唯一匹配直接完成的行为。

#### Scenario: 唯一候选直接完成

- **WHEN** 普通新输入的完成目标在本地只对应一个未完成候选
- **THEN** 系统完成该事项并记录实际完成时间、完成日期和设备时区

#### Scenario: 多个候选先选择

- **WHEN** 完成目标对应多个未完成候选
- **THEN** 系统展示候选并在选择前保持任务状态不变；确认后只完成选中的事项

#### Scenario: 无候选不猜测

- **WHEN** 完成目标没有对应的未完成事项
- **THEN** 系统提示未找到匹配并保留输入，允许重试或由用户明确转为新待办，不自动修改任务

#### Scenario: 恢复时只剩一个候选

- **WHEN** 之前待确认的输入被恢复，而当前仅剩一个有效未完成候选
- **THEN** 系统仍展示该候选供用户确认，不因为候选数减少而自动完成它

#### Scenario: 恢复时候选全部失效

- **WHEN** 原候选已经完成、归档或不再匹配保存的目标
- **THEN** 系统不使用旧候选执行操作，提示无有效匹配并保留输入及后续恢复入口

#### Scenario: 旧输入没有保存完成目标

- **WHEN** 用户继续处理旧版待确认输入，而其缺少可验证的完成目标
- **THEN** 系统说明需要重新识别，只有用户明确请求时才调用模型；若得到完成意图，则重新展示候选并等待确认

### Requirement: LIFE-05 Direct completion uses an exact task and revision

系统 SHALL 支持以事项 ID 与 revision 直接完成未完成事项，不调用模型也不创建 intake；成功后记录完成元数据、尝试取消其待触发提醒，并发送完成与数据变更事件。

#### Scenario: 同名事项精确完成

- **WHEN** 用户通过浮窗圆圈完成两个同名事项中的一条
- **THEN** 系统只完成指定 ID 的事项，其余同名事项保持原状态

#### Scenario: 离线手动完成

- **WHEN** 网络或模型密钥不可用，用户完成已有事项
- **THEN** 本地完成操作仍可成功，并更新当日完成数与人物反馈

### Requirement: LIFE-06 State changes reject stale or illegal operations

系统 SHALL 对完成、归档和恢复使用状态与 revision 条件更新；重复完成、对已归档事项直接完成、恢复未完成事项及旧 revision 操作必须失败，不重复记录完成时间或发送成功事件。

#### Scenario: 重复完成被拒绝

- **WHEN** 同一事项已经完成，再次请求完成
- **THEN** 系统拒绝状态转换，原完成时间与统计保持不变

#### Scenario: 修订冲突被拒绝

- **WHEN** 事项已被更新，而另一界面提交旧 revision 的状态操作
- **THEN** 系统报告冲突，不覆盖新状态或播放本次操作的成功动效

### Requirement: LIFE-07 Archive and restore preserve original records

系统 SHALL 允许未完成事项手动归档，允许已完成或已归档事项恢复为未完成；恢复时清空完成与归档相关字段，原文和记录日期保持不变。

#### Scenario: 归档未完成事项

- **WHEN** 用户以有效 revision 归档未完成事项
- **THEN** 系统记录归档时间、将状态设为已归档，并尝试取消待触发提醒

#### Scenario: 恢复已完成或归档事项

- **WHEN** 用户以有效 revision 恢复事项
- **THEN** 状态变为未完成，完成时间、完成日期、完成时区和归档时间为空；提醒按未来截止时间重新安排

### Requirement: LIFE-08 Completion totals use the actual completion date

系统 SHALL 仅统计当前仍为已完成状态、且 `completionDate` 等于查询日期的事项；记录日期与截止日期不替代完成统计日期。

#### Scenario: 旧事项今天完成

- **WHEN** 用户今天完成一条以前记录的事项
- **THEN** 事项计入今天的完成数，不改写其原记录日期

#### Scenario: 恢复后移出完成统计

- **WHEN** 已完成事项被恢复为未完成
- **THEN** 系统将其从原完成日期的完成数中移除，已归档事项不计入完成数

### Requirement: LIFE-09 Submitted input operations are mutually exclusive and revision protected

系统 SHALL 对同一已提交输入的重试、转换和候选确认使用统一的状态及输入修订保护；已有操作进行时拒绝冲突请求，输入已处理时拒绝再次执行。过期请求和晚到识别响应不得覆盖更新的输入状态、事项编辑或处理结果；不同输入不因该互斥规则互相阻塞。

#### Scenario: 两个窗口竞争同一输入

- **WHEN** 一个窗口正在重试某条输入，另一窗口请求转换或确认同一条输入
- **THEN** 至多一个操作取得执行权，另一个获得处理中或版本冲突反馈，不启动第二次模型请求或额外任务写入

#### Scenario: 已处理输入被旧窗口操作

- **WHEN** 某窗口仍保留旧输入反馈，但该输入已经在另一窗口处理成功
- **THEN** 服务拒绝旧操作并让界面刷新，不能重新把输入设为待处理或重新完成事项

#### Scenario: 晚到结果不能覆盖手动修改

- **WHEN** 某输入的识别响应到达时，其处理版本已经失效，或关联事项已发生新的手动编辑
- **THEN** 系统丢弃该写入或返回可理解的冲突，保留当前事项内容与输入的最新状态

#### Scenario: 不同输入独立处理

- **WHEN** 一条输入等待网络响应，同时用户处理另一条输入
- **THEN** 输入级互斥不阻止另一条输入按自己的状态和版本执行

### Requirement: LIFE-10 Candidate confirmation revalidates membership and task revision

系统 SHALL 在确认恢复候选时，重新验证输入仍待确认、输入修订有效、目标任务仍在按当前目标计算的未完成候选中，且任务修订与用户看到的一致。确认成功只提交选中事项及该输入的终态，取消选择不删除原文，也不把输入标为已处理。

#### Scenario: 选择后任务已经变化

- **WHEN** 用户展示候选后，目标任务已被编辑、完成或归档，再提交原选择
- **THEN** 系统拒绝旧选择，展示刷新后的候选或无匹配状态，原输入保持可继续处理

#### Scenario: 非候选任务被提交

- **WHEN** 确认请求指向一个不属于该输入当前候选集合的任务
- **THEN** 系统拒绝请求，不修改任务、不记录该输入已处理，也不发送成功反馈

#### Scenario: 用户取消选择

- **WHEN** 用户关闭候选界面或选择取消
- **THEN** 任务状态不变，原输入仍保留在待处理列表，下次可以继续处理

## Known Gaps

- F01 已实现，见 [验收记录](../../../tasks/verification-f01-input-recovery.md)。重复处理保护覆盖单个应用主进程中的多个窗口；不承诺多个主进程共享数据库，也不按文字猜测旧随机 ID 的事项关联。相关需求已于 2026-11-04 同步并归档。
- 基线不承诺不存在的任务删除、批量操作、重复任务、子任务、标签、账号隔离或跨设备同步。
- 提醒同步异常不会撤销已经成功的任务写入；当前不能把代码中的修复注释当作已经接入的启动修复机制。

## Evidence

- 实现：[生命周期服务](../../../apps/desktop/src/main/lifecycle-service.ts)、[任务仓储](../../../apps/desktop/src/main/task-repository.ts)、[完成匹配](../../../apps/desktop/src/main/completion-matcher.ts)、[当前完整记录](../../../apps/desktop/src/renderer/lifecycle-page.tsx)。
- 已有测试：[生命周期服务](../../../apps/desktop/test/lifecycle-service.test.ts)、[任务状态仓储](../../../apps/desktop/test/task-repository-lifecycle.test.ts)、[提醒联动](../../../apps/desktop/test/reminder-lifecycle.test.ts)、[浮窗交互](../../../apps/desktop/test/today-panel.test.tsx)。
- 历史依据：[任务生命周期](../../../spec/SPEC-task-lifecycle.md)、[圆圈完成事项](../../../spec/SPEC-click-complete.md)。本次证据范围见 [基线说明](../../README.md)。
