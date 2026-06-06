# Codex Monitor

一个安全优先、低频刷新、本地运行的 Codex 剩余额度小工具。

## 当前首版能力

- Electron 桌面壳
- Node 内置 SQLite 持久化
- 优先读取真实 `~/.codex/state_5.sqlite` 会话状态
- 读不到真实状态时回退到本地快照 `data/source-snapshot.json`
- 5 小时窗口额度计算
- 低频刷新策略
- 菜单栏显示剩余额度百分比
- 低额度时菜单栏警示符号与高亮标题
- 关闭窗口后继续驻留菜单栏
- 菜单栏快捷开关通知与显示模式
- 菜单栏迷你统计面板
- 开机自启动
- 纯菜单栏模式（隐藏 Dock）
- 剩余额度趋势图
- 心流预测与提醒建议
- macOS 通知与菜单栏标题

## 启动

```bash
npm install
npm test
npm start
```

也可以直接双击根目录里的 [run.command](/Users/ryukeili/Desktop/codex%20github/codex剩余额度小工具/run.command) 启动。

## 数据源说明

当前实现不会抓取 Codex 私有接口，也不会注入客户端。数据源优先级是：

1. `~/.codex/state_5.sqlite` 的真实本地线程/会话状态
2. `data/source-snapshot.json` 的本地快照回退

说明：

- 真实适配器会读取本地线程的 `model`、`reasoning_effort`、`tokens_used`、`updated_at_ms`
- 当前首页里的 `%` 是基于你设置的 `5 小时本地预算` 估算出的剩余比例
- 这比演示数据更真实，但它仍然是基于本地 Codex 会话消耗估算出来的剩余额度

示例结构：

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

你后续只需要把本地可安全读取的 Codex 使用快照整理成这个结构，工具就能持续展示和预测。

## 菜单栏增强

- 菜单栏标题默认显示 `xx%` 剩余额度
- 点击菜单栏标题可显示或隐藏主窗口
- 关闭主窗口时可继续驻留在菜单栏
- 菜单栏右键菜单可以直接：
  - 查看窗口状态、恢复时间、预计还能开发多久
  - 立即刷新
  - 开关提醒通知
  - 开关菜单栏百分比显示
