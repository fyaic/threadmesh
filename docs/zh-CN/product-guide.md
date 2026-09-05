# ThreadMesh 是什么

ThreadMesh 把独立 Agent session 接到一个明确共享的本地工作空间。
目的很直接：**不再由你负责把每个有用变化转述给另一个 Agent。**

Session 是一段有自己的任务和上下文的 Agent 会话；harness 是运行它的应用，
例如 Codex 或 Pi。ThreadMesh 连接明确加入的工作流，不合并聊天，也不是新模型。

## 一个具体问题

你让 Codex 改接口，Pi 维护客户端。分页方式变了，客户端也需要知道。
通常你得自己发现依赖、复制变化、切换 session，再讲一遍。

接入后的路径是：

1. 你为每个 session 公布一次工作目标。
2. Agent 获得协作工具和通用的任务起始提示。
3. 模型判断哪个 peer 真正需要当前信息，决定是否发送。
4. 建议进入持久收件箱，接收方结合自己的任务判断。
5. 明确开启空闲续接的 Pi 可以在同一个 session 中继续处理。

[真实 Codex → Pi 接口案例](../09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass)
跑通了这个路径，并通过客户端行为检查。Pi 先自主说明依赖，Codex 完成普通接口
任务后回复变化。用户没有转述消息。

## 当前有哪些能力

- 本地 CLI：创建工作空间，启动有名字的工作流，查看状态和静音。
- 四个模型工具：发现 peer、发送建议、读取与处置 inbox、保存 checkpoint。
- Pi 原生扩展，以及 Codex/Kimi/官方 DeepSeek 启动路径；验证程度与唤醒能力不同。
- 用明确保存的 checkpoint 启动另一家 harness，携带选定的工作上下文。
- 可复用的核心协调器、MCP 入口和更底层的 JavaScript SDK。

接入名称不等于效果保证，请看[按版本区分的支持矩阵](../00-overview/harness-support.md)。
当前是有运行时依赖、从 GitHub 分发的 alpha，不是已发布到 npm 的生产服务。

## “主动智能”在哪里

模型在配置好的协作提示下判断相关性和消息内容；ThreadMesh 提供发现、持久化、
来源信息和生命周期接入，不把每次交接写死，也不保证模型每次选择正确。

一次真实无关修改在工具可用时保持安静。另一条文案案例虽成功送达并续接，
却丢了“免费方案”的限制。**消息成功，不等于业务结果正确。**
[成功与失败记录](../09-reviews/2026-09-05-workspace-awareness.md)。

## 适合谁，不适合谁

如果你同时运行多个 Agent，不断复制接口决策、批准的约束或调研发现，值得试用。
Harness 开发者可接 [MCP](../06-guides/first-workspace.md#kimi-and-custom-harnesses)
或 [SDK adapter](../06-guides/implement-an-adapter.md)。

如果只有一个聊天，或全部交接步骤已固定，这层协作可能没有必要。
当前是同一所有者的本地设置，不是开放 Agent 网络、多租户安全边界或任意旧 tab 连接器。

## 上下文和控制权

共享的是公布的目标与建议，不扫描全部私聊。读 inbox 不会消耗消息；
是否接受是单独的处置，也不是业务检查通过的证明。Workspace 可以先把建议作为
非权威上下文给模型判断。Pi 空闲续接需要明确开启。

Checkpoint 携带选定的工作上下文，不携带隐藏状态、工具权限或无损聊天历史。
真正的额度耗尽长任务恢复、原生历史 session 接入仍待验收。

## 从哪里开始

[中文上手](first-workspace.md) · [真实案例](../06-guides/real-world-cases.md) ·
[Checkpoint 指南](../06-guides/portable-checkpoints.md) ·
[安全模型](../04-safety/threat-model.md) · [Roadmap](../../ROADMAP.md)

实现细节见[参考架构](../02-architecture/reference-architecture.md)和
[协议](../03-protocol/README.md)。历史 benchmark 继续保留，但不是当前上手的前置条件。
