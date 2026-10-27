# 任务清单：AceNote capture

依据：`spec/SPEC-capture.md`、`tasks/plan.md`（均已批准）

执行规则：按顺序一次完成一个任务；能写测试的逻辑先写失败测试，再实现；每个任务验证通过后才能开始下一个任务。文件列表为主要范围，如必须超出约 5 个文件，应先拆分任务。

- [x] 任务 1：建立仓库工程基线
  - 验收：根目录声明 npm workspaces、Node.js 22、TypeScript 严格模式和统一脚本；说明文档包含安装、开发、测试和密钥配置；忽略环境变量、数据库、依赖与构建产物。
  - 验证：执行 `npm install` 生成锁文件；检查 `git status --ignored --short` 确认 `.env`、SQLite 和构建目录不会入库。
  - 文件：`package.json`、`package-lock.json`、`tsconfig.base.json`、`.gitignore`、`.env.example`、`README.md`。

- [x] 任务 2：定义并测试 capture 共享契约
  - 验收：定义待办、解析请求响应、IPC 参数、错误码和 Zod schema；可空字段使用 `null`；非法日期、时刻、空标题和额外模型字段有明确测试。
  - 验证：`npm run test --workspace @acenote/contracts` 与 `npm run typecheck --workspace @acenote/contracts` 通过。
  - 文件：`packages/contracts/package.json`、`packages/contracts/tsconfig.json`、`packages/contracts/src/index.ts`、`packages/contracts/src/capture.ts`、`packages/contracts/test/capture.test.ts`。

- [x] 任务 3：搭建安全的 Electron 与 React 应用骨架
  - 验收：桌面窗口可启动并显示空白 capture 页面；启用上下文隔离、禁用渲染进程 Node 集成；preload 只暴露类型化空接口，不开放 SQL 或通用 IPC。
  - 验证：`npm run dev --workspace @acenote/desktop` 可启动 macOS 窗口；`npm run typecheck --workspace @acenote/desktop` 通过；人工检查窗口安全配置。
  - 文件：`apps/desktop/package.json`、`apps/desktop/tsconfig.json`、`apps/desktop/vite.config.ts`、`apps/desktop/src/main/index.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/renderer/main.tsx`。

- [x] 任务 4：实现 SQLite 待办数据层
  - 验收：迁移创建 `tasks` 与 `schema_migrations`；原文、UUID、设备记录时间和 `pending` 状态在事务中保存；支持列表、字段编辑、修订保护及 UUID 幂等；测试证明重启后数据仍可读取。
  - 验证：先运行数据层测试确认失败，再实现；`npm run test --workspace @acenote/desktop -- database` 和 `npm run typecheck --workspace @acenote/desktop` 通过。
  - 文件：`apps/desktop/src/main/database.ts`、`apps/desktop/src/main/migrations/001-create-tasks.sql`、`apps/desktop/src/main/task-repository.ts`、`apps/desktop/test/database.test.ts`、`apps/desktop/test/task-repository.test.ts`。

- [x] 任务 5：实现本地 DeepSeek 解析服务
  - 验收：NestJS 仅默认监听 `127.0.0.1`；`POST /v1/parse` 校验请求、20 秒超时、校验模型 JSON 并映射稳定错误；密钥只读服务端环境；服务不持久化原文。
  - 验证：模拟正常、缺字段、非法 JSON、超时和上游错误；`npm run test --workspace @acenote/server -- parse`、`npm run typecheck --workspace @acenote/server` 通过。
  - 文件：`apps/server/package.json`、`apps/server/tsconfig.json`、`apps/server/src/main.ts`、`apps/server/src/parse/parse.controller.ts`、`apps/server/src/parse/deepseek-parser.ts`、`apps/server/test/parse.test.ts`。

- [x] 任务 6：实现主进程解析队列与安全 IPC
  - 验收：仅在 SQLite 保存成功后请求解析；同一 UUID 重试不重复插入；断网与超时保留原文；网络恢复可重试；晚到结果不能覆盖更新的手动修订；IPC 仅暴露规定的五个操作。
  - 验证：先写状态机与竞态测试；`npm run test --workspace @acenote/desktop -- capture` 通过，覆盖保存前失败、重复提交、晚到响应和重试分支。
  - 文件：`apps/desktop/src/main/capture-service.ts`、`apps/desktop/src/main/parse-queue.ts`、`apps/desktop/src/main/ipc.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/test/capture-service.test.ts`。

- [x] 任务 7：实现快速输入与待办列表界面
  - 验收：可提交最多 2,000 字符的非空文字；本地保存后立即展示原文和解析状态；可查看记录日期、识别字段及失败原因；无完整桌宠、状态或提醒功能。
  - 验证：React 测试覆盖空输入、正常提交、保存失败、解析中和失败展示；`npm run test --workspace @acenote/desktop -- renderer` 通过。
  - 文件：`apps/desktop/src/renderer/app.tsx`、`apps/desktop/src/renderer/capture-page.tsx`、`apps/desktop/src/renderer/task-list.tsx`、`apps/desktop/src/renderer/styles.css`、`apps/desktop/test/capture-page.test.tsx`。

- [x] 任务 8：实现字段编辑、手动重试和重新解析确认
  - 验收：可编辑标题、截止日期、时刻和对接人；不可修改原文与记录时间；手动重试沿用 UUID；重新解析默认保留修改，只有明确选择才重新识别。
  - 验证：测试覆盖合法编辑、非法字段、失败重试、保留修改和确认重解析；`npm run test --workspace @acenote/desktop -- editing` 通过。
  - 文件：`apps/desktop/src/renderer/task-editor.tsx`、`apps/desktop/src/renderer/reparse-dialog.tsx`、`apps/desktop/src/renderer/capture-page.tsx`、`apps/desktop/test/task-editor.test.tsx`、`apps/desktop/test/reparse-dialog.test.tsx`。

- [x] 任务 9：串联开发启动与离线恢复流程
  - 验收：根命令可同时启动桌面端和本地解析服务；应用启动时执行迁移并恢复待重试记录；README 的命令与实际脚本一致；DeepSeek 联调只需本地 `.env`。
  - 验证：运行 `npm run dev`，人工完成提交、断网、重启、恢复网络与重试；确认没有重复记录，密钥不出现在客户端构建产物和日志。
  - 文件：`package.json`、`apps/desktop/src/main/index.ts`、`apps/desktop/src/main/parse-queue.ts`、`apps/server/src/main.ts`、`README.md`。

- [x] 任务 10：完成 capture 验收与发布构建检查
  - 验收：规格中的 10 条成功标准均有测试或明确人工检查记录；覆盖率达到语句和分支 80%，原文持久化及幂等分支全覆盖；未伪造 Windows 验证结果。
  - 验证：依次运行 `npm ci`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`；在 macOS 检查实际应用核心流程并审阅 `git diff`。
  - 文件：`apps/desktop/test/capture-integration.test.ts`、`apps/desktop/test/coverage.config.ts`、`apps/server/test/parse-integration.test.ts`、`README.md`、`package.json`。

## 后续门控

本清单获批后才进入实现。实现仅限 `capture`；`task-lifecycle`、`reminders`、`desktop-experience` 和 `identity` 仍需分别完成各自规格、计划与任务审批。
