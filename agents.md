# AGENTS.md

## 项目定位

Codex Monitor 是一个本地运行、隐私优先的 macOS 菜单栏工具。

它的目标不是做复杂分析，而是帮助开发者稳定感知 Codex 剩余额度，并维持低打扰的开发心流。

## 长期不变的原则

- Local-first
- Privacy-first
- 只读本地 Codex 状态
- 低资源占用
- 低频刷新
- 原生 macOS menubar 风格
- 长时间挂机舒适
- 长期可维护性优先

## 近期重点

- 保持菜单栏只显示周额度百分比，不把建议文案塞进标题
- 维持本地规则型开发心流建议，输出简短、克制、可执行的提示
- 保持低频刷新、失败可恢复、唤醒可重试的刷新链路
- 保持本地快照 fallback、静默低额度提示和本地存储边界
- 保持 dashboard、tray、artifact、tests 的口径一致

## 当前代码结构

- `src/main.js`：Electron 主进程入口，负责窗口、托盘、IPC、唤醒重试和应用生命周期
- `src/monitor/monitor-service.js`：额度数据编排层，负责读取、合并、汇总、发布 dashboard
- `src/session/`：本地数据源读取层
- `src/session/codex-rate-limit-reader.js`：读取本地 Codex app-server 的 `account/rateLimits/read`
- `src/session/local-snapshot-reader.js`：读取 `data/source-snapshot.json` 作为 fallback
- `src/session/codex-state-reader.js`：从本地 Codex session state 生成快照
- `src/session/snapshot-source-router.js`：按优先级路由实时数据、会话状态和本地快照
- `src/session/thread-usage-delta.js`：把线程状态转成 5 小时窗口中的可比较消耗记录
- `src/core/`：额度数学、刷新状态、系统偏好、告警阈值等纯规则模块
- `src/core/quota-math.js`：5 小时窗口、7 天窗口、趋势历史、刷新间隔
- `src/core/refresh-status.js`：刷新阶段、数据来源、新鲜度的标准化
- `src/core/quota-alert.js`：静默分级的周额度提醒
- `src/core/system-preferences.js`：本地偏好与系统登录项状态合并
- `src/predictor/flow-predictor.js`：保留中的消耗速度提示逻辑
- `src/predictor/flow-advice.js`：本地规则型开发心流建议
- `src/notification/menu-bar-presenter.js`：托盘标题、菜单文案、菜单标签组装
- `src/ui/index.html`：dashboard 结构
- `src/ui/renderer.js`：dashboard 渲染与本地建议展示
- `src/ui/styles.css`：dashboard 样式
- `src/utils/dashboard-artifact.js`：本地 dashboard 文本与 JSON artifact
- `src/utils/format-usage.js`：额度显示格式化
- `src/utils/logger.js`：日志封装
- `src/storage/database.js`：本地状态存储
- `src/preload.cjs`：renderer 安全桥接
- `test/`：单元测试与集成测试

## 功能边界

允许实现：

- 5 小时额度剩余百分比
- 周额度剩余百分比
- 恢复/重置时间
- 低额度警示
- 本地规则型开发心流建议
- 使用趋势图
- 预测提示
- 开机启动
- 纯 menubar 模式

不做的事：

- 不接入 AI / LLM
- 不做复杂预测模型
- 不做 token 级估算
- 不做 Dashboard 级大改版
- 不新增通知体系
- 不提高刷新频率
- 不依赖浏览器 session
- 不依赖 Chrome
- 不默认抓取账号网页
- 不上传额度数据到外部服务
- 不把建议文案放进菜单栏标题

## 本地开发心流建议规则

- 只依据本地额度数据、刷新状态和数据新鲜度
- 建议必须短、明确、可执行
- 结果必须能区分适合大任务、小任务、谨慎推进、只做 Review / 收尾、数据未知
- 数据偏旧时要明确标注“基于偏旧数据”
- 规则必须稳定、可测试、无网络依赖

## 数据源规则

必须：

- 优先读取本地 Codex app-server 的 `account/rateLimits/read`
- `data/source-snapshot.json` 仅作为 fallback
- 本地 session state 和快照只作为本地兜底，不引入浏览器依赖

禁止：

- 依赖浏览器 session
- 依赖 Chrome
- 默认抓取账号网页
- 默认上传任何额度数据

## Menubar 规则

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

并且必须克制。

## UI 风格规则

允许：

- 紧凑布局
- 深色界面
- 细分割线
- 微弱 glow
- 小型状态点
- 极简趋势图
- 少量、明确的状态文案

禁止：

- 厚重玻璃拟态
- 超大标题
- 高噪音动画
- 复杂 dashboard
- 大面积视觉特效
- 让建议淹没主要额度信息

## 工程规则

- 所有改动必须小范围、可回滚
- 未经明确允许，不要重构整体架构
- 优先复用现有模块和数据结构
- 保持现有 npm scripts
- 修改后运行 `npm test`
- `data/`、`logs/`、`.playwright-mcp/` 等本地生成内容保持未跟踪状态
- 禁止提交 runtime data、logs、本地缓存
- 若行为变化，先更新测试，再改实现

## 验证闭环

任务结束前尽可能验证：

- `npm test`
- 必要时补充类型、lint、构建或 smoke test
- 重点关注新增建议规则、菜单栏文案、artifact 输出和数据源路由

如果无法完整验证：

- 说明已验证内容
- 说明未验证内容
- 说明潜在风险

禁止声称未执行过的验证已经完成。

## Codex 任务规范

每个 Codex 任务应包含：

- Goal
- Files likely to change
- Non-goals
- Acceptance criteria
- Test command
- Rollback risk

## 日常工作方式

- 先看当前代码状态，再动手
- 只加载与任务直接相关的文件
- 对可能影响托盘、刷新、数据源的改动保持保守
- 对文案、规则和测试保持同步
- 不为使用 Agent 而使用 Agent
- ECC 能处理的，优先复用 ECC 既有能力

## 任务收尾标准

- README 保持简洁
- `agents.md` 为纯 Markdown
- 不包含 RTF 内容
- 规则与代码状态一致
- `npm test` 通过
- 不修改无关源码
