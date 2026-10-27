# Spec: AceNote 快速记录与自然语言识别（capture）

上游能力地图：`spec/CAPABILITY-MAP.md`

## 目标

让本地单用户通过一句文字快速记录事项。系统必须先可靠保存原文，再调用 DeepSeek 提取任务标题、截止时间和对接人，并允许用户核对和修改识别结果。

成功意味着：无论网络或模型是否可用，已提交原文都不会丢失；记录时间只来自设备；不确定字段保持为空；恢复网络后可以重试解析，且不会生成重复待办或覆盖用户已修改的内容。

## 范围

### 包含

- 轻量文字输入、提交和基本输入校验。
- 原文的 SQLite 本地持久化。
- DeepSeek 服务端代理解析、超时、失败和离线重试。
- 标题、截止日期、截止时间和对接人的结构化提取。
- 识别结果查看、编辑和重新解析。
- 本地记录时间、记录日期和解析状态。
- 可供后续每日列表、状态和提醒模块使用的本地待办契约。

### 不包含

- 注册、登录、云端账号数据或跨设备同步。
- 完成、归档、每日统计和文字完成指令。
- 系统通知和提醒调度。
- 完整桌宠、网球场、状态图案和完成动效。
- 语音、图片、附件或批量导入。

## 技术栈

- 桌面端：Electron、React、TypeScript。
- 本地数据库：SQLite，通过 Electron 主进程和 `better-sqlite3` 访问。
- 本地解析服务：Node.js 22 LTS、NestJS、TypeScript，默认仅监听 `127.0.0.1`。
- 模型：DeepSeek API，默认模型名 `deepseek-chat`，通过环境变量配置。
- 接口与模型输出校验：Zod；共享类型位于 `packages/contracts`。
- 测试：Vitest、React Testing Library、Supertest、内存 SQLite 和模拟 DeepSeek HTTP 响应。

## 数据与行为约定

### 本地待办

每条待办至少包含：

- `id`：客户端生成的 UUID，作为本地保存和解析重试的幂等键。
- `rawText`：用户原始输入，保存后不可被模型修改。
- `title`：识别或用户编辑后的简洁标题。
- `recordedAt`：提交时由设备生成的带时区时间戳。
- `recordDate`：由 `recordedAt` 按设备本地时区生成的 `YYYY-MM-DD`。
- `dueDate`：可空的 `YYYY-MM-DD`，仅在用户明确表达日期时填写。
- `dueTime`：可空的本地 `HH:mm`，仅在用户明确表达时刻时填写。
- `timeZone`：解析时使用的设备 IANA 时区。
- `contact`：可空的对接人姓名或称呼，不扩展人员关系。
- `parseStatus`：`pending`、`processing`、`succeeded` 或 `failed`。
- `parseError`：可空的稳定错误码，不包含 API 密钥或完整敏感响应。
- `createdAt`、`updatedAt`：本地审计时间。
- `editedAt`：用户最近编辑识别字段的时间，用于防止晚到解析结果覆盖手动修改。

记录日期与截止日期完全独立。重新解析、修改截止时间或修改标题不得改变 `recordedAt` 和 `recordDate`。

### 提交流程

1. 校验输入去除首尾空白后非空，且不超过 2,000 个字符。
2. 在同一本地事务中生成 UUID、设备记录时间和 `pending` 待办，保存原文。
3. 本地保存成功后立即在列表中显示原文，再请求解析；保存失败时不得调用模型。
4. 将原文、设备当前本地时间和时区发送给本地解析服务，要求模型仅返回约定 JSON。
5. 服务端校验模型输出后返回结果；桌面端再次校验并更新本地字段。
6. 网络断开、服务不可用、模型超时或输出非法时保留原文，标记为 `failed` 或待重试状态，并提供手动重试。
7. 重试沿用同一 UUID，不得插入重复待办；用户已编辑的字段不得被晚到或重试结果静默覆盖。

### 字段解析

- 将“明天”“下周三”等相对日期交给模型时，必须同时提供设备当前本地日期、时间和时区。
- 明确提到的相对日期可以转换为具体日期；模糊或无法确定的信息保持为空。
- 只有“周五”等可能存在多个合理日期且上下文不足的表达，不得擅自猜测。
- 只有日期时填写 `dueDate`，`dueTime` 必须为空；不得由模型补成 09:00。
- 只有时刻而日期不明确时，`dueDate` 保持为空，由界面提示用户补充，不自动假定今天。
- 对接人只保存原文明确提及的人名或称呼；无法确定时保持为空。
- 标题应简洁并保留任务核心动作；模型不得增加原文没有的任务、日期或人员。

### 编辑与重试

- 用户可编辑 `title`、`dueDate`、`dueTime` 和 `contact`，但不可通过编辑界面覆盖 `recordedAt`。
- 编辑内容在本地立即保存并进行格式校验。
- 对已经手动编辑的待办重新解析前，必须让用户选择保留修改或重新识别；默认保留修改。
- 解析失败后用户仍可使用原文作为展示内容，并手动补齐字段。

### 本地解析服务

- `POST /v1/parse` 接收 `requestId`、`rawText`、`localDateTime`、`timeZone`，返回结构化字段或稳定错误码。
- 默认仅绑定 `127.0.0.1`，账号模块完成前不得作为无认证公共服务部署。
- DeepSeek API 密钥只从服务端环境变量读取，不进入 Electron 包、渲染进程、SQLite 或日志。
- 解析服务不长期保存原文或模型结果；账号模块接入前的本地阶段由 SQLite 承担持久化。
- 请求超时为 20 秒，失败不向客户端暴露上游响应正文、堆栈或密钥。
- 原文会发送给 DeepSeek；提交前应在首次使用说明中明确告知用户。

## 命令

以下命令在仓库根目录执行：

```bash
# 安装依赖
npm ci

# 启动桌面端和本地解析服务
npm run dev

# 仅启动桌面端或解析服务
npm run dev --workspace @acenote/desktop
npm run dev --workspace @acenote/server

# 构建、静态检查和类型检查
npm run build
npm run lint
npm run typecheck

# 运行 capture 相关测试
npm run test --workspace @acenote/desktop -- capture
npm run test --workspace @acenote/server -- parse

# 运行全部测试
npm test
```

## 项目结构

```text
AceNote/
├── apps/
│   ├── desktop/
│   │   ├── src/main/               # Electron 生命周期、SQLite、IPC、安全边界
│   │   ├── src/renderer/           # React 输入、结果查看与编辑界面
│   │   ├── src/modules/capture/    # 本地待办、解析队列与重试
│   │   └── test/capture/
│   └── server/
│       ├── src/modules/parse/      # DeepSeek 代理、输出校验与错误映射
│       └── test/parse/
├── packages/
│   └── contracts/                  # 待办字段、IPC 与解析 API 契约
├── spec/
│   ├── CAPABILITY-MAP.md
│   ├── SPEC-capture.md
│   └── SPEC-identity.md            # 已批准但暂缓
├── tasks/
├── package.json
├── .env.example
└── .gitignore
```

## 代码风格

- 使用 TypeScript 严格模式、ESM、2 空格缩进和单引号。
- 文件使用 kebab-case，类型和类使用 PascalCase，函数与变量使用 camelCase。
- 所有跨进程和网络数据都在边界使用 Zod 校验，不使用未校验的类型断言。
- SQLite 仅由主进程访问；渲染进程通过明确、最小的 IPC 契约调用。
- 可空字段使用 `null`，禁止以空字符串、虚构日期或占位人名代替未知信息。

```ts
const parsedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.iso.date().nullable(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  contact: z.string().trim().min(1).max(100).nullable(),
});

export type ParsedTask = z.infer<typeof parsedTaskSchema>;
```

## 测试策略

- 单元测试覆盖原文校验、记录时间生成、字段校验、相对日期上下文、解析状态和重试。
- SQLite 测试覆盖原文先保存、UUID 幂等、应用重启后恢复、失败记录保留和手动编辑保护。
- 服务接口测试使用模拟 DeepSeek 响应，覆盖合法 JSON、缺字段、多余类型、超时、限流和上游错误。
- 使用固定时钟和时区测试“明天”、只有日期、只有时刻和模糊日期，禁止测试依赖真实当前时间。
- React 测试覆盖提交、查看原文、编辑、失败提示、重试和重新解析确认。
- 测试断言模型无法覆盖记录时间，无法把缺失截止时间变为默认时间。
- capture 模块语句和分支覆盖率均不低于 80%；原文持久化与幂等分支必须全部覆盖。
- 默认测试不访问真实 DeepSeek，不使用真实用户文字或生产密钥。

## 边界

### 总是做

- 先持久化原文，再调用模型，并使用 UUID 保证重试幂等。
- 在设备侧生成记录时间，在边界校验所有模型输出。
- 未知字段留空，保留手动修改，提供可见的失败与重试状态。
- 提交前运行 capture 测试、类型检查和 lint。
- 密钥只放服务端环境变量，日志进行敏感信息脱敏。

### 先问再做

- 将本地解析服务暴露到非回环地址或部署到公网。
- 新增模型供应商、数据库字段、运行时依赖或数据导出能力。
- 改变原文不可变、记录时间来源或手动编辑保护规则。
- 提前加入账号、云端同步、提醒或任务状态逻辑。

### 绝不做

- 将 DeepSeek 密钥打包进客户端或提交到 Git。
- 因解析失败丢弃原文，或因重试创建重复待办。
- 让模型覆盖记录时间、虚构缺失字段或静默覆盖手动修改。
- 在测试中依赖生产服务，或为通过测试删除失败和边界用例。

## 成功标准

1. 用户提交一句合法文字后，即使立即断网，原文仍保留在 SQLite，并能在应用重启后查看。
2. 原文本地保存成功前不会调用 DeepSeek；保存失败会产生可见错误且不生成解析请求。
3. 正常解析后，标题、明确截止日期与时间、对接人正确保存，结果可查看和编辑。
4. 未提及截止时间的记录，其 `dueDate` 和 `dueTime` 均为 `null`；只有日期时 `dueTime` 仍为 `null`。
5. `recordedAt` 和 `recordDate` 完全由设备生成，模型返回额外字段也无法覆盖它们。
6. 模糊日期、时刻或对接人不会被擅自补全；需要补充时界面给出明确提示。
7. 断网、超时和非法模型输出不会丢失原文；恢复后自动或手动重试仍使用原 UUID，不产生重复记录。
8. 用户手动编辑后，晚到的解析结果不会覆盖修改；重新解析默认保留用户修改。
9. DeepSeek 密钥不出现在客户端构建产物、SQLite、日志或 Git 中，本地服务默认仅监听回环地址。
10. capture 相关测试、类型检查和 lint 全部通过，覆盖率达到本规格要求。

## 待决问题

无规格阻塞项。实际 DeepSeek 联调前需要在本地 `.env` 提供服务端 API 密钥；该密钥不由 Git 管理。
