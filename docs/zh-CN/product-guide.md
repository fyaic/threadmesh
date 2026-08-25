# ThreadMesh 是什么

ThreadMesh 是一个面向独立 Agent 任务的权限化协调层。它让 Agent A 在执行中发现
Agent B 与当前目标存在关系，向 B 提供一条受约束、可过期、带来源的建议；是否把
这条建议放进 B 的模型上下文，由 B 所属的 harness 决定。

它不是共享聊天记录、全局记忆或远程控制系统，也不会赋予 A 任意改写 B session
的权限。

## 一个具体案例

- Agent A 构建完成一个 artifact，并得到校验过的 checksum。
- Agent B 正在生成 release manifest，没有 checksum 就无法完成。
- B 只公开“正在等待 artifact checksum”这一最小摘要，不公开完整对话。
- A 发现摘要后，自主判断这条结果有用，并发送一次 `suggest`。
- 消息先进入 B 的 mailbox；B 的 harness 在 checkpoint 接受后，才把带来源信息的
  内容放入 B 的上下文。
- 如果相关任务只负责排版，A 应只查看摘要而不发送；如果是 control，A 不应调用
  任何 ThreadMesh 工具。

ThreadMesh 要验证的不只是“消息能送到”，而是：相关信息确实改善结果，同时无关
任务不被打扰。

## 它位于哪一层

```text
Codex / Kimi Code / Gemini CLI / 自研 agent loop
                        │ adapter
                        ▼
ThreadMesh：关系、权限、mailbox、来源、时效、审计
                        │
              JSON-RPC / SQLite / 宿主部署
```

MCP 主要给 Agent 提供工具；workflow engine 调度预先知道的步骤；ThreadMesh 关注
的是另一件事：当 Agent 自己意识到“另一个任务现在相关”时，如何在不夺取对方上下文
主权的前提下安全协调。

## 当前能做什么

- 最小 SDK 已提供 task 注册、关系摘要发现、suggestion 发送、mailbox polling 和
  receiver disposition。
- SQLite coordinator 与 authenticated JSON-RPC reference 已可执行。
- control / relevant / irrelevant 三条件的确定性端到端演示已通过。
- Codex 的两阶段主动策略已经通过 relevant 3/3，并在 control 和 irrelevant 中保持
  零发送；pre-alpha 阶段仍只允许显式 opt-in。
- Kimi Code 已通过真实 receiver-accepted suggestion 和 session 删除验证。
- Codex A → Kimi Code B 的真实跨 harness 主动案例已经通过：A 自主发现并发送，
  B 的持久 ACP session 接受后完成，双方资源均清理且 B absence 已验证。
- Gemini adapter 与无模型预检已完成，尚未授权真实 provider 调用。

这仍是 pre-alpha 实验，不应直接用于不受信 peer 内容、多租户生产环境或自动修改
其他用户 session。

## 从哪里开始

1. 运行[端到端案例](../06-guides/end-to-end-demo.md)。
2. 阅读[上下文主权](../01-concepts/context-sovereignty.md)。
3. 按[30 分钟 adapter 指南](../06-guides/implement-an-adapter.md)接入自己的 harness。
4. 使用前核对[当前项目状态](../10-planning/project-status.md)。
