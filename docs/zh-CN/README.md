# ThreadMesh 中文文档

ThreadMesh 是一个面向多种 agent harness 的安全主动协调层。它让 agent 能够发现跨任务依赖并主动通信，同时保护接收任务的上下文主权。

当前英文规范是 canonical source；中文目录负责解释核心理念并降低参与门槛。

## 推荐阅读

1. [愿景](vision.md)
2. [安全模型](safety-model.md)
3. [Codex 主动跨任务协调调研摘要](research-summary.md)
4. [当前项目状态](../10-planning/project-status.md)
5. [后续主线计划](../10-planning/mainline-plan.md)
6. [英文文档总览](../README.md)
7. [英文协议草案](../03-protocol/README.md)
8. [路线图](../../ROADMAP.md)

## 一句话理解

ThreadMesh 并不赋予 agent 任意修改其他 session 的权力。它提供一套可移植的机制，让 agent：

```text
发现相关任务 → 说明依赖 → 选择最弱有效意图 → 发送带来源的请求
             → 接收方判断 → 接受/拒绝/延迟 → 留下审计记录
```

项目首先关注单一用户或团队内部、多种本地 harness 之间的协作。跨用户、开放网络发现和 agent 市场不在初始范围内。

## 进度说明

当前仓库已从纯文档研究进入可执行协议与实验原型阶段：

- SQLite/JSON-RPC/ACP suggestion 路径已有自动化测试；
- authenticated principal、effective grant、task lifecycle、mailbox 与 typed
  JSON-RPC error 已有公开 schema 和两类 mock harness；
- 原生 harness 调用已有持久化 `outcome-unknown` 边界、稳定幂等键、receipt、
  disposition CAS 与重启后对账；未知结果不会被自动重试；
- interrupt 结果按 model turn、tool call、subprocess 分别报告，不存在笼统
  success；外部验证必须通过可信锚校验签名 attestation；
- relationship policy 已抽成默认拒绝的纯决策引擎；公开错误不会泄露关系是
  不存在、已撤销、已过期或被新版本取代，撤销与排队中的 steer/interrupt
  失效在同一事务完成；
- durable dispatcher 在真实 adapter 调用前先持久化 `outcome-unknown`，异常或
  重启后绝不自动重试；run/objective/checkpoint freshness 会在接收和调用前各
  校验一次，所有 terminal decision 与 failure reason 都显式保存；
- Kimi ACP 握手通过，真实模型调用仍受额度阻塞；
- M0 只剩独立外部 review；
- 在 M0 稳定前，不把更多 live adapter 当作主线完成度。
