# AceNote

记下这一球，拿下下一分。

AceNote 是面向 macOS 和 Windows 的本地优先桌面待办工具。当前实现范围为 `capture`：文字快速记录、SQLite 原文保存、DeepSeek 字段解析、结果编辑和失败重试。账号、任务状态、提醒和完整桌宠将在后续模块交付。

## 技术栈

- Electron、React、TypeScript、Vite
- SQLite（`better-sqlite3`）
- Node.js、NestJS、DeepSeek API
- npm workspaces、Vitest、ESLint

## 环境要求

- Node.js 22 或 24
- npm 10+
- macOS 或 Windows
- 可选：DeepSeek API 密钥；没有密钥时仍可本地保存和编辑原文

## 安装与配置

```bash
npm install
cp .env.example .env
```

在 `.env` 中填写服务端 `DEEPSEEK_API_KEY`。不要将 `.env` 提交到 Git，也不要把密钥写入桌面端代码。

## 常用命令

```bash
npm run dev          # 启动本地解析服务与桌面端
npm test             # 运行全部工作区测试
npm run lint         # 静态检查
npm run typecheck    # TypeScript 类型检查
npm run build        # 构建全部工作区
```

也可以单独启动：

```bash
npm run dev --workspace @acenote/server
npm run dev --workspace @acenote/desktop
```

## 数据与隐私

本地数据库保存在 Electron 的用户数据目录。原始文字会先保存到 SQLite，再发送至仅监听 `127.0.0.1` 的本地解析服务；解析服务会将必要文字和日期上下文发送给 DeepSeek，但不持久化原文。解析失败不会删除本地记录。

`npm run dev` 会先为当前 Electron 版本重建 `better-sqlite3`，再启动两个工作区。应用启动时自动执行数据库迁移，并恢复等待识别或识别失败的记录；也可在列表中手动重试。若运行 Node.js 单元测试前刚执行过原生模块重建，可重新执行 `npm install` 恢复 Node.js ABI。

## 规格与实施

- `spec/CAPABILITY-MAP.md`：能力边界和构建顺序
- `spec/SPEC-capture.md`：当前模块规格
- `tasks/plan.md`：技术计划
- `tasks/todo.md`：已批准任务清单
