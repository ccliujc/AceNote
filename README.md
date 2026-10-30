# AceNote

记下这一球，拿下下一分。

AceNote 是面向 macOS 和 Windows 的本地优先桌面待办工具。当前实现范围为 `capture`、`task-lifecycle`、`reminders` 与 `desktop-experience`：文字快速记录、SQLite 原文保存、DeepSeek 新增/完成意图识别、每日记录、三态任务、自然语言完成匹配、归档恢复、按完成日期统计、应用内截止提醒、透明桌宠、今日待办浮窗、网球场视图和完成动效。账号体系将在后续模块交付。

截止提醒仅在 AceNote 运行时生效：只有日期的事项在当地时间 09:00 提醒，应用退出或电脑关机期间错过的提醒不会补发，也不申请系统通知权限，提醒只在应用内显示。

输入“12点提醒我吃饭”“五点半吃饭”“下午2点开会”等单个明确时刻时，省略日期默认提交当天；已过时刻保留今天并显示“已过时间”，不自动改到明天或补发提醒。没有日期和时刻的普通事项不会凭空生成提醒。

AceNote 采用“桌宠 + 日程浮窗”为主、完整记录窗口按需打开的形态：启动不弹大窗口，单击或双击网球人物只打开日程浮窗；点击“打开完整记录”或桌宠右键菜单才显示大窗口。关闭大窗口仅收起该窗口，浮窗和桌宠继续运行；浮窗失焦也不会自动消失。需要退出应用时，右键桌宠选择“退出 AceNote”或使用系统退出命令（macOS 为 Cmd+Q），此时才关闭所有窗口并停止提醒。

点击浮窗中未完成事项前的圆圈即可直接完成任务，同步取消提醒、更新完成数并触发人物动效；这个操作不需要 DeepSeek 密钥或网络，也会保留输入框里的草稿。误操作可在完整记录中恢复事项。

桌宠使用越前龙马形象的持拍、左手击球、庆祝三态透明 PNG，主窗口、日程浮窗和球场统一为澳网蓝主题。浮窗支持输入日程和完成指令，手动收起后保留本次会话草稿。窗口均通过上下文隔离的 preload 通信，不增加托盘或开机启动。素材来源和提示词见 [RYOMA-ASSETS.md](apps/desktop/resources/pet/RYOMA-ASSETS.md)。

## 技术栈

- Electron、React、TypeScript、Vite
- SQLite（`better-sqlite3`）
- Node.js、NestJS、DeepSeek API
- npm workspaces、Vitest、ESLint

## 环境要求

- 推荐 Node.js 22 LTS（仓库提供 `.nvmrc`）；也支持 Node.js 24
- npm 10+
- macOS 或 Windows 桌面环境；Windows 原生窗口行为尚未完整实测
- 完整的自然语言新增、完成识别及自动提取提醒时间需要自己的 DeepSeek API 密钥
- 首次安装和启动需要联网下载依赖及 Electron；SQLite 原生模块若需本机编译，还需要 Python 3 和 C++ 构建工具（macOS 为 Xcode Command Line Tools，Windows 为 Visual Studio 的 C++ 桌面开发工具）

## 拉取并本地运行

有仓库访问权限即可从源码运行，不需要复制开发者的数据库、生成原图或其他本机文件。当前提供源码运行方式，`npm run build` 生成构建目录，不生成 `.dmg` / `.exe` 安装包，也没有 Docker 或云端部署要求。

以下命令均在仓库根目录执行：

```bash
git clone https://github.com/ccliujc/AceNote.git
cd AceNote
npm ci
cp .env.example .env
```

Windows PowerShell 把最后一条替换为 `Copy-Item .env.example .env`。

编辑根目录 `.env`，填写自己的 `DEEPSEEK_API_KEY`，其他参数默认即可。密钥只由本地解析服务读取，不随仓库分发。不要提交 `.env`，也不要把密钥写入桌面端代码。

然后启动：

```bash
npm run dev
```

启动后桌面先出现越前龙马，单击人物打开日程浮窗。可输入“12点提醒我吃饭”，确认列表中显示具体时间；完整记录从浮窗底部或人物右键菜单打开。

也可以先构建，再运行构建后的应用：

```bash
npm run build
npm start
```

`npm start` 会启动本地解析服务，并为 Electron 重建 SQLite 原生模块后打开桌面应用；保持启动命令所在终端运行。开发模式与构建运行模式任选一种，不要同时启动，两者默认共用 `3777` 解析端口。日程数据自动存到每位使用者自己的 Electron 用户数据目录，首次运行自动建库及迁移，不需要手工建表。

没有配置密钥时，应用仍会保存输入原文，但识别会提示未配置。可选择“作为新待办”，再到完整记录里手动编辑标题、日期与时间；自动自然语言识别需要配置密钥后重试。

## 常用命令

```bash
npm run dev          # 启动本地解析服务与桌面端
npm start            # 运行构建后的服务与桌面端，需先 npm run build
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

`npm run dev` / `npm start` 会为当前 Electron 版本重建 `better-sqlite3`。如果刚运行过桌面应用，随后要执行 Node.js 单元测试，请先退出应用，再运行 `npm rebuild better-sqlite3` 恢复 Node.js ABI，然后执行 `npm test`；下次启动桌面应用会自动切回 Electron ABI。解析失败的原文保存在本地，使用界面的重试或转换入口处理。

## 常见启动问题

- **SQLite 原生模块或 NODE_MODULE_VERSION 错误**：确认 Node.js 版本，退出应用后重新 `npm ci`；通过 `npm run dev` / `npm start` 启动，让脚本完成 Electron 原生模块重建。
- **编译时找不到 Python / C++ 编译器**：准备上述平台构建工具后，重新安装并启动；不要把另一台电脑的 `node_modules` 复制过来。
- **没有出现大窗口**：这是默认设计，先找桌面人物并单击；退出请用人物右键菜单或 Cmd+Q。
- **识别不可用**：检查根目录 `.env` 中的密钥、网络与本地服务日志。默认服务只绑定 `127.0.0.1:3777`；修改端口时，还需在启动前为桌面进程设置 `ACENOTE_PARSE_URL` 指向相同地址。

## 规格与实施

- `spec/CAPABILITY-MAP.md`：能力边界和构建顺序
- `spec/SPEC-capture.md`：当前模块规格
- `tasks/plan.md`：技术计划
- `tasks/todo.md`：已批准任务清单
- `spec/SPEC-ui-polish.md`：界面优化规格
- `tasks/todo-ui-polish.md`：本轮界面优化执行进度
- `tasks/verification-ui-polish.md`：检查结果、预览截图与原生平台待验收项
- `spec/SPEC-floating-capture.md`：浮窗日程输入与人物桌宠扩展
- `tasks/todo-floating-capture.md`：浮窗输入与人物素材的交付和验证记录
- `spec/SPEC-floating-first.md`：浮窗优先的产品形态与退出规则
- `tasks/todo-floating-first.md`：本次窗口生命周期改造与验证记录
- `spec/SPEC-ao-blue-ryoma.md`：越前龙马人物与澳网蓝主题规范
- `tasks/todo-ao-blue-ryoma.md`：主题替换交付、视觉预览与验证记录
- `spec/SPEC-floating-minimal.md`：白底简洁日程浮窗规范与快捷键
- `tasks/todo-floating-minimal.md`：简洁浮窗交付与验证记录
- `spec/SPEC-time-only-today.md`：省略日期默认今天的时刻解析规则
- `tasks/todo-time-only-today.md`：时间识别与提醒回归验证
- `tasks/verification-local-setup.md`：干净源码安装、构建与本地运行验证
- `spec/SPEC-click-complete.md`：圆圈手动完成事项的接口与交互
- `tasks/todo-click-complete.md`：手动完成、提醒联动与回归验证
