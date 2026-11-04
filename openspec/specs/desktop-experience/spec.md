# desktop-experience Specification

## Purpose

描述 AceNote 当前以桌面人物和日程浮窗为主、完整记录窗口按需打开的桌面形态，以及输入、今日记录、任务球场、人物反馈和窗口通信的已有约定。F01 已增加完整记录中的跨日期待处理列表与浮窗数量入口，相关需求已同步到本规格，变更 `recover-submitted-inputs` 已归档。macOS 的恢复及窗口关闭独立已隔离验收；透明点击、多屏与系统缩放的原生效果仍需在对应平台验收。

## Requirements

### Requirement: DESK-01 Floating-first startup and activation

系统 SHALL 在正常启动时只创建人物窗口；人物单击、双击的点击路径和系统激活进入日程浮窗，不因此创建或展示完整记录大窗口。

#### Scenario: 应用启动

- **WHEN** AceNote 启动并完成初始化
- **THEN** 系统创建人物窗口，完整记录窗口保持尚未创建

#### Scenario: 人物点击或系统激活

- **WHEN** 用户点击人物或通过系统激活应用
- **THEN** 系统打开或聚焦日程浮窗，复用已有浮窗实例

### Requirement: DESK-02 Full records and app exit have independent lifecycles

系统 SHALL 仅在明确的“打开完整记录”入口或人物右键菜单操作时延迟创建大窗口；普通关闭大窗口只收起自身，显式退出才允许窗口销毁、停止提醒并关闭数据库。

#### Scenario: 按需打开并关闭大窗口

- **WHEN** 用户打开完整记录后关闭大窗口
- **THEN** 人物和浮窗继续运行，浮窗草稿保留，再次打开完整记录时复用已有窗口

#### Scenario: 显式退出清理一次

- **WHEN** 用户通过人物右键退出或系统退出命令结束应用
- **THEN** 系统先设置退出状态，再停止调度和关闭数据库，重复退出回调不重复清理资源

### Requirement: DESK-03 Pet placement preserves the character anchor

系统 SHALL 提供可拖动的透明置顶人物窗口，保存人物锚点并在下次启动恢复；启动及拖动定位使用当前显示器工作区校正边界，完整窗口为 220×340，其中人物区域为 220×220、上方提示区为 120。

#### Scenario: 拖动后重启

- **WHEN** 用户拖动人物并结束拖动，随后重新启动应用
- **THEN** 系统恢复保存的人物锚点，并在恢复位置越界时校正到可见工作区

#### Scenario: 拖动不误触点击

- **WHEN** 用户拖动距离达到人物组件的移动判定阈值后松开
- **THEN** 该次拖动结束不再被当作打开浮窗的普通单击

### Requirement: DESK-04 Floating input retains session drafts

系统 SHALL 以约 360×560 的日程浮窗提供输入，并按所在工作区缩小与定位；失焦不自动收起，手动关闭或 Esc 收起时保留同一应用会话的草稿。输入处理期间界面阻止重复提交及收起，候选状态的 Esc 优先取消当前选择。

#### Scenario: 收起再打开

- **WHEN** 用户输入草稿但未提交，手动收起后再次打开浮窗
- **THEN** 同一浮窗 renderer 被复用，原草稿继续显示并获得焦点

#### Scenario: 忙碌时避免重复操作

- **WHEN** 当前输入或手动完成仍在处理中
- **THEN** 浮窗禁用冲突操作，重复快捷键不会再发起同一次界面操作

### Requirement: DESK-05 Keyboard submission protects composition input

系统 SHALL 在浮窗支持 Enter 提交、Shift+Enter 换行及 Cmd/Ctrl+Enter 提交；完整记录使用普通 Enter 换行及 Cmd/Ctrl+Enter 提交。中文输入法组合阶段的确认不能误触提交。

#### Scenario: 浮窗键盘输入

- **WHEN** 用户在浮窗按 Enter 且不处于输入法组合或忙碌状态
- **THEN** 系统提交合法草稿；Shift+Enter 保留为换行

#### Scenario: 输入法确认

- **WHEN** 用户正在组合中文并按 Enter 确认候选字
- **THEN** 系统不把该按键解释为提交日程

### Requirement: DESK-06 Today panel uses compact daily records

系统 SHALL 在白底、澳网蓝点缀的浮窗中展示按今天记录日期查询的事项与当日完成数，最多显示 7 条并提示剩余数量；条目显示标题、已有截止信息及状态，长标题可换行，查询失败和空列表必须分开呈现。

#### Scenario: 超过七条记录

- **WHEN** 今天有 8 条记录
- **THEN** 浮窗渲染前 7 条并显示剩余 1 项，不把记录数限制为 7 条

#### Scenario: 查询失败

- **WHEN** 今日记录查询失败
- **THEN** 浮窗显示错误与重试入口，不把失败当成今天没有待办

#### Scenario: 已过具体时刻

- **WHEN** 未完成事项在其保存时区的截止日期与具体时刻已经到达
- **THEN** 浮窗按当前时间显示已过时间，保持已保存的日期与时刻标签

### Requirement: DESK-07 Circle completion preserves the input draft

系统 SHALL 将浮窗中未完成事项的圆圈呈现为可通过鼠标、Enter 或 Space 操作的按钮，按具体 ID 与 revision 完成事项；已完成和已归档事项禁用该完成操作。

#### Scenario: 完成成功

- **WHEN** 用户点击一条未完成事项的圆圈且本地操作成功
- **THEN** 浮窗刷新状态与完成数，输入草稿继续保留并恢复焦点，人物接收完成反馈

#### Scenario: 完成失败

- **WHEN** 手动完成因修订冲突或其他错误失败
- **THEN** 界面显示失败并重新查询最新记录，不先把事项显示为已经完成

### Requirement: DESK-08 Daily court and list share the same records

系统 SHALL 在完整记录中以球场和可访问列表呈现同一份按日、按状态筛选的事项；球场最多展示 24 个任务球，使用不同图案区分三种状态，点击球可打开相应事项编辑。

#### Scenario: 二十五条事项

- **WHEN** 当前筛选包含 25 条事项
- **THEN** 球场最多显示 24 个球并提示还有 1 项，列表仍可访问全部记录

#### Scenario: 从球场编辑

- **WHEN** 用户选择一个任务球
- **THEN** 系统定位到同一事项的编辑操作，不创建一份独立的球场任务数据

### Requirement: DESK-09 Local Ryoma assets and completion feedback

系统 SHALL 使用澳网蓝主题与本地待机、击球、庆祝三张越前龙马透明 PNG；完成事件使人物依次进入约 700 毫秒击球、900 毫秒庆祝后回到待机。提醒复用待机资源及提示动效，不依赖在线视觉资源。

#### Scenario: 完成事件反馈

- **WHEN** 人物接收到一次成功完成事件
- **THEN** 人物显示完成标题并播放击球到庆祝的序列，数据完成结果不等待动画结束

#### Scenario: 系统减少动态效果

- **WHEN** 渲染环境启用减少动态效果偏好
- **THEN** 人物样式停止 CSS 动画，仍通过图片状态和文字提供反馈

### Requirement: DESK-10 Pet messages have independent fifteen-second timers

系统 SHALL 在人物上方独立区域显示无边框提示与小关闭图标，消息默认 15 秒自动收起；消息计时与人物动作计时相互独立，新消息重新计时，关闭消息不完成任务或打开浮窗。

#### Scenario: 消息自动收起

- **WHEN** 完成或提醒消息显示后经过 15 秒且期间没有新消息
- **THEN** 消息收起，人物继续存在

#### Scenario: 新消息替换旧消息

- **WHEN** 旧消息尚未到期时又收到一条消息，包括同标题消息
- **THEN** 系统更新提示并重新开始 15 秒计时，旧计时器不会提前关闭新消息

### Requirement: DESK-11 Isolated renderers use narrow preload APIs

系统 SHALL 为完整记录、人物及浮窗使用独立 preload，启用上下文隔离、禁用 Node 集成并启用渲染沙箱；任务与 intake 的数据库操作由主进程持有，界面经具体接口调用，任务 ID 与 revision 在有关业务 IPC 入口校验。

#### Scenario: 渲染页面操作事项

- **WHEN** 页面需要提交输入、编辑字段或完成事项
- **THEN** 页面调用规定的 preload 方法，不能通过暴露的通用 SQL 接口直接操作数据库

### Requirement: DESK-12 Full records expose recoverable submitted inputs

系统 SHALL 在完整记录中提供可访问的“待处理输入”区域，按跨日期待处理集合展示原文、接收日期、状态、原因及恢复操作。该区域与每日任务的浏览日期、状态筛选独立，支持加载、空态、失败重试、处理中反馈及候选确认；接收日期和未处理原因不能只依赖颜色表达。

#### Scenario: 查看历史未处理输入

- **WHEN** 用户打开完整记录的待处理区域
- **THEN** 所有记录日期的待处理输入均可访问，切换每日任务日期不会隐藏或改写这些输入

#### Scenario: 对应状态提供对应操作

- **WHEN** 用户查看识别失败、中断或待确认的输入
- **THEN** 界面分别提供重试、明确转换或继续选择的操作，处理中条目不允许发起冲突操作

#### Scenario: 取消恢复交互

- **WHEN** 用户关闭候选界面、取消选择或关闭完整记录窗口
- **THEN** 已提交原文继续保留，人物和浮窗按原生命周期运行，不把取消当作输入已处理

### Requirement: DESK-13 Floating panel provides a recovery summary entry

系统 SHALL 在日程浮窗提供跨日期的待处理数量与打开完整记录的入口，不将这些输入混进今日事项数量或 7 条展示上限。启动、恢复扫描或查询到待处理输入不能自动弹出大窗口；只有用户明确点击入口才打开或聚焦完整记录。

#### Scenario: 浮窗提示历史失败输入

- **WHEN** 今日没有任务，但存在昨天的待处理输入
- **THEN** 浮窗仍显示正确的待处理数量，今日任务空态与待处理入口分别呈现

#### Scenario: 用户明确进入恢复区域

- **WHEN** 用户点击浮窗中的待处理入口
- **THEN** 系统打开或聚焦完整记录，用户可以从该窗口的待处理区域继续操作，浮窗及其草稿仍保留

#### Scenario: 未打开完整记录时启动恢复

- **WHEN** 应用启动后发现待处理输入而用户尚未打开完整记录
- **THEN** 系统保留人物与浮窗优先形态，不为展示恢复内容自动创建大窗口

### Requirement: DESK-14 Recovery updates are shared without consuming drafts

系统 SHALL 在输入保存、处理状态改变和处理结束后，让完整记录的待处理列表及浮窗数量更新，并防止较旧查询覆盖新状态。重试、转换、继续选择及在另一窗口处理成功不能清空任何无关的未提交草稿、改变每日浏览日期或伪造重复成功反馈；失败时保留可操作内容并说明恢复路径。

#### Scenario: 另一窗口处理成功

- **WHEN** 一个窗口处理输入成功，另一窗口仍显示该输入或旧反馈
- **THEN** 另一窗口刷新并移除或禁用该输入的旧操作，显示已处理提示，已有草稿与每日筛选保持不变

#### Scenario: 列表响应乱序

- **WHEN** 较早的待处理查询在新的状态查询完成后才返回
- **THEN** 界面保留最新状态，不把已经处理的输入或旧数量重新显示为可处理

#### Scenario: 恢复失败保留上下文

- **WHEN** 恢复操作因网络、存储、忙碌或修订冲突失败
- **THEN** 界面给出相应反馈并允许刷新或重试，原文与无关输入草稿保留，不显示虚假的处理成功

## Known Gaps

- 原生透明穿透、多显示器实际操作、显示器移除、实际系统缩放、系统减少动态效果及断网冷启动尚未完整验收；代码与模拟测试不能替代平台通过记录。
- 人物使用 PNG 状态切换和 CSS 动效，不是连续帧或骨骼动画；连续到达的新完成事件会重置动作计时，不承诺旧规格中的排队折叠播放机制。
- 尚未提供安装包、托盘、开机启动、应用内解析配置、账号或云端同步；浮窗草稿跨应用退出的持久化也不在已实现范围。

## Evidence

- 实现：[窗口管理](../../../apps/desktop/src/main/windows/window-manager.ts)、[应用生命周期](../../../apps/desktop/src/main/application-lifecycle.ts)、[浮窗](../../../apps/desktop/src/renderer/quick-input/quick-input-app.tsx)、[人物](../../../apps/desktop/src/renderer/pet/pet-app.tsx)、[球场布局](../../../apps/desktop/src/renderer/court-layout.ts)。
- 已有测试：[窗口管理](../../../apps/desktop/test/quick-input-window.test.ts)、[应用生命周期](../../../apps/desktop/test/application-lifecycle.test.ts)、[今日浮窗](../../../apps/desktop/test/today-panel.test.tsx)、[人物交互](../../../apps/desktop/test/pet-ui.test.tsx)、[球场](../../../apps/desktop/test/court-view.test.tsx)。
- 历史依据：[浮窗优先](../../../spec/SPEC-floating-first.md)、[澳网蓝人物](../../../spec/SPEC-ao-blue-ryoma.md)、[消息气泡](../../../spec/SPEC-pet-message.md)、[简洁浮窗](../../../spec/SPEC-floating-minimal.md)。本次证据范围见 [基线说明](../../README.md)。
