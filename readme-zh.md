# Codex Monitor

Codex Monitor 是一款以隐私优先、完全本地运行的 macOS 菜单栏应用，用于监控 Codex 的使用额度与状态。

[English README](./README.md)

## 概览

- 基于 Electron 的本地桌面应用
- 直接读取本机 Codex app-server 的实时额度数据
- 在界面中保留周额度显示
- 菜单栏显示剩余额度百分比，并支持低额度警示
- 紧凑的菜单栏迷你统计面板
- 支持开机自启动
- 支持纯菜单栏模式并隐藏 Dock
- 采用低频刷新策略，默认定时刷新为 5 分钟，并支持唤醒重试与强制刷新去重
- 使用本地 SQLite 持久化应用状态
- 提供历史趋势图和预测提示

## 快速开始

```bash
npm install
npm test
npm start
```

也可以直接双击 [run.command](./run.command) 启动应用。

## 数据源

应用优先读取本机 Codex app-server 的实时额度数据，必要时回退到本地快照。

数据源优先级：

1. 本机 Codex app-server 的 `account/rateLimits/read` 实时数据
2. `data/source-snapshot.json` 的本地快照回退

实时数据会提供：

- 5 小时窗口剩余百分比
- 周额度剩余百分比
- 恢复时间戳

本地快照格式如下：

```json
{
  "sourceLabel": "demo-local-snapshot",
  "limit": 100,
  "isActive": true,
  "isHighIntensity": false,
  "records": [
    {
      "at": "2026-06-06T01:10:00.000Z",
      "amount": 8,
      "model": "gpt-5.4",
      "intensity": "medium"
    }
  ]
}
```

## 系统托盘

- 菜单栏标题以纯百分比形式显示当前 5 小时剩余额度，保持更接近 macOS 原生样式
- 菜单栏菜单中显示周剩余额度百分比
- 可直接切换主窗口、迷你面板、通知和菜单栏显示

## 隐私与存储

- 不需要浏览器会话
- 不依赖 Chrome
- 仅读取本机 Codex 状态
- 刷新日志会自动脱敏，避免输出 token、cookie 或账号信息
- 运行时数据和日志不会纳入版本控制
- `data/`、`logs/`、`.playwright-mcp/` 等本地生成内容都应保持未跟踪状态

## 刷新行为

- 普通定时刷新默认每 5 分钟执行一次
- 强制刷新在 10 秒内会去重
- Mac 唤醒后会按 5 秒、15 秒、30 秒、60 秒发起重试
- 任意一次唤醒刷新成功后会取消后续重试
- 解锁桌面会触发一次强制刷新

## 开发规范

本项目针对 Codex 和 GPT Projects 的 AI 协同开发进行了优化。

核心开发规范位于 [agents.md](./agents.md)。所有实现都应保持本地优先、隐私优先、低频刷新、原生 macOS 菜单栏风格，并优先保证长期稳定维护。

## English Documentation

英文版请见 [README.md](./README.md)。
