# ThreadMesh

**面向不同 agent harness 的安全、主动任务协调层。**

[English](README.md) · [中文文档入口](docs/zh-CN/README.md) · [当前进度](docs/10-planning/project-status.md) · [JSON-RPC binding](docs/03-protocol/jsonrpc-binding.md) · [协议草案](spec/README.md) · [路线图](ROADMAP.md)

> **正在征集独立外部 reviewer：** M0 需要 distributed-systems 与 agent-safety
> 两类 verdict，其中至少一位 reviewer 来自 `fyaic` 组织之外。30–60 分钟阅读
> 路径、精确 commit、复现命令和模板都在
> [reviewer packet](docs/09-reviews/m0-external-reviewer-packet.md)；请提交到
> [issue #7](https://github.com/fyaic/threadmesh/issues/7)，每项 finding 都会公开处置。

---

> 当前状态：pre-alpha。仓库已包含最小 transport-agnostic adapter SDK、可执行
> 协议草案、SQLite coordinator 实验原型，以及 ACP、Codex App Server、Gemini
> adapter 候选；协议尚未稳定，也没有可用于生产的 adapter。

## 当前进度

仓库已有经过内部 review 的 SQLite/ACP 实验链路，并新增了可执行 JSON-RPC
binding：transport 认证身份、grant 决策、持久幂等、mailbox claim/ack、
incarnation 轮换和两类 mock harness 都有自动化测试。

当前不能把它称为跨 harness 产品能力：

- M0 的规范阻塞项已经解决，只剩 #7 的两份独立外部 review；
- 本地静态 token 认证不是生产级网络认证；
- ACP 中的 peer 内容仍通过普通 prompt surface；
- steer/interrupt 未启用；
- Kimi Code `0.38.0` 已通过真实 ACP 模型 turn：mailbox accept、context
  admission、精确 marker、session 删除和 absence 验证全部完成。
- Codex CLI `0.145.0` 已完成真实 receiver 与主动 A-to-B 案例。首次 outcome
  评分中，control 为 0、相关依赖为 1；无关条件只查询关系，没有发送或激活 B。
  目前每种条件只有一次运行，不能当作统计性产品结论。
- Gemini CLI `0.56.0` 已被选为第三种非 ACP headless harness；官方固定版本、
  registry integrity、stream-json/plan/sandbox 能力和隔离 home 清理预检通过，
  但尚未获得 provider key 授权，因此模型调用是 `not-run`。
- ACP、Codex、Gemini 已在同一个 deterministic matrix 中复用 mailbox acceptance、
  durable admission claim 和各自严格的 evidence confirmation，不再绕过 coordinator。
- 统一验证 runner 已在三种 fake product 上走通 mailbox claim、receiver acceptance、
  精确 marker、evidence、audit 与资源清理；真实模式同时要求可校验 review 记录
  和 operator acknowledgement，在 #7 前默认返回 `not-run`。

M1 已合并并关闭 milestone。当前最小 SDK 候选以
`@fyaic/threadmesh` `0.1.0-alpha.0` 暴露注册、关系范围摘要、限时 suggestion、
mailbox polling 与 receiver disposition；完整打包安装和 coordinator lifecycle
均已在本地通过，但尚未发布 npm release。Kimi 已成为第二种通过真实
ThreadMesh suggestion 的 harness，因此没有再启动 Gemini 竞争分支。外部 review
Issue #7 继续作为并行治理，不再阻塞明确标注的 maintainer experiment。详见
[项目状态](docs/10-planning/project-status.md)和
[主线计划](docs/10-planning/mainline-plan.md)，真实执行步骤见
[产品验证手册](docs/09-reviews/real-product-e2e-runbook.md)，逐项完成度见
[里程碑验收审计](docs/10-planning/acceptance-audit.md)。

## 最小 SDK

```sh
npm install github:fyaic/threadmesh
```

```js
import { createThreadMeshClient } from "@fyaic/threadmesh";
```

30 分钟接入路径见 [adapter guide](docs/06-guides/implement-an-adapter.md)，完整
HTTP transport 示例见 [minimal-harness.mjs](examples/minimal-harness.mjs)。

ThreadMesh 关注一种具体能力：Agent A 在执行过程中发现 Agent B 的任务与自己的目标存在依赖，于是主动发起通知、建议、纠偏或停止请求。

难点并不是把一段文字从 A 送到 B，而是让 agent 能够发现依赖并主动协调，同时不悄悄夺走 B 的上下文主权、不覆盖用户的新目标，也不造成跨任务消息风暴。

## 项目目标

ThreadMesh 希望把这项能力抽离成模型和 harness 无关的协议与 adapter，使 Codex、Claude Code、LangGraph、自研 agent loop 等运行时可以共享一套协调语义：

- 发现相关任务，但不默认读取完整私有上下文；
- 区分 `notify`、`suggest`、`steer`、`interrupt`；
- 对高影响行为执行权限、时效和目标版本检查；
- 让接收方明确接受、拒绝或延迟消息；
- 保存可审计的来源和因果链；
- 让用户拥有的 session 比 agent 创建的子任务受到更强保护。

## 四类协调意图

| 类型 | 默认语义 | 适用关系 |
|---|---|---|
| `notify` | 旁路信息，不直接进入当前 prompt | 任意获准任务 |
| `suggest` | 进入 mailbox，由接收方在 checkpoint 判断 | peer → peer |
| `steer` | 改变当前任务方向，需要显式授权 | parent → child |
| `interrupt` | 请求停止执行，权限最高 | 用户或监督者 → task |

## 核心立场

我们希望让“智能”体现在：发现依赖、说明理由、提出建议和协商；而不是让 agent 获得无边界改写其他 session 的权力。

详细内容请从[中文文档入口](docs/zh-CN/README.md)开始，英文规范文档是当前的 canonical source。

## License

Apache License 2.0，见 [LICENSE](LICENSE)。
