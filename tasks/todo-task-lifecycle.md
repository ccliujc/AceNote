# 任务清单：AceNote task-lifecycle

依据：`spec/SPEC-task-lifecycle.md`、`spec/SPEC-capture.md`、`tasks/plan.md`（均已批准）

规则：依次完成；能写测试先写失败测试；每项验证通过后再继续；单个任务如明显超过约 5 个文件应拆分。

- [x] 1. 生命周期契约
  - 验收：定义三态、完成字段、intake 状态、意图联合、候选和统计 schema；现有 `Task` 保持兼容；模型输出禁止任务 ID、状态和额外字段。
  - 验证：`npm run test --workspace @acenote/contracts -- lifecycle` 与 typecheck。
  - 文件：`packages/contracts/src/lifecycle.ts`、`capture.ts`、`index.ts`、`test/lifecycle.test.ts`、`package.json`。

- [x] 2. 迁移 002
  - 验收：历史任务补齐 `open` 和空完成字段；新增 `intake_events` 与索引；单事务、幂等、版本 2，原字段不丢失。
  - 验证：`npm run test --workspace @acenote/desktop -- database`，覆盖版本 1 升级和重复启动。
  - 文件：`migrations/002-task-lifecycle.sql`、`database.ts`、`test/database.test.ts`。

- [x] 3. 任务仓储状态与查询
  - 验收：支持三态、按 `recordDate` 查询、按 `completionDate` 统计、`status + revision` 原子转换、恢复清空字段和稳定错误码。
  - 验证：`npm run test --workspace @acenote/desktop -- task-repository`。
  - 文件：`task-repository.ts`、`test/task-repository.test.ts`、`test/task-repository-errors.test.ts`。

- [x] 4. Intake 原文暂存
  - 验收：模型调用前写 intake；支持 pending、awaiting_selection、resolved、failed；重启恢复；原文不可变；失败可重试或转新待办。
  - 验证：`npm run test --workspace @acenote/desktop -- intake`。
  - 文件：`intake-repository.ts`、`test/intake-repository.test.ts`。

- [x] 5. 解析服务意图联合
  - 验收：返回 `create` 或 `complete`；严格拒绝空目标、非法意图和额外字段；错误不泄露上游内容；提示禁止任务 ID、状态和完成时间。
  - 验证：`npm run test --workspace @acenote/server -- parse` 与服务端 typecheck。
  - 文件：`deepseek-parser.ts`、`parse.controller.ts`、`test/parse.test.ts`、`test/parse-integration.test.ts`。

- [x] 6. 完成匹配与生命周期服务
  - 验收：create 使用 intake 接收时间建任务；complete 仅匹配 open 任务；唯一候选完成、多候选等待选择、零候选提示；重复完成不改时间；模型不能传任务 ID。
  - 验证：`npm run test --workspace @acenote/desktop -- lifecycle`，覆盖精确标题、包含、对接人、多候选、零候选、重复和竞态。
  - 文件：`completion-matcher.ts`、`lifecycle-service.ts`、`parse-queue.ts`、`capture-service.ts`、`test/lifecycle-service.test.ts`。

- [x] 7. 安全 IPC 与 preload
  - 验收：仅暴露统一提交、按日查询、筛选、选中候选、完成确认、归档和恢复；所有 ID、revision、输入经 Zod 校验。
  - 验证：桌面 typecheck 与 build；人工审阅 preload 暴露面。
  - 文件：`ipc.ts`、`preload/index.ts`、`capture-service.ts`。

- [x] 8. 日期导航与状态界面
  - 验收：默认今天，可切换日期；展示当天全部状态与完成统计；可筛选未完成、已完成、归档，并执行归档和恢复。
  - 验证：React 测试覆盖日期切换、筛选、统计、归档和恢复；桌面 typecheck。
  - 文件：`date-navigator.tsx`、`capture-page.tsx`、`task-list.tsx`、`styles.css`、`test/lifecycle-page.test.tsx`。

- [x] 9. 统一输入与完成候选界面
  - 验收：一次输入新增或完成；显示意图失败、零匹配和候选选择；选择前不改任务；支持重试和转新待办。
  - 验证：React 与 IPC 集成测试覆盖 create、唯一完成、多候选、零候选、失败重试和转新待办。
  - 文件：`completion-picker.tsx`、`capture-page.tsx`、`test/completion-flow.test.tsx`、`test/lifecycle-integration.test.ts`、`styles.css`。

- [x] 10. 验收与发布检查
  - 验收：规格 13 条成功标准均有测试或人工记录；关键模块语句和分支覆盖率达 80%；迁移、时区、重启与竞态验证完成；不伪造 Windows 结果。
  - 验证：依次执行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:coverage --workspace @acenote/desktop`、`npm run build`，并检查实际 macOS 流程。
  - 文件：`test/coverage.config.ts`、`test/lifecycle-release.test.ts`、`README.md`、`package.json`。

## 后续门控

本清单获批后才开始实现。`reminders`、`desktop-experience` 和 `identity` 仍需分别完成规格、计划与任务审批。
