# Codex 主动跨任务协调：调研摘要

> 调研快照：2026-08-20。完整证据、源码链接和竞品分析以英文研究文档为准。

## 核心结论

你感受到的“agent 自发去调用另一个 session”确实包含模型主动性，但不是 A
和 B 在底层自动共享意识，也不是模型凭空知道另一个 session。

更准确的结构是：

```text
Harness 告诉模型：你可以主动协调，并提供相关工具
                       ↓
模型在当前任务中判断：B 可能影响我，值得联系
                       ↓
模型主动选择 list/read/send/wait 等工具
                       ↓
确定性的运行时完成寻址、持久化、唤醒、注入、审计
```

所以“智慧感”来自两部分的叠加：

- 模型能发现未预先写进 DAG 的关系，并决定何时联络；
- Harness 把另一个有独立历史、目标和工作区的任务变成可寻址、可交互的对象。

这是一种 **tool-conditioned agency（由工具和策略赋形的主动性）**。

## Codex 是怎么做出主动行为的

开源 Codex Multi-Agent V2 中存在明确的 `Proactive` 与
`ExplicitRequestOnly` 模式。当前源码里，在没有额外覆盖时，`ultra` reasoning
会进入主动模式；运行时再把一条 developer 级指令放进模型上下文，允许模型在并行
工作能显著提高速度或质量时主动委派。

与此同时，工具说明把行为分得很细：

- `send_message`：消息进入目标 mailbox，但不启动新 turn；
- `followup_task`：目标空闲时唤醒并启动 turn，运行中则在消息边界投递；
- `wait_agent`：等待 mailbox 或结束状态；
- `interrupt_agent`：停止当前 turn，但保留 agent 身份。

模型不是被某个固定工作流命令“现在去找 B”，而是在看到这些能力和策略后自己选择
调用。这就是它显得主动的直接原因。

## 必须区分两套能力

### 1. 开源的 parent/subagent tree

这一层源码相对完整：root 和 child 共享一个 scoped registry、mailbox、调度器和
turn lineage。目标主要是同一棵 agent tree 里的已知 agent，不是任意用户 session。

### 2. Codex Desktop 的 durable peer task

截图属于这一层：一个已经存在的主任务给另一个已经存在的主任务发消息，并显示“由
ChatGPT 从另一项任务发送”。OpenAI 仓库的
[`#14923`](https://github.com/openai/codex/issues/14923) 有非常完整的需求、社区讨论
和交付确认；OpenAI contributor 在 2026-08-04 表示 persistent
list/read/send/fork/archive 和 cross-thread messaging 已交付。

但 `send_message_to_thread` 等 Desktop 产品工具的具体实现并未以同名代码完整出现在
开源仓库。因此可以确认功能和底层 building blocks，不能武断声称 Desktop 内部一定
复用了某一段 subagent 代码。

## 底层最重要的工程原理

### 模型策略和硬约束分离

Prompt 决定模型“倾向于何时主动”；权限、预算、频率、目标范围必须由代码强制执行。

### Durable mailbox 和 wake 分离

消息应先可靠落到收件箱。唤醒只是一条可能丢失或重复的通知；丢掉唤醒不能丢掉消息。

### Delivery 和 context injection 分离

收到消息不等于让它进入下一次模型输入。目标任务应拥有是否把内容放入上下文的最终
权力。

### Notify、wake、steer、interrupt 分离

它们对用户和任务的干扰程度完全不同，不能都压成一个 `send`。

### Freshness / optimistic concurrency

Codex `turn/steer` 要求 `expectedTurnId`，防止把原本针对旧 turn 的指令注入新工作。
跨 harness 方案也需要 task incarnation、run ID、objective revision 等 freshness
token。

### Provenance 和 authority 分离

知道“谁发的”不等于“他说的是真的”，更不等于“他有权批准目标执行”。社区提出的
关键公式是：

```text
消息已送达 ≠ 陈述已验证 ≠ 状态已接受 ≠ 动作已授权
```

## 社区已经讨论到什么程度

社区关注点和你提出的负面作用几乎完全一致：

- [`#30499`](https://github.com/openai/codex/issues/30499)：希望有明确的非打断排队模式；
- [`#34933`](https://github.com/openai/codex/issues/34933)：跨任务 follow-up 可能让目标中途转向；
- [`#35516`](https://github.com/openai/codex/issues/35516)：要求逐条同意、mute、quiet coordinator 和审计；
- [`#36843`](https://github.com/openai/codex/issues/36843)：提出 typed、evidence-aware 的跨任务事件；
- [`#37995`](https://github.com/openai/codex/issues/37995)：普通文本不能代替结构化 `request_user_input`；
- [`#31178`](https://github.com/openai/codex/issues/31178)：晚到的 subagent 结果可能没有可靠唤醒 parent；
- [`#33551`](https://github.com/openai/codex/issues/33551)：OpenAI-specific message item 在外部 provider 上不兼容。

这说明产品真正困难的地方已经不是“能不能发消息”，而是“消息能不能安全、可控、
可验证、可移植地影响另一个任务”。

## 有没有类似项目

有，而且已经形成几类：

- **协议层：** A2A、AAMP、ANP、ACP；
- **安全传输层：** AGNTCY SLIM；
- **本地 agent mailbox：** MCP Agent Mail、Aerial、agent-inbox；
- **跨 harness session mesh：** Repowire、MAGI；
- **框架内部编排：** OpenAI Agents SDK、AutoGen、LangGraph；
- **持久 agent workspace：** AIPass。

最接近 ThreadMesh 的是 Repowire、MCP Agent Mail、AAMP 和 Aerial，但各自仍有空缺：

- Repowire 很接近跨 harness 控制面，但没有突出形式化的 receiver context sovereignty；
- MCP Agent Mail 的 inbox/audit/file lease 很成熟，但其 license 有非标准 rider，不能直接
  把实现搬入 Apache-2.0 项目；
- AAMP 对异步任务意图和 sender policy 很强，但不直接规定 live harness 的 prompt
  注入边界；
- Aerial 对 durable mailbox 与 wake 分离做得干净，但 authority 语义较轻；
- A2A 适合作为远程 agent 互操作底座，但不负责本地 session 是否应被唤醒或转向。

## ThreadMesh 真正应该占据的位置

ThreadMesh 不应该再造一个 agent framework、工作流引擎或消息队列。更有价值的定位是：

> 面向已经运行中的 agent task，提供 vendor-neutral 的主动协调安全与互操作层。

核心标准化五个彼此独立的状态：

```text
已发送
→ 已持久接收
→ 已通知/唤醒
→ 已进入模型上下文
→ 已接受并实际执行请求
```

再用 adapters 把这套语义映射到 Codex、Claude Code、OpenAI Agents SDK、AutoGen 或
自定义 harness。

## 推荐实施顺序

调研后的第一轮 SQLite/ACP 实验已经完成。当前主线调整为：

1. summary、relationship、reason code 和 capability coherence 已完成；
2. authenticated principal、effective grant 与 JSON-RPC task/mailbox binding 已完成；
3. admission claim、durable receipt 和 `outcome-unknown` reconciliation 已固化；
4. typed interruption result 与签名 verification attestation 已完成；
5. M1 的 storage、expiry、policy、dispatcher、event/inspector、双 mock matrix
   与 retention purge 已形成七层 stacked Draft PR，81 个单元测试全部通过；
6. Codex App Server adapter 候选已完成 deterministic JSONL matrix，并对本机
   CLI `0.145.0` 完成无模型真实预检；空 thread 在首个 turn 前不会形成可恢复
   rollout，这一限制已进入证据文档；
7. 当前仍等待两份 independent review；随后顺序合并 M1、在 `main` 重验，
   再运行 Codex/Kimi/第三种 harness 的真实模型 A-to-B 场景和干扰评估。

详见[当前项目状态](../10-planning/project-status.md)与
[主线计划](../10-planning/mainline-plan.md)。

## 完整文档

- [Codex 深度拆解](../07-research/codex-orchestration-deep-dive.md)
- [社区讨论证据](../07-research/community-signals.md)
- [相似项目与协议版图](../07-research/ecosystem-landscape.md)
- [调研综合与项目方向](../07-research/research-synthesis.md)
- [当前项目状态](../10-planning/project-status.md)
- [后续主线计划](../10-planning/mainline-plan.md)
- [Codex App Server 真实预检证据](../09-reviews/2026-08-20-codex-app-server-preflight.md)
