<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>让 Agent 之间自己沟通。<br>你不用再当消息中转站。</strong></p>

<p align="center">把独立的 Agent session 接到同一个本地工作空间。<br>让它们发现相关工作、分享变化、带着上下文继续。</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-%3E%3D22-3c873a.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="实验性 alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#一次不用你转述的真实协作">看真实效果</a> ·
  <a href="#开始体验">开始体验</a> ·
  <a href="#支持哪些-harness">支持的 Agent</a> ·
  <a href="docs/zh-CN/README.md">中文文档</a> ·
  <a href="README.md">English</a>
</p>

一个 Agent 改了接口，另一个还在按旧接口写客户端。
你不该再负责发现变化、切换聊天、复制粘贴，然后重新解释一遍。

**你决定哪些 session 加入，模型判断什么时候值得联系。**
ThreadMesh 提供目标发现、建议消息、持久收件箱和可携带的 checkpoint。
它不是新模型、共享聊天记录，也不是把每次交接都写死的工作流。

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="概念示意：Agent A 向 Agent B 发送来自另一任务的建议，无关工作保持安静">
  <br><sub>协作机制的概念插图，不是已发布的聊天界面或真实录屏。</sub>
</p>

## 一次不用你转述的真实协作

在保留了验证记录的 **Codex → Pi** 案例中：

1. **Pi 负责客户端。** 它检查当前接口，并自主说明依赖关系。
   初始任务结束，session 保持打开。
2. **你让 Codex 改分页。** Codex 更新接口契约，
   自己决定把相关变化发给 Pi。
3. **原来的 Pi session 自己继续了。** 它用自己的工具更新客户端，
   独立检查确认能正确获取两页 cursor 分页数据。

每个 session 只有一次普通任务输入，之后没有用户转述，也没有“给 Pi 发消息”的
任务指令。接入时启用了通用协作提示；Codex 回复了 Pi 先前自主发出的依赖说明。
这是模型选择的双向协作，不是对任意私聊的盲发现。

[查看任务提示、时间线与最终客户端 →](docs/09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass)

| 真实 Codex → Pi 场景 | 观察结果 |
|---|---|
| 接口分页变化 | **通过：** 同一个接收 session 自动续接，修改客户端并通过业务检查。 |
| 无关的内部笔记 | **通过：** Codex 读取 peer/inbox 后没有尝试发送，Pi 没有后续回合。 |
| 已确认的品牌与免费额度变化 | **质量失败：** 消息与续接成功，但最终文案遗漏了“免费方案”条件。 |

每个场景只运行一次，属于维护者实测，不是可靠性评分或独立用户采用证明。
**消息送达，不等于工作做对。**
[成功与失败的完整记录 →](docs/09-reviews/2026-09-05-workspace-awareness.md)

## 开始体验

### 不调用模型，先理解流程

需要 **Node 22+**。目前从 GitHub 安装，**尚未发布到 npm registry**。

```sh
npm install github:fyaic/threadmesh
npx threadmesh preview api
```

模拟 Agent、真实本地协调器：不需要 API key，不消耗模型额度，不读取聊天。
也可试 `preview preferences` 和 `preview quota`。预览解释流程，不证明模型主动性。

### 接入真实 session

准备一个**已有接口和客户端的可丢弃项目**。下面的命令只连接 Agent，不生成应用文件。
先安装并登录 **Codex 和 Pi**。实测 Pi 模型是 **`zai/glm-5.3`**，
需要它自己的已配置账户和可用额度。

在项目目录执行：

```sh
npx threadmesh init --workspace .threadmesh
npx threadmesh doctor
```

**终端 B — 客户端：**

```sh
npx threadmesh run pi --name client --goal "Maintain the /orders client" --wake-idle \
  -- --provider zai --model glm-5.3
```

给它正常任务：“检查客户端是否符合当前接口契约，后端变化时保持可用。”
等它完成这一轮，保持 session 打开。

**终端 A — 后端：**

```sh
npx threadmesh run codex --name backend --goal "Maintain the /orders API"
```

给它上游变更：“把契约从 `next_page` 改成 cursor 分页，保持 endpoint 和 item schema 不变。”

观察 peer 消息、**同一个 Pi session 的自动续接**和正确的文件变化，不只是一句“已收到”。
模型可能沉默，也可能做错。不同项目目录需要传同一个绝对 `--workspace` 路径。
两种语言的命令参数一致；这里的中文任务是使用示例，精确实测提示见证据记录。

[完整中文步骤、固定案例复现、静音与排错 →](docs/zh-CN/first-workspace.md)

## 支持哪些 Harness

| Harness | 接入方式 | 空闲时自动续接 |
|---|---|---|
| **Pi** | 原生扩展，四个工具与任务起始上下文 | 显式 `--wake-idle`；有忙碌保护，但不是所有输入竞争都已实测 |
| **Codex** | 本次启动的 MCP；macOS/Linux 原生任务起始 hook | 未提供；模型工作期间刷新上下文 |
| **Kimi Code** | 项目 MCP 配置，保留其他 server | 未提供 |
| **DeepSeek Harness** | 官方 `dsh` 的 Cordis MCP 插件 | 未声称支持 |
| **其他 Harness** | 标准 MCP 配置或 JavaScript SDK | 需要宿主接入 |

核验版本：Codex `0.145.0`、Pi `0.84.2`、Kimi `0.39.1`、DeepSeek
`0.1.2-rc.1`。DeepSeek 通过的是**无模型**原生工具与收发检查，真实模型主动协作
仍待配置凭证后验证。Kimi 最近一次尝试遇到周额度限制。更早的 Codex→Kimi、
Pi→Kimi 成功记录采用约束更强的 adapter 路径。

[按版本区分的支持范围与证据 →](docs/00-overview/harness-support.md)

## 日常能帮什么忙

- **“我已经跟另一个 Agent 说过了。”** 把接口变更、批准的命名或调研发现交给
  真正需要它的工作流，省掉人工转述。
- **“别把之前确认的决策丢了。”** 发布选定的约束、保存 checkpoint，
  而不是广播整段私聊。
- **“额度满了，任务才做一半。”** 把最近保存的目标、决策、约束和下一步交给
  另一家 harness。

这些是实际用法，不是所有场景都能成功的承诺。

### 从已保存的 checkpoint 继续

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

**必须先有 checkpoint**，目的地也必须有额度。保存由模型选择，不是保证执行的
自动备份。这个命令用显式上下文启动一个**新的原生 session**，不迁移完整聊天、
隐藏状态、权限或跨机器文件。真正的额度耗尽长会话恢复仍未验证。

[哪些内容能带走，哪些不能 →](docs/06-guides/portable-checkpoints.md)

## Session 仍由你掌控

加入只共享公布的目标和建议，不扫描全部私聊。读收件箱不会消耗消息，接受建议
不等于任务完成。Pi 的空闲续接需要明确开启。使用 `npx threadmesh status` 查看，
或用 `npx threadmesh mute client` 静音。

当前是**同一所有者的本地实验版**，不是多租户安全边界。它不会自动接入任意旧 tab、
唤醒所有 Agent 产品，也不保证工作一定正确。宿主原有的工具权限仍然适用。

[安全模型](docs/04-safety/threat-model.md) · [安全报告](SECURITY.md)

## 一起把它做得真正有用

下一步：保留完整业务约束、验证真实历史 session 的连续性，让独立用户顺利上手。
[当前聚焦事项](https://github.com/fyaic/threadmesh/issues/156) · [路线图](ROADMAP.md)

欢迎报告**第一个失败步骤**、沉默的 Agent、无关消息，或一次真正有用的协作。
Harness 开发者可从 [workspace/MCP 接入](docs/06-guides/first-workspace.md#kimi-and-custom-harnesses)
或 [SDK adapter 指南](docs/06-guides/implement-an-adapter.md)开始。

[报告第一次使用](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[讨论场景](https://github.com/fyaic/threadmesh/discussions) ·
[参与贡献](CONTRIBUTING.md) · [中文文档](docs/zh-CN/README.md)

如果它帮你省了一次交接，欢迎 star，让更多人发现它。[Apache 2.0](LICENSE)。
