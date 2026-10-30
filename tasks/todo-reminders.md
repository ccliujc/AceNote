# 任务清单：AceNote reminders

依据：`spec/SPEC-reminders.md`、`tasks/plan-reminders.md`（均已批准）

规则：依次完成；能写测试先写失败测试；每项验证通过后再继续；如明显超过约 5 个文件应先拆分。

- [x] 1. 提醒契约与时间工具
  - 验收：定义提醒状态、提醒视图、调度事件和关闭参数 schema；实现日期-only 09:00、具体时刻、无日期 null、显式 IANA 时区转换与 DST 校正。
  - 验证：`npm run test --workspace @acenote/contracts -- reminder`；`npm run test --workspace @acenote/desktop -- time`；覆盖跨午夜和 DST。
  - 文件：`packages/contracts/src/reminders.ts`、`index.ts`、`test/reminders.test.ts`、`apps/desktop/src/main/reminder-time.ts`、`test/reminder-time.test.ts`。

- [x] 2. 迁移 003 与提醒仓储
  - 验收：创建 `reminders` 表、任务唯一外键、状态与查询索引；实现 upsert、cancel、missed、条件触发和活动查询；迁移幂等、版本 3。
  - 验证：`npm run test --workspace @acenote/desktop -- reminder-repository`，覆盖重复计划、重启、状态约束和并发触发。
  - 文件：`migrations/003-reminders.sql`、`database.ts`、`reminder-repository.ts`、`test/reminder-repository.test.ts`。

- [x] 3. 提醒调度器
  - 验收：启动记录会话起点；启动前计划标记 missed；15 秒轮询；只对 open 且到期计划条件触发一次；停止定时器可释放资源。
  - 验证：使用 fake timer 测试启动过滤、会话内到期、并发轮询、已完成任务和停止清理；`npm run test --workspace @acenote/desktop -- scheduler`。
  - 文件：`reminder-scheduler.ts`、`test/reminder-scheduler.test.ts`。

- [x] 4. 生命周期状态联动
  - 验收：创建/编辑未来截止时建立计划；过去或清空取消；完成/归档取消；恢复未来重建、恢复过去不提醒；提醒失败不回滚任务。
  - 验证：`npm run test --workspace @acenote/desktop -- reminder-lifecycle`，覆盖所有状态组合与失败对账。
  - 文件：`reminder-service.ts`、`lifecycle-service.ts`、`task-repository.ts`、`test/reminder-lifecycle.test.ts`。

- [x] 5. 提醒 IPC 与 preload
  - 验收：主进程发送 `reminder:due`，preload 仅暴露到期订阅和关闭；payload 经 Zod 校验；取消订阅可用；不调用系统通知。
  - 验证：桌面 typecheck 与 build；测试订阅、去重和取消不修改任务。
  - 文件：`ipc.ts`、`preload/index.ts`、`main/index.ts`、`test/reminder-ipc.test.ts`。

- [x] 6. 应用内提醒中心与逾期标识
  - 验收：活动提醒按计划时间排序、同任务去重、逐条关闭、不阻塞输入；open 且已过截止时间显示“已逾期”。
  - 验证：`npm run test --workspace @acenote/desktop -- reminder-center`，覆盖多提醒、关闭、逾期和排序。
  - 文件：`reminder-center.tsx`、`lifecycle-page.tsx`、`lifecycle-task-list.tsx`、`styles.css`、`test/reminder-center.test.tsx`。

- [x] 7. 重启、错发与竞态集成验证
  - 验收：应用重启不补发启动前计划；并发轮询只展示一次；完成/归档后残留计划不触发；DST 时区测试稳定。
  - 验证：`npm run test --workspace @acenote/desktop -- reminder-integration`，使用固定时钟和独立 SQLite。
  - 文件：`test/reminder-integration.test.ts`、`test/reminder-dst.test.ts`、`test/reminder-state.test.ts`。

- [x] 8. 全量验收与文档
  - 验收：规格 11 条成功标准均有测试或人工记录；关键模块语句和分支覆盖率达 80%；README 说明仅运行期间提醒、不补发、无系统权限。
  - 验证：`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:coverage --workspace @acenote/desktop`、`npm run build`；完成 macOS 实际流程检查。
  - 文件：`test/coverage.config.ts`、`README.md`、`package.json`、`tasks/todo-reminders.md`。

## 后续门控

本清单获批后才开始实现。之后按能力地图进入 `desktop-experience`，再进入 `identity`，均需分别审批规格、计划和任务。
