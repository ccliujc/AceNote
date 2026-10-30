# 技术计划：AceNote desktop-experience

历史版本记录：当前窗口入口与退出规则以 `../spec/SPEC-floating-first.md` 为准，大窗口关闭不再退出应用。
依据：`spec/SPEC-desktop-experience.md`（已批准）

## 交付目标

在现有主窗口基础上增加透明置顶桌宠和轻量输入窗，提供 PNG 角色、拖动持久化、网球场任务球、完成动效、提醒气泡和三窗口数据同步。

保持主窗口关闭即退出、无托盘/后台进程，并延续现有任务、提醒与安全 IPC 规则。

## 组件与依赖

| 组件         | 职责                                                                 | 依赖                                |
| ------------ | -------------------------------------------------------------------- | ----------------------------------- |
| 多窗口构建   | electron-vite 增加 pet/quick-input HTML、入口、preload               | 现有工程                            |
| 窗口管理器   | 创建/聚焦/关闭 main、pet、quick-input；关闭即退出                    | Electron、窗口配置                  |
| 安全 preload | 各窗口最小 API，不暴露 Node、数据库或任意 IPC                        | contracts                           |
| 桌宠位置服务 | 拖动保存、按显示器工作区钳制、显示变化校正                           | Electron screen、userData           |
| 体验事件     | `data:changed`、`task:completed`、`reminder:due` 广播和 payload 校验 | LifecycleService、ReminderScheduler |
| 轻量输入     | 复用 LifecycleApi 的输入、候选、失败、转新待办                       | 体验事件、React                     |
| 球场视图     | 24 球上限、确定性布局、三态图案、列表联动                            | 每日任务数据                        |
| 桌宠 UI      | 三张 PNG、拖动、气泡、动画状态机、右键菜单                           | 体验事件、位置服务                  |
| PNG 资源     | idle/hit/ace 三张 512×512 透明资源与检查                             | 产品视觉确认                        |
| 验证         | 窗口、位置、布局、事件、动画、资源与人工检查                         | 各组件                              |

## 多窗口与构建

- electron-vite renderer 增加 `src/renderer/pet/index.html` 和 `src/renderer/quick-input/index.html`。
- preload 增加三个入口：`preload/main.ts`、`preload/pet.ts`、`preload/quick-input.ts`，各自只暴露所需 API。
- 主进程窗口模块：
  - `windows/main-window.ts`：现有生命周期页面。
  - `windows/pet-window.ts`：220×220、透明、无边框、置顶、不可缩放。
  - `windows/quick-input-window.ts`：约 380px 宽、无边框、置顶、屏幕内定位。
- 所有窗口启用 `contextIsolation`、禁用 `nodeIntegration`、设置 `sandbox`，拒绝 `window.open` 和外部导航。
- 主窗口 `close` 事件调用统一 `quitApplication()`；`before-quit` 停止提醒调度器、关闭数据库。
- 桌宠右键菜单由主进程构建，包含“打开记录”“退出 AceNote”。

## PNG 资源与动画

- 使用图像生成或本地占位资源，最终放入 `resources/pet/`，统一 512×512 透明 PNG。
- 首期允许产品未确认的占位图，但测试必须检查实际资源属性；README 标记最终视觉待确认。
- 动画状态：`idle`、`reminder`、`hit`、`ace`，状态机集中在 `pet-mood.ts`。
- CSS 动画：
  - idle 3 秒循环浮动。
  - reminder 单次弹跳。
  - hit 切换 `pet-hit.png` 并执行约 700ms 挥拍。
  - ace 在 hit 基础上叠加 CSS 光环/纸屑，结束后回 idle。
- 完成事件在任务数据更新后从主进程发出；渲染进程收到时启动动画。
- 同一时间仅一个动画；重叠完成合并为一次。
- `prefers-reduced-motion` 下移除位移、缩放和纸屑，只保留静态状态。
- 资源通过静态 import 打包，不加载远程图片/字体。

## 桌宠窗口与点击穿透

- 位置保存到 `userData/pet-position.json`，写入采用临时文件 + rename，损坏时回退默认位置。
- 默认位置为当前主屏幕工作区右下角，保留 24px 安全边距。
- 拖动通过 CSS `-webkit-app-region: drag` 或主进程 `setPosition` 实现；拖动结束发送位置给主进程保存。
- 窗口位置在启动、拖动结束和 `display-metrics-changed` 时按 `screen.getAllDisplays()` 工作区钳制到可见范围。
- 透明点击穿透：
  - 默认 `setIgnoreMouseEvents(true, { forward: true })`，让桌面可点击。
  - 渲染进程检测指针进入角色包围盒后请求关闭忽略；离开角色区域后恢复忽略。
  - 角色区域必须是真实 PNG 可视范围附近的矩形，不使用整个窗口。
- 单击角色打开/聚焦 quick-input；双击聚焦主窗口；右键菜单在主进程处理。
- 不使用系统通知 API。

## 轻量输入

- 独立 React 入口复用 `Capture` 的校验、`LifecyclePage` 的 outcome 处理逻辑，抽取共享 `useUnifiedInput` hook，避免复制业务规则。
- 提交中失焦不关闭；处理完成后根据结果关闭或展示候选。
- 多候选使用现有 `CompletionPicker`；失败显示重试和转新待办；成功后广播 `data:changed`。
- Esc 关闭；窗口失焦且无进行中请求时关闭。
- 输入由 preload 的 LifecycleApi 转发，渲染进程不访问 SQLite。

## 体验事件与刷新

主进程事件发布器：

- 任务完成：`task:completed`，payload 只含 `{ taskId, title }`。
- 任意任务变化：`data:changed`，payload 只含 `{ reason: 'created'|'updated'|'completed'|'archived'|'restored' }`。
- 提醒：复用 `reminder:due`。

规则：

- 事件只由主进程发往可见窗口；渲染进程不能发送伪造完成事件。
- 事件 payload 使用 Zod 校验；非法 payload 丢弃并记录安全警告。
- `LifecycleService` 注入事件发布回调；提醒服务沿用现有 scheduler 回调。
- 主窗口收到事件重新调用 `listTasks` 和 `getDailySummary`；轻量输入窗刷新候选/关闭；桌宠只在完成时动画，提醒时气泡。
- 主窗口初始化时仍主动拉取数据，不能只依赖事件。

## 球场与列表

- `court-layout.ts` 纯函数输入任务数组，按网球半场网格输出稳定 `{x,y}` 百分比坐标。
- 最多 24 球；超过显示“还有 N 项”，列表仍展示全部。
- 球为按钮，点击设置当前选中任务；列表同步高亮。
- 空心/实心/斜线由状态 class 和伪元素绘制，PNG 只用于桌宠。
- 键盘用户可直接用列表完成、编辑、归档和恢复，不依赖球场点击。
- 窄窗口下球场缩放但任务球保持最小 28px 点击区域。

## 实现顺序

1. **多窗口骨架**：构建/入口/preload/窗口管理，先确保三个窗口安全启动。
2. **位置与穿透**：桌宠拖动、位置持久化、显示器钳制、透明区域点击穿透。
3. **体验事件**：主进程广播、验证、任务完成与提醒联动。
4. **桌宠 UI**：PNG 资源、状态机、提醒气泡和完成动画。
5. **轻量输入**：抽取共享输入 hook，完成新增/完成/候选/失败流程。
6. **球场视图**：布局纯函数、三态球、列表联动与 24 球限制。
7. **集成验证**：跨窗口刷新、动画去重、退出、位置恢复、资源检查。
8. **发布验收**：lint、类型、测试、覆盖率和 macOS/Windows 实际窗口检查。

## 可并行与串行关系

- 多窗口骨架必须先完成，再并行开发位置服务和体验事件。
- PNG 资源制作与桌宠 UI 可并行，但资源检查最后执行。
- 共享输入 hook 完成后，轻量输入与主窗口同时受益。
- 球场视图可与桌宠并行，依赖稳定的每日任务数据。
- 跨窗口集成与双平台检查最后串行。

## 风险与缓解

| 风险                     | 缓解策略                                                |
| ------------------------ | ------------------------------------------------------- |
| 透明窗口拦截整个桌面点击 | 默认 ignore + forward，角色区域动态恢复交互，实测透明区 |
| 桌宠位置丢失或移出屏幕   | 原子写位置文件、显示器变化校正、回退主屏安全区          |
| 多窗口数据不一致         | 主进程仅广播事实事件，各窗口重新拉取；初始化主动加载    |
| 完成动画重复             | 主进程事件 + 渲染状态机单一队列，重叠合并               |
| PNG Retina 模糊          | 512×512 资源按逻辑 220px 显示，检查透明与体积           |
| 退出残留进程             | 统一 quit 路径，停止计时器、关闭 DB、关闭所有窗口       |
| 轻量输入丢字             | 提交中禁用失焦关闭；失败保留原文；同一 LifecycleApi     |
| Windows 透明/置顶差异    | 在 Windows 实测；不以 macOS 结果替代双平台结论          |
| 产品视觉未确认           | 占位 PNG 明确标注，发布前替换并重新验收资源             |

## 验证检查点

### 检查点 1：窗口与安全

- 三窗口均可启动；关闭主窗口退出全部进程。
- preload 暴露面最小；无 Node 集成、无外部导航、无任意 IPC。
- 窗口位置/尺寸和最小尺寸符合规格。

### 检查点 2：桌宠交互

- 透明区点击穿透；角色可单双击、拖动、右键菜单。
- 重启恢复位置；负坐标、断显示器、缩放变化被钳制。
- 提醒气泡和完成动画只触发一次。

### 检查点 3：统一输入与同步

- 轻量输入覆盖 create、unique complete、多候选、no match、失败重试和转新待办。
- 提交后主窗口数据、统计和提醒同步刷新。
- Esc/失焦行为与提交中保护正确。

### 检查点 4：球场与资源

- 0/1/24/25 个任务布局稳定、无重叠，三态可辨。
- 三张 PNG 透明、512×512、体积合规且离线可用。
- reduced motion 下无大幅位移或纸屑。

### 检查点 5：交付

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage --workspace @acenote/desktop
npm run build
```

- 全部通过；体验关键模块覆盖率不低于 80%。
- macOS 实际验证窗口、拖动、穿透、动画和退出；Windows 单独记录，不伪造未执行结果。

## 完成定义

计划获批后进入任务拆解。任何改变窗口结构、托盘/后台、PNG 资源、关闭即退出或完成事件语义的变更，必须先更新并批准规格。
