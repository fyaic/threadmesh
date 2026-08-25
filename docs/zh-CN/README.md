# ThreadMesh 中文文档

ThreadMesh 是一个面向多种 agent harness 的安全主动协调层。它让 agent 能够发现
跨任务依赖并主动通信，同时保护接收任务的上下文主权。

当前英文规范是 canonical source；中文目录负责解释核心理念并降低参与门槛。

## 推荐阅读

1. [ThreadMesh 是什么](product-guide.md)
2. [端到端 A→B 案例](../06-guides/end-to-end-demo.md)
3. [真实 Pi→Kimi 案例](../06-guides/pi-to-kimi-demo.md)
4. [愿景](vision.md)
5. [安全模型](safety-model.md)
6. [Codex 主动跨任务协调调研摘要](research-summary.md)
7. [当前项目状态](../10-planning/project-status.md)
8. [英文文档总览](../README.md)
9. [英文协议草案](../03-protocol/README.md)

## 一句话理解

ThreadMesh 并不赋予 agent 任意修改其他 session 的权力。它提供一套可移植的机制，让 agent：

```text
发现相关任务 → 说明依赖 → 选择最弱有效意图 → 发送带来源的请求
             → 接收方判断 → 接受/拒绝/延迟 → 留下审计记录
```

项目首先关注单一用户或团队内部、多种本地 harness 之间的协作。跨用户、开放网络发现和 agent 市场不在初始范围内。

## 当前进度

- 143 项 unit/subtest、14 个 schema 和状态转换测试通过。
- control / relevant / irrelevant 的确定性 A→B 演示通过完整 coordinator 路径。
- Codex 真实主动 A→B 曾把接收方结果从缺少依赖提升到完成，但重复可靠性不足，
  因此 proactive 默认关闭。
- Kimi Code `0.38.0` 已完成真实 receiver-accepted suggestion，并验证 session
  删除后不存在。
- Codex CLI `0.145.0` → Kimi Code `0.38.0` 的真实主动跨 harness 案例已通过；
  Codex 自主发现并发送一次，Kimi 接受后完成，双方资源完整清理。
- Pi `0.84.2` 已在全新消费项目中只通过公开 SDK 接入：相关条件发现并发送一次，
  无关条件只发现不发送，对照条件零调用；随后 Pi 向真实 Kimi ACP task 提供一条
  非权威协调输入，完成 mailbox 接受、context admission、审计和全部清理。
- Gemini CLI adapter 与无模型预检通过；真实 provider 调用未授权。
- M1、M2 milestone 已关闭；最小可安装集成路径和真实 Pi→Kimi 技术验证已完成。
  下一步是独立 harness 作者反馈，而不是扩张协议表面。
- M0 的规范修复已完成，仍等待两份独立外部 review。
