# AceNote 已有项目的 OpenSpec 基线

初始整理日期：2026-11-01（Asia/Shanghai）。初始代码基线：`main` / `e28e615`。

2026-11-04 收尾：F01 已实现，三份增量规格已同步至正式规格，23/23 项任务完成；变更归档于 [2026-11-04-recover-submitted-inputs](changes/archive/2026-11-04-recover-submitted-inputs/proposal.md)。当时 4 项正式规格共 43 条需求、104 个情景，活动变更为 0。业务及 macOS 隔离验收见 [验收记录](../tasks/verification-f01-input-recovery.md)。

2026-11-06 收尾：F02 已实现，两份增量规格已同步至正式规格，21/21 项任务完成；变更归档于 [2026-11-06-sync-active-reminders](changes/archive/2026-11-06-sync-active-reminders/proposal.md)。当时 4 项正式规格共 48 条需求、133 个情景，活动变更为 0；业务及 macOS 隔离验收见 [验收记录](../tasks/verification-f02-active-reminders.md)。

2026-11-08 收尾：F03 已实现，三份增量规格已同步至正式规格，20/20 项任务完成；变更归档于 [2026-11-08-reparse-existing-tasks](changes/archive/2026-11-08-reparse-existing-tasks/proposal.md)。当前 4 项正式规格共 54 条需求、165 个情景，活动变更为 0；业务及 macOS 隔离验收见 [验收记录](../tasks/verification-f03-task-reparse.md)。

## 基线范围

本次根据用户“先整理已实现功能，建立 OpenSpec 基线规格”的选择，核对当前应用入口、实现、已有测试及历史规格，将已经接入当前产品的能力整理为正式规格。没有为尚未实施的功能创建已完成记录，也没有生成或归档一项虚构的开发变更。

| 能力 ID              | 当前功能范围                                                                                   | OpenSpec 规格                                          | 原有主要文档                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `capture`            | 文字提交、原文持久化、识别契约、时间补全、交互与重启恢复、原文转换、手动编辑、已有事项重新识别 | [capture](specs/capture/spec.md)                       | [capture](../spec/SPEC-capture.md)、[默认今天](../spec/SPEC-time-only-today.md)            |
| `task-lifecycle`     | 三态、每日记录、自然语言完成、精确手动完成、归档恢复、完成统计、输入互斥与候选复核             | [task-lifecycle](specs/task-lifecycle/spec.md)         | [任务生命周期](../spec/SPEC-task-lifecycle.md)、[手动完成](../spec/SPEC-click-complete.md) |
| `reminders`          | 时区与截止计算、未来计划、调度去重、错过不补发、会话活动查询、统一关闭与失效清理               | [reminders](specs/reminders/spec.md)                   | [提醒规格](../spec/SPEC-reminders.md)                                                      |
| `desktop-experience` | 浮窗优先、独立关闭、会话草稿、每日浮窗、球场、人物与消息、窗口隔离、跨日期恢复入口             | [desktop-experience](specs/desktop-experience/spec.md) | [桌面体验](../spec/SPEC-desktop-experience.md)及其后续修订                                 |

每份规格使用 `Purpose`、`Requirements`、`Requirement` 和 `Scenario` 结构；需求文字保留 SHALL，验收情景保留 WHEN/THEN。稳定需求名称包含 CAP、LIFE、REM 或 DESK 编号，后续修改应引用完整原名称。

## 现状、缺口与后续需求

基线中的 `Requirements` 是已经接入现有应用的行为约定；`Known Gaps` 记录现有边界与未完成项，不能被理解为这些问题应永久保留。

| 后续编号 | 核对到的边界                                                               | 处理位置                                                                                |
| -------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| F01      | 已实现跨日期恢复、候选重算与重复处理保护；旧无可靠关联记录保留人工核对边界 | [F01 验收记录](../tasks/verification-f01-input-recovery.md)；正式规格已同步，变更已归档 |
| F02      | 已实现本会话活动查询、统一关闭与过期展示清理；正式规格已同步，变更已归档   | [F02 验收记录](../tasks/verification-f02-active-reminders.md)                           |
| F03      | 已接入三态事项重新识别、合并及版本保护；正式规格已同步，变更已归档         | [F03 验收记录](../tasks/verification-f03-task-reparse.md)                               |
| F04      | 首次使用说明仍仅在文档，未接入应用                                         | 下一阶段需求草案                                                                        |
| F05、F06 | 应用内解析配置、安装包与服务自动管理未交付                                 | 下一阶段需求草案                                                                        |
| F07、F08 | 账号、数据归属迁移与托管解析未交付                                         | 下一阶段需求草案；identity 继续暂缓                                                     |
| Q01      | 原生透明穿透、多屏、实际缩放、弱动态及断网冷启动仍待完整验收               | [原生待验收记录](../tasks/verification-ui-polish.md#待验收项)                           |

详细后续要求保留在 [下一阶段需求说明书](../spec/PRD-next-release.md)。例如“今日记录按记录日期查询”“退出期间提醒不补发”“人物仍为 PNG 加 CSS”是当前产品约定，不能在接入 OpenSpec 时顺便改成新的产品行为。

## 与原有文档的关系

- `openspec/specs/` 作为今后 OpenSpec 变更引用的当前能力基线；同一能力的后续变化使用其既有 ID，避免重复创建另一份相同能力。
- 原 `spec/` 保留详细设计、历史决策及尚未实施的需求，`tasks/` 保留当时的交付与验收记录。本次不删除、不整体搬运，也不把历史清单全部标记为重新通过。
- 原文档承诺但代码入口未实现的内容记录在已知缺口中，不直接复制成已完成要求；若后续发现其他差异，应先核对代码与证据，再修订基线或创建对应变更。
- 规格校验只证明 OpenSpec 文档结构可解析，不能证明业务测试通过或原生平台已经验收。

## 在已有项目继续使用

项目命令使用本地锁定的 OpenSpec，无需全局安装：

```bash
npm run openspec -- list --specs
npm run openspec -- show capture --type spec
npm run openspec -- validate --all --strict --no-interactive
npm run openspec -- list
```

后续可在 Codex 中使用 `$openspec-propose`，例如“根据需求草案 F04，规划首次使用说明”。该流程以这里的现有规格为基础创建 `openspec/changes/<name>/` 中的提案、增量规格、设计和任务，之后按用户授权范围实施。

当前有 4 项正式规格，共 54 条需求、165 个情景；F01、F02、F03 已同步并归档，活动变更为 0。后续功能先创建独立提案，再按授权范围实施。

## 初始基线整理的核对与验证范围（历史记录）

- 已只读检查当前主进程入口、当前 React 页面入口、相关服务和仓储、窗口与 preload 结构、相关已有测试及历史规格。
- 本次仅写入基线文档并更新 README 入口，不改运行代码、依赖、数据库、人物资源或窗口行为。
- 相关测试文件作为可追溯证据引用，不表示本轮重新执行了业务测试；过去不同轮次的测试数量不汇总为当前验证结论。
- 原生平台实测仍按 Q01 单独记录。
- OpenSpec 严格校验通过 4/4 项规格，清单正确识别 35 条需求；逐项读取结果确认 70 个情景全部被解析。
- 68 处本地文档链接（含锚点）、文档格式和差异空白检查通过，OpenSpec 项目健康检查通过；当时活动变更清单为空；后续 F01 以其验收记录为准。
