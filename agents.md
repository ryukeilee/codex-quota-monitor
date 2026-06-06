# AGENTS.md

## 项目定位

Codex Monitor 是一个本地运行、隐私优先、macOS 菜单栏的 Codex 额度监控工具。

核心目标是帮助开发者长期稳定维持 Codex 开发心流。

## 核心原则

- Local-first
- Privacy-first
- 只读本地 Codex 状态
- 低资源占用
- 低频刷新
- 原生 macOS menubar 风格
- 低视觉干扰
- 长期可维护性优先

## 功能范围

允许实现：

- 5 小时额度剩余百分比
- 周额度剩余百分比
- 恢复/重置时间
- 低额度警示
- 紧凑型 mini panel
- 使用趋势图
- 预测提示
- 开机启动
- 纯 menubar 模式

## 数据源规则

必须：

- 优先读取本地 Codex app-server 的 `account/rateLimits/read` 数据
- `data/source-snapshot.json` 仅作为 fallback

禁止：

- 依赖浏览器 session
- 依赖 Chrome
- 默认抓取账号网页
- 默认上传额度数据到外部服务

## Menubar UI 规则

菜单栏必须：

- 极简
- 小字体
- 接近原生 macOS 状态栏
- 长时间挂机舒适

推荐显示：

- `72%`

禁止：

- 大字体
- 重图标
- emoji 风格
- 高干扰赛博风
- 菜单栏霓虹效果
- 厚重视觉元素

赛博风只允许用于：

- panel
- window
- mini stats

并且必须克制。

## UI 风格规则

允许：

- 紧凑布局
- 深色界面
- 细分割线
- 微弱 glow
- 小型状态点
- 极简趋势图

禁止：

- 厚重玻璃拟态
- 超大标题
- 高噪音动画
- 复杂 dashboard
- 大面积视觉特效

## 工程规则

- 所有改动必须小范围、可回滚
- 未经明确允许，不要重构整体架构
- 保持现有 npm scripts
- 修改后运行 `npm test`
- `data/`、`logs/`、`.playwright-mcp/` 等本地生成内容保持未跟踪状态
- 禁止提交 runtime data、logs、本地缓存

## Codex 任务规范

每个 Codex 任务必须包含：

- Goal
- Files likely to change
- Non-goals
- Acceptance criteria
- Test command
- Rollback risk

## 默认测试命令

`npm test`

## 验收标准

- README 保持简洁
- `agents.md` 为纯 Markdown
- 不再包含 RTF 内容
- `agents.md` 能稳定指导 Codex 行为
- `npm test` 通过
- 不修改无关源码
