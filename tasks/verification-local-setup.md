# 远程交付与本地运行验证

2026-10-30，按用户要求准备推送到现有 `origin/main`，并核实其他使用者能否拉取后本地运行。

## 交付准备

- 补充根目录与两个工作区的 `start` 脚本：`npm run build` 后可用 `npm start` 运行构建后的本地服务与 Electron；保留 `npm run dev`。
- README 写明克隆、`npm ci`、个人 `.env` 配置、macOS/Windows 要求、无密钥行为、构建运行、退出方式和 Node/Electron ABI 切换。
- 增加 `.nvmrc` 推荐 Node.js 22；本轮实际验证环境为 macOS、Node.js 24.14.1、npm 11.11.0。
- `package-lock.json` 中 Electron node-gyp 的来源改为 HTTPS，保持原提交 `06b29aafb7708acef8b3669835c8a7857ebc92d2`、版本和 integrity 不变。
- 15 张历史预览纳入 `docs/images/`，Markdown 改用相对链接；素材与运行代码不依赖开发者本机路径。
- `.env`、数据库、依赖、缓存、构建产物和日志未进入提交。候选文件及暂存内容与本机实际密钥值比对，无匹配；代码扫描无凭据模式命中。

## 干净源码副本验证

从 Git 暂存区导出全新源码副本，最初不含 `.env`、`node_modules` 或构建目录；使用完整锁文件和仓库资源。

1. `npm ci --no-audit --no-fund` 成功。
2. 修正依赖协议后，使用新的空 npm 缓存，并设置 `GIT_CONFIG_GLOBAL=/dev/null`、`GIT_CONFIG_NOSYSTEM=1`、`GIT_TERMINAL_PROMPT=0`、`GIT_SSH_COMMAND=false`，再次 `npm ci` 成功；验证依赖安装不要求使用者的 SSH 密钥。npm 仍可能打印 hosted-git 依赖的规范化提示，此提示未阻止安装。
3. 在最终安装结果上运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build`，全部通过；37 个测试文件、181 项测试通过（desktop 121 / server 49 / contracts 11）。
4. `npm run rebuild --workspace @acenote/desktop` 成功；使用 Electron 的 Node 运行模式加载 `better-sqlite3` 并执行内存数据库 `SELECT 1` 成功。实际 Electron 33.2.1、ABI 130。
5. 在干净副本运行 server 的构建启动命令，单独使用回环端口 3787；Nest 服务正常启动。非法请求返回 `400 / INVALID_INPUT`，未配置个人密钥的合法请求返回 `503 / PARSE_NOT_CONFIGURED`，未调用上游 API。
6. README、任务记录与素材说明中的相对文档/图片链接均指向仓库内现有文件。`git diff --check` 通过。

安装出现部分旧开发依赖的弃用提示，构建出现 Zod 注释提示，均未导致上述命令失败。本轮不改动无关依赖版本。

## 适用范围

这验证了源码安装、检查、构建、服务启动和 Electron 原生模块可用；没有新增安装包、自动更新或云端部署。使用者需要桌面环境、Node/npm、联网安装及必要的本机编译工具，完整自然语言功能需要自己的 DeepSeek 密钥。Windows 原生窗口和新机器完整 GUI 流程未在本轮实测，不能据此宣称所有平台一键可用。

原开发工作区的应用与个人数据库未用于此干净副本测试，临时服务测试完毕已停止。
