<p align="center">
  <img src="docs/assets/threadmesh-hero.svg" width="100%" alt="ThreadMesh — Agent session 之间的选择性主动协作">
</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="package.json"><img alt="Node 22 or newer" src="https://img.shields.io/badge/node-%3E%3D22-3c873a.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Pre-alpha status" src="https://img.shields.io/badge/status-pre--alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#快速开始"><strong>快速开始</strong></a> ·
  <a href="docs/06-guides/real-world-cases.md">真实案例</a> ·
  <a href="docs/00-overview/harness-support.md">Harness 支持</a> ·
  <a href="docs/zh-CN/README.md">中文文档</a> ·
  <a href="README.md">English</a>
</p>

# ThreadMesh

ThreadMesh 是一个实验性的 Agent 协调协议与 JavaScript 接入工具包。它让一个
Agent session 在执行过程中发现经过授权的跨任务依赖，自主判断是否联系另一个
session，并发送一条受约束的建议；同时不共享全局聊天记录，也不夺走接收方的
上下文控制权。

**Agent 提供主动性，ThreadMesh 提供边界。**

> [!IMPORTANT]
> ThreadMesh 目前是 pre-alpha，主动能力默认关闭。现阶段适合本地、可信进程范围
> 的实验，不应作为生产级授权、多租户隔离或处理恶意 peer prompt 的安全边界。

## 为什么需要它

当多个 Agent 并行工作时，用户往往被迫充当“人工消息总线”：发现 A 的结果正好是
B 缺少的输入，从 A 复制内容，找到正确的 B session，再解释这条信息为什么重要。

ThreadMesh 把这个过程抽象成一项可移植能力：

1. host 为精确的任务实例建立有方向的授权关系；
2. B 只发布关系范围内的最小摘要，而不是完整私有历史；
3. A 查看摘要后，**自主判断**这次是否值得联系；
4. A 最多发送一条带来源、理由和时效的 `suggest`；
5. B 的 harness 在 checkpoint 接受、拒绝或延迟，再决定是否进入模型上下文；
6. 完整的决策、投递与清理链路可审计。

这里的“智能”不只是 Agent 会发消息，而是**有选择的主动性**：依赖确实存在时
主动联系，无关时保持安静，并尊重另一个 session 的自主权。

## 已验证的主动性效果

真实 Pi 行为验证只给 Agent A 两个有预算的 ThreadMesh 工具，并比较三种条件：

| 条件 | Agent A 的自主选择 | 对 B 的影响 |
|---|---|---|
| 存在相关依赖 | 发现一次 → 建议一次 | B 接受并完成 |
| 任务无关 | 发现一次 → 不发送 | B 没有被激活 |
| 无相关任务（control） | 不调用 ThreadMesh | 零干扰 |

同一个 relevant 路径随后完成真实跨产品闭环：**Pi `0.84.2` → ThreadMesh →
Kimi Code `0.38.0`**。Pi 主动选择联系 B，Kimi 保留自己的持久 session 和接收
边界，coordinator 记录 `context-admitted`，所有临时资源最终清理完成。另一组真实
**Codex CLI `0.145.0` → Kimi Code `0.38.0`** 案例也出现了相同的
`发现 → 建议` 自主工具序列。

[查看真实案例总览](docs/06-guides/real-world-cases.md) ·
[复现 Pi→Kimi 案例](docs/06-guides/pi-to-kimi-demo.md) ·
[查看有边界的验证记录](docs/09-reviews/2026-08-25-pi-integration-kit-validation.md)

## 快速开始

### 1. 运行闭环 attention-router 演示

```sh
npx --yes --package=github:fyaic/threadmesh threadmesh demo
```

也可以从源码运行：

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
npm run demo
```

这个确定性案例会创建四个隔离 session，并执行“实现 → 评审 → 修复 → 再评审 →
解锁下游任务”的完整链路。输出会分别展示事件、路由理由、接收方决定、外部验证、
依赖效果与清理状态；它不消耗模型额度，也不触碰你的真实 Agent session。

[查看 attention-router 演示指南](docs/06-guides/attention-router-demo.md)

再运行早期的 control/relevant/irrelevant 模型选择对照：

```sh
npm run validate:behavior:fake
```

再运行最小跨 harness 证明：

```sh
npm run validate:cross-harness:fake
```

### 2. 接入自己的 harness

SDK 尚未发布到 npm registry，请直接从 GitHub 安装 pre-alpha 版本：

```sh
npm install github:fyaic/threadmesh
```

把 SDK 连接到已认证的 ThreadMesh JSON-RPC transport，并为每个模型 turn 创建一
个主动工具 bridge：

```js
import {
  createProactiveToolBridge,
  createThreadMeshClient,
} from "@fyaic/threadmesh";

const client = createThreadMeshClient({
  authorization: `Bearer ${process.env.THREADMESH_TOKEN}`,
  send: async (request, { authorization }) => {
    const response = await fetch(process.env.THREADMESH_URL, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});

const bridge = createProactiveToolBridge({
  client,
  source: currentTask,
  relationships: [{ relationshipId, target: relatedTask }],
});

await harness.runModelTurn({
  tools: bridge.tools,
  onToolCall: bridge.handleToolCall,
});
```

关系集合由 host 而不是模型决定。模型必须先发现才能发送；默认每个 turn 只允许
一次查询和一次建议；接收方 harness 仍然掌握 context admission。

[30 分钟接入指南](docs/06-guides/implement-an-adapter.md) ·
[完整 sender/receiver 示例](examples/proactive-tool-bridge.mjs)

## 有什么能力

| 能力 | 当前实现 |
|---|---|
| 关系范围发现 | 只读取 host 授权关系中的最小任务摘要 |
| 有预算的主动建议 | 两个模型工具，每 turn 限制发现和发送次数 |
| 接收方主权 | mailbox checkpoint，明确接受、拒绝或延迟 |
| 时效与防重放 | 精确任务实例、过期、revision、幂等和 claim 检查 |
| 来源与审计 | 记录 sender、关系、理由、处置、admission 和清理证据 |
| Harness 可移植性 | transport-neutral SDK，以及 ACP/App Server/subprocess 实验 adapter |
| 失败关闭 | 不把不支持的 `steer`/`interrupt` 冒充成成功 |

协议草案区分 `notify`、`suggest`、`steer`、`interrupt` 四类意图；目前真实产品
实验只启用有边界的 `suggest`。

## 已接入与可接入的 Agent harness

| Harness / 接入方式 | 已验证角色 | 证据级别 |
|---|---|---|
| Pi `0.84.2` extension | 通过公开 SDK 主动发送 | 真实模型通过 |
| Codex CLI `0.145.0` App Server | 主动 sender 与 receiver | 真实模型通过 |
| Kimi Code `0.38.0` ACP | 持久接收 session | 真实模型通过 |
| Gemini CLI `0.56.0` headless | subprocess receiver adapter | 确定性 + 无模型预检；真实模型未运行 |
| 自研 JavaScript harness | cooperative loop / native tool bridge | 打包消费与 conformance 通过 |
| 通用 ACP Agent | 持久 session receiver | 确定性 conformance；Kimi 是真实 ACP 证明 |

Claude Code、LangGraph、CrewAI、OpenAI Agents SDK 等可以成为 adapter 目标，
但在公开版本范围、capability、conformance 和已知缺口前，项目不会声称已验证兼容。

[完整兼容矩阵](docs/00-overview/harness-support.md) ·
[实现 adapter](docs/06-guides/implement-an-adapter.md)

## 安全边界

ThreadMesh 的核心规则是：**每个任务拥有自己的目标和模型可见历史。**

- 不搜索全局 session，不共享完整 transcript；
- 精确、有方向、最小权限的关系授权；
- peer 内容先进入 mailbox，再由 receiver 判断；
- consequential request 必须检查时效、任务实例和目标版本；
- 保留 peer 来源与理由，不伪装成用户指令；
- capability 不满足时失败关闭，完整因果链可审计。

当前 adapter 仍通过普通 prompt surface 投递已接受的 peer context，也不提供 OS
sandbox。不要用它处理任意恶意 peer 内容或充当生产安全边界。

[上下文主权](docs/01-concepts/context-sovereignty.md) ·
[权限模型](docs/04-safety/permission-model.md) ·
[威胁模型](docs/04-safety/threat-model.md) ·
[安全策略](SECURITY.md)

## 项目状态

- 协议：可执行 `0.0-draft`，仍可能调整。
- 包：`@fyaic/threadmesh@0.1.0-alpha.0`，可从 GitHub 安装；根 export 是精简 SDK，CLI 与显式 runtime subpath 会安装 Ajv 和原生 `better-sqlite3`。
- 参考 runtime：authenticated JSON-RPC + SQLite coordinator，面向本地可信进程实验。
- 验证：228 项 unit/subtest，加 schema、状态转换、文档与链接检查；已记录 Pi、Codex、Kimi 真实证据。
- 默认策略：除非 maintainer 明确选择有边界实验 profile，否则主动协调保持关闭。
- 下一主线：让可信最终证据链原子触发依赖满足，把 durable turn/cursor 基础接入持久 Codex 角色，运行真实实现/评审/修复案例并与人工基线比较，再把其中一个角色迁移到 ACP。

[当前状态](docs/10-planning/project-status.md) · [路线图](ROADMAP.md) ·
[协议草案](spec/README.md) · [验证记录](docs/09-reviews/README.md)

## 文档与社区

- [中文文档入口](docs/zh-CN/README.md)
- [英文文档总览](docs/README.md)
- [产品说明](docs/00-overview/product-guide.md)
- [真实 Agent 案例](docs/06-guides/real-world-cases.md)
- [贡献指南](CONTRIBUTING.md)
- [GitHub Discussions](https://github.com/fyaic/threadmesh/discussions)
- [GitHub Issues](https://github.com/fyaic/threadmesh/issues)

ThreadMesh 采用 [Apache License 2.0](LICENSE)。
