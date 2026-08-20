# ThreadMesh 中文文档

ThreadMesh 是一个面向多种 agent harness 的安全主动协调层。它让 agent 能够发现跨任务依赖并主动通信，同时保护接收任务的上下文主权。

当前英文规范是 canonical source；中文目录负责解释核心理念并降低参与门槛。

## 推荐阅读

1. [愿景](vision.md)
2. [安全模型](safety-model.md)
3. [Codex 主动跨任务协调调研摘要](research-summary.md)
4. [英文文档总览](../README.md)
5. [英文协议草案](../03-protocol/README.md)
6. [路线图](../../ROADMAP.md)

## 一句话理解

ThreadMesh 并不赋予 agent 任意修改其他 session 的权力。它提供一套可移植的机制，让 agent：

```text
发现相关任务 → 说明依赖 → 选择最弱有效意图 → 发送带来源的请求
             → 接收方判断 → 接受/拒绝/延迟 → 留下审计记录
```

项目首先关注单一用户或团队内部、多种本地 harness 之间的协作。跨用户、开放网络发现和 agent 市场不在初始范围内。
