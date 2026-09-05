# ThreadMesh 中文文档

让不同 Agent 的独立 session 自己分享有用变化，省掉你在聊天之间反复转述的工作。
先看用户指南；不需要先读完协议，也不用运行旧的多角色验证流程。

[项目首页](../../README.zh-CN.md) · [English docs](../README.md)

## 从你的问题开始

| 我想…… | 推荐入口 |
|---|---|
| 快速理解项目有什么用 | [ThreadMesh 是什么](product-guide.md) |
| 把自己的 Agent 接起来 | [第一次真实协作：中文上手](first-workspace.md) |
| 看真正的模型主动行为 | [真实案例与证据](../06-guides/real-world-cases.md) |
| 换一家 Agent 继续已保存的工作 | [Checkpoint 与额度边界](../06-guides/portable-checkpoints.md) |
| 确认支持哪些产品和版本 | [Harness 支持矩阵](../00-overview/harness-support.md) |
| 给自己的 harness 增加能力 | [MCP 接入](../06-guides/first-workspace.md#kimi-and-custom-harnesses) · [SDK 指南](../06-guides/implement-an-adapter.md) |
| 了解权限和隐私 | [当前威胁模型](../04-safety/threat-model.md) · [上下文主权](../01-concepts/context-sovereignty.md) |
| 报告安装失败或 Agent 沉默 | [首次使用反馈](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) |
| 看下一步要做什么 | [Roadmap](../../ROADMAP.md) · [当前验收计划](../10-planning/cross-harness-acceptance-2026-09-05.md) |

## 当前真实进度

[2026-09-05 验证记录](../09-reviews/2026-09-05-workspace-awareness.md)保留了三轮
普通 Codex → Pi 任务：接口协作**通过**、无关变化不联系**通过**，品牌文案的
业务完整性**失败**。后者虽然送达并唤起同一个接收 session，却漏了“免费方案”条件。

普通任务没有指定收件人或要求发送；通用协作提示已启用，Pi 先自主说明依赖，
Codex 随后回复。这是无需人工转述的双向协作，不是任意旧 tab 的自动接管。

- `preview` 是模拟 Agent 演示，不是模型主动性的证据。
- DeepSeek 新接入通过无模型原生检查，真实模型主动协作仍未验证。
- Checkpoint 携带显式保存的工作上下文，不是无损迁移整段聊天。
- 原生忙碌输入竞争、真实历史 session 接入和独立用户上手仍有开放验收项。

## 用户、开发者与研究者

普通使用者从[上手指南](first-workspace.md)开始，观察真实产物，不只看“已收到”。
开发者可复用四工具 workspace/MCP 接口；更底层的 SDK 与 adapter 是另一种接入层次，
详见[英文文档导航](../README.md)。

研究者可看[Codex 调研摘要](research-summary.md)、[社区研究](../07-research/community-signals.md)
和[架构决策](../08-decisions/README.md)。旧五角色流程、九次人工操作基线及历史测试
数量不再作为当前入门主线；原始记录保留在[评审目录](../09-reviews/README.md)。

中文入口解释当前产品用法；标注为规范的协议文档仍以英文为准。
