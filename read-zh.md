# Codex Monitor

Codex Monitor 是一款以隐私优先、完全本地运行的 macOS 菜单栏应用，用来查看 Codex 的剩余额度和使用状态。

[English README](./README.md)

## 主要能力

- 基于 Electron 的本地桌面应用
- 直接读取本机 Codex app-server 的实时额度数据
- 保留周额度显示
- 菜单栏显示剩余额度百分比，并支持低额度警示
- 菜单栏迷你统计面板
- 支持开机自启动
- 支持纯菜单栏模式，隐藏 Dock
- 低频刷新策略
- 使用本地 SQLite 持久化应用状态
- 带历史趋势图和预测提示

## 启动方式

```bash
npm install
npm test
npm start
```

也可以直接双击 [run.command](./run.command) 启动。

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

## 菜单栏

- 菜单栏标题显示当前 5 小时剩余额度百分比
- 菜单栏菜单中显示周剩余额度百分比
- 5 小时额度接近上限时显示警示符号
- 可以直接切换主窗口、迷你面板、通知和菜单栏显示

## 隐私

- 不需要浏览器会话
- 不依赖 Chrome
- 仅读取本机 Codex 状态
- 运行时数据和日志不会纳入版本控制

## 中文说明

英文版请见 [README.md](./README.md)。
