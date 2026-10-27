# Spec: AceNote 账号与数据隔离（identity）

上游能力地图：`spec/CAPABILITY-MAP.md`

> 状态：已批准但暂缓实施。根据 2026-10-25 的范围调整，优先交付本地单用户核心功能；实施本模块前必须复核既有本地数据的账号绑定与迁移方案。

## 目标

为 AceNote 桌面用户提供邮箱注册、登录、退出和会话续期能力，并确保待办、状态、归档和提醒等云端数据只能由所属账号访问。

成功意味着：用户可以凭邮箱和密码在当前客户端建立并恢复会话；退出后当前客户端无法继续访问受保护资源；服务端能够阻止跨账号读写，且不向客户端暴露密码或令牌机密。

## 范围

### 包含

- 使用邮箱和密码注册、登录。
- 访问令牌、刷新令牌及会话恢复。
- 当前设备退出登录。
- 获取当前账号基本信息。
- 云端数据的账号归属和服务端授权校验。
- 登录与注册接口的基础限流、输入校验和审计日志。

### 不包含

- 邮箱验证、找回或修改密码。
- 手机号、第三方账号登录。
- 账号注销、账号合并。
- 多设备实时同步、远程退出全部设备。
- 具体待办、归档和提醒业务逻辑；这些由后续模块定义。

## 技术栈

- 服务端：Node.js 22 LTS、NestJS、TypeScript。
- 数据库：PostgreSQL 16，Prisma ORM。
- 密码哈希：Argon2id；数据库只保存哈希，不保存明文密码。
- 认证：短期 JWT 访问令牌 + 随机、可轮换刷新令牌；刷新令牌在服务端仅保存哈希。
- 客户端凭据：通过操作系统安全存储保存刷新令牌，不写入普通配置文件或日志。
- 部署目标：腾讯云服务器和腾讯云 PostgreSQL；通过环境变量注入密钥。
- 测试：Vitest、Supertest、独立 PostgreSQL 测试数据库。

## 接口与行为约定

- `POST /v1/auth/register`：注册成功后返回账号信息和令牌；邮箱已注册时返回统一冲突错误。
- `POST /v1/auth/login`：凭据正确时返回账号信息和令牌；失败时不区分邮箱不存在或密码错误。
- `POST /v1/auth/refresh`：轮换刷新令牌并签发新访问令牌；已使用、过期或撤销的令牌不得继续使用。
- `POST /v1/auth/logout`：撤销当前设备的刷新会话；重复退出保持幂等。
- `GET /v1/me`：返回当前账号的 `id`、`email`、`createdAt`，不返回密码哈希或令牌哈希。
- 访问令牌有效期 15 分钟；刷新会话最长 30 天，每次刷新必须轮换。
- 邮箱去除首尾空白并统一为小写后存储和比较；邮箱格式必须符合通用 RFC 邮箱格式。
- 密码长度 12–128 个字符，不在日志中记录；注册和登录请求体不得出现在审计日志中。
- 用户 ID 使用 UUID；所有用户数据表必须包含不可空的所有者 ID，并通过外键关联账号。
- 数据访问必须同时按资源 ID 和当前用户 ID 限定，禁止先读取资源再仅依赖客户端判断归属。
- 首期不限制同一账号登录的设备数；各设备会话独立，不提供实时同步。

## 命令

以下命令在仓库根目录执行：

```bash
# 安装依赖
npm ci

# 启动桌面端与服务端开发环境
npm run dev

# 仅启动服务端
npm run dev --workspace @acenote/server

# 构建全部工作区
npm run build

# 检查格式、类型和静态规则
npm run lint
npm run typecheck

# 运行 identity 单元与接口测试
npm run test --workspace @acenote/server -- identity

# 运行全部测试
npm test

# 本地执行数据库迁移（已有 schema 变更需先获批）
npm exec --workspace @acenote/server -- prisma migrate dev
```

## 项目结构

```text
AceNote/
├── apps/
│   ├── desktop/             # Electron + React 客户端；安全存储与登录界面
│   └── server/              # NestJS API、认证、授权与 Prisma 集成
│       ├── src/modules/identity/
│       └── test/identity/
├── packages/
│   └── contracts/           # 客户端与服务端共享的请求、响应类型
├── spec/
│   ├── CAPABILITY-MAP.md
│   └── SPEC-identity.md
├── tasks/                   # 获批后的计划与任务清单
├── package.json             # npm workspaces 与根命令
└── .gitignore
```

## 代码风格

- 使用 TypeScript 严格模式、ESM、2 空格缩进和单引号。
- 文件使用 kebab-case，类使用 PascalCase，函数和变量使用 camelCase，环境变量使用 UPPER_SNAKE_CASE。
- DTO 在 API 边界校验；服务层不依赖 HTTP 请求对象获取用户身份。
- 认证错误使用稳定错误码，不向客户端暴露堆栈、数据库错误或密码校验细节。

```ts
type RegisterInput = {
  email: string;
  password: string;
};

export async function register(input: RegisterInput): Promise<AuthSession> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const user = await users.create({ email, passwordHash });
  return sessions.issue(user.id);
}
```

## 测试策略

- 单元测试覆盖邮箱规范化、密码规则、令牌过期与轮换、错误映射。
- 接口测试覆盖注册、登录、刷新、退出、会话恢复和 `GET /v1/me`。
- 数据库集成测试使用独立 PostgreSQL，覆盖邮箱唯一约束、会话撤销和用户数据归属。
- 授权测试必须构造两个账号，验证账号 B 无法通过猜测资源 ID 读取或修改账号 A 的数据。
- 安全测试覆盖错误登录提示一致性、刷新令牌重放、令牌撤销和认证接口限流。
- identity 模块语句和分支覆盖率均不低于 80%；授权与令牌轮换分支必须全部覆盖。
- 测试不使用真实用户数据或生产密钥，不依赖腾讯云生产环境。

## 边界

### 总是做

- 在服务端验证所有输入、认证状态和账号归属。
- 使用参数化 ORM 查询，密码和令牌只保存哈希。
- 对认证接口限流，并记录不含敏感信息的审计事件。
- 提交前运行相关测试、类型检查和 lint。
- 客户端令牌存储使用操作系统安全能力。

### 先问再做

- 修改已批准的数据库 schema、认证方式或令牌有效期。
- 增加邮箱服务、第三方身份提供方或新的运行时依赖。
- 修改 CI、部署配置、跨设备会话策略。
- 引入账号注销、密码找回或远程会话管理。

### 绝不做

- 将密码、完整令牌、DeepSeek 密钥或数据库凭据写入日志、客户端包或 Git。
- 信任客户端提供的用户 ID 作为授权依据。
- 返回其他账号的数据，即使客户端知道资源 ID。
- 为通过测试而删除授权用例、关闭校验或使用生产数据。

## 成功标准

1. 新用户可用合法邮箱和 12–128 位密码注册，并在不重启应用的情况下访问当前账号信息。
2. 重复邮箱注册被拒绝；数据库中邮箱唯一且不区分大小写。
3. 正确凭据可登录；错误凭据得到一致提示，响应和日志不泄露账号是否存在或密码信息。
4. 应用重启后可使用安全保存的刷新令牌恢复会话；刷新后旧刷新令牌不能再次使用。
5. 退出当前设备后，该设备刷新会话失效，其他设备会话不受影响。
6. 访问令牌过期后受保护接口拒绝请求；有效访问令牌可读取当前账号信息。
7. 两个账号的集成测试证明，任何账号都不能通过替换资源 ID 读写另一个账号的数据。
8. 无截止提醒、任务状态等后续模块行为被提前实现；identity 仅提供身份和授权契约。
9. identity 相关测试、类型检查和 lint 全部通过，覆盖率达到本规格要求。

## 待决问题

无阻塞项。邮箱验证、找回密码、账号注销和全设备退出明确留待后续版本。
