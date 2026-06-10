# Codex Monitor

Codex Monitor 是一款安静、隐私优先的 macOS 菜单栏应用，适合每天使用 Codex 的开发者。它会把剩余额度放在抬眼可见的位置，同时保持本地运行、低干扰和轻量刷新。

[English README](./README.md)

## 核心亮点

- 一眼可见的 Codex 剩余额度
- 原生风格的菜单栏展示和紧凑菜单
- 本地优先、隐私优先
- 低频自动刷新，减少打扰
- 菜单栏首屏只保留周额度、5 小时窗口、状态和下一次刷新等核心信息
- 可查看重置时间、趋势和本地规则型开发心流建议
- 支持开机自启动与纯菜单栏模式

## 快速开始

```bash
npm install
npm test
npm run build:app
```

构建完成后，直接在 Finder 中打开 `dist/Codex Monitor.app` 即可启动。

`run.command` 仍保留为开发辅助入口；日常使用建议直接打开打包后的 `.app`。

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

- 菜单栏标题用纯百分比显示当前周额度
- 菜单首段只展示最重要的概览：周额度、5 小时窗口、状态和下一次刷新
- 更细的历史信息和辅助文案不挤占首屏，保持菜单更容易扫读
- `立即刷新` 与设置项分离，减少误触
- 下方设置区可打开 Dashboard 并调整菜单栏偏好

## 隐私与存储

- 不需要浏览器会话
- 不依赖 Chrome
- 仅读取本机 Codex 状态
- 开发心流建议只依赖本地额度、刷新状态和数据新鲜度
- 刷新日志会自动脱敏，避免输出 token、cookie 或账号信息
- 低额度提醒默认保持安静，优先在菜单中展示
- 运行时数据和日志不会纳入版本控制
- `data/`、`logs/`、`.playwright-mcp/` 等本地生成内容都应保持未跟踪状态

## 刷新行为

- 普通定时刷新默认每 5 分钟执行一次
- 强制刷新在 10 秒内会去重
- Mac 唤醒后会按 5 秒、15 秒、30 秒、60 秒发起重试
- 任意一次唤醒刷新成功后会取消后续重试
- 解锁桌面会触发一次强制刷新
- 长时间睡眠后，会把旧的本地状态重新锚定到当前 5 小时窗口
- 跳过或失败的刷新不会中断后续定时刷新链路
- 开发心流建议始终保持简短、克制、可执行

## 开发规范

本项目针对 Codex 和 GPT Projects 的 AI 协同开发进行了优化。

核心开发规范位于 [agents.md](./agents.md)。所有实现都应保持本地优先、隐私优先、低频刷新、原生 macOS 菜单栏风格，并优先保证长期稳定维护。

## English Documentation

英文版请见 [README.md](./README.md)。
