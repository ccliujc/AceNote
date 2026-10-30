# 任务清单：AceNote desktop-experience

历史版本记录：当前窗口入口与退出规则以 `../spec/SPEC-floating-first.md` 为准，大窗口关闭不再退出应用。
依据：`spec/SPEC-desktop-experience.md`、`tasks/plan-desktop-experience.md`（均已批准）

规则：依次完成；先测试后实现；每项验证通过后再继续；如明显超过约 5 个文件应先拆分。

- [x] 1. 三窗口骨架与安全边界

  - 验收：主窗口、桌宠、轻量输入三个渲染入口可启动；各自独立 preload；全部启用上下文隔离、禁用 Node 集成、拒绝外部导航；关闭主窗口退出全部窗口。
  - 验证：窗口管理单测和桌面 build；`npm run test --workspace @acenote/desktop -- windows`。
  - 文件：`electron.vite.config.ts`、`renderer/pet/index.html`、`renderer/quick-input/index.html`、`main/windows/`、`test/windows.test.ts`。

- [x] 2. 桌宠位置、拖动与透明点击穿透

  - 验收：位置原子保存并重启恢复；负坐标、显示器移除和缩放后仍在可见工作区；透明区默认点击穿透，角色区域可交互。
  - 验证：`npm run test --workspace @acenote/desktop -- pet-position`，覆盖多屏和损坏文件；人工检查 mac 穿透。
  - 文件：`main/pet-position.ts`、`main/windows/pet-window.ts`、`renderer/pet/pet-app.tsx`、`test/pet-position.test.ts`。

- [x] 3. 体验事件与跨窗口刷新

  - 验收：任务 create/update/complete/archive/restore 广播 `data:changed`；完成广播 `task:completed`；提醒复用 `reminder:due`；payload 经 Zod 校验，渲染进程不能伪造。
  - 验证：`npm run test --workspace @acenote/desktop -- experience-events`，覆盖事件去重、非法 payload 和订阅清理。
  - 文件：`packages/contracts/src/experience.ts`、`main/experience-events.ts`、`main/lifecycle-service.ts`、`test/experience-events.test.ts`。

- [x] 4. PNG 资源与桌宠动画

  - 验收：三张 512×512 透明 PNG 存在且符合体积；idle/reminder/hit/ace 状态机正确；完成动画一次且重叠合并；reduced motion 降级。
  - 验证：`npm run test --workspace @acenote/desktop -- pet-mood` 和资源检查测试；人工检查 mac 视觉。
  - 文件：`resources/pet/pet-idle.png`、`pet-hit.png`、`pet-ace.png`、`renderer/pet/pet-mood.ts`、`renderer/pet/pet-app.tsx`、`test/pet-mood.test.ts`。

- [x] 5. 桌宠窗口交互与提醒气泡

  - 验收：单击开/聚焦轻量输入，双击聚焦主窗口；右键菜单打开记录/退出；提醒气泡显示一次且不重复；拖动结束保存位置。
  - 验证：React/IPC 测试覆盖单击、双击、菜单、提醒去重和退出调用。
  - 文件：`renderer/pet/pet-app.tsx`、`main/windows/pet-window.ts`、`main/ipc.ts`、`preload/pet.ts`、`test/pet-window.test.tsx`。

- [x] 6. 今日待办浮窗

  - 验收：单击桌宠打开紧凑浮窗，只读展示当天待办、状态和完成数，最多 7 项；失焦关闭并可打开主窗口。
  - 验证：桌面 typecheck、构建与人工单击检查。
  - 文件：`renderer/quick-input/quick-input-app.tsx`、`renderer/quick-input/quick-input.css`、`preload/quick-input.ts`、`main/windows/window-manager.ts`。

- [x] 7. 网球场与三态任务球

  - 验收：纯函数布局 0/1/24/25 个任务稳定无重叠；空心/实心/斜线三态正确；球与列表选中同步；超出显示剩余数量；键盘可操作列表。
  - 验证：`npm run test --workspace @acenote/desktop -- court`，覆盖布局、状态、选择和上限。
  - 文件：`renderer/court-layout.ts`、`renderer/court-view.tsx`、`renderer/lifecycle-page.tsx`、`renderer/styles.css`、`test/court-view.test.tsx`。

- [x] 8. 集成、资源与发布验收
  - 验收：三窗口同步、完成动画、提醒气泡、退出清理、位置恢复和 reduced motion 集成通过；文档说明 PNG 最终视觉待确认。
  - 验证：`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:coverage --workspace @acenote/desktop`、`npm run build`；分别记录 macOS/Windows 实际检查。
  - 文件：`test/experience-integration.test.tsx`、`test/coverage.config.ts`、`README.md`、`tasks/todo-desktop-experience.md`。

## 后续门控

本清单获批后才实现。完成后只剩 `identity`，需单独审批规格、计划和任务。
