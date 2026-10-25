# 能力地图：AceNote

来源：`AceNote-需求说明书-v0.3.docx`（2026-10-25，需求草案）

## 当前假设

1. 项目由 Electron + React + TypeScript 桌面客户端和腾讯云上的服务端组成。
2. 本地 SQLite 用于原文暂存和离线待提交队列，云端数据库用于长期保存账号数据。
3. DeepSeek API 仅由服务端调用，密钥不进入桌面客户端。
4. 首期不做多设备实时同步，但允许另一台设备登录后读取同账号的云端数据。
5. 注册方式、错过提醒的补发规则、归档恢复入口在各模块规格阶段确认。

## 模块

| 模块 id | 职责 | 依赖 |
|---|---|---|
| `identity` | 账号注册、登录、退出、会话，以及云端数据归属和账号隔离 | — |
| `capture` | 快速文字提交、原文本地暂存、离线待提交、DeepSeek 字段解析、识别结果查看与修改 | `identity` |
| `task-lifecycle` | 每日记录、任务状态、文字完成指令与歧义处理、完成时间、手动归档、完成统计 | `capture` |
| `reminders` | 截止时间计算、系统通知、提醒更新与取消；无具体时间时默认当地 09:00 | `task-lifecycle` |
| `desktop-experience` | 可拖动悬浮桌宠、轻量输入窗口、每日列表、网球场与状态图案、击球或 Ace 动效、客户端生命周期 | `identity`, `task-lifecycle`, `reminders` |

## 构建顺序

`identity` → `capture` → `task-lifecycle` → `reminders` → `desktop-experience`

## 跨模块契约

- `identity` 向其他模块提供已认证用户身份；所有云端任务读写必须按用户隔离。
- `capture` 输出包含原始文字、客户端记录时间、识别字段和同步状态的待办；模型不得生成或覆盖记录时间。
- `task-lifecycle` 向 `reminders` 提供完成、归档和截止时间变更事件，以取消或更新提醒。
- `desktop-experience` 负责呈现和交互，不替代云端鉴权、字段校验或任务状态规则。
