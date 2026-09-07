<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>让你的不同对话主动协作。<br>你不用再当消息中转站。</strong></p>

<p align="center">可以是同一个 Agent 的不同 session，也可以来自不同产品。<br>让它们发现相关工作、分享变化、带着上下文继续。</p>

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

一个对话改了接口，另一个还在按旧接口写客户端。
你不该再负责发现变化、切换聊天、复制粘贴，然后重新解释一遍。
不必换两种产品：同一个 Agent 的两个 session 就能协作。

**你决定哪些 session 加入，模型判断什么时候值得联系。**
ThreadMesh 提供目标发现、建议消息、持久收件箱和可携带的 checkpoint。
它不是新模型、共享聊天记录，也不是把每次交接都写死的工作流。

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="概念示意：Agent A 向 Agent B 发送来自另一任务的建议，无关工作保持安静">
  <br><sub>协作机制的概念插图，不是已发布的聊天界面或真实录屏。</sub>
</p>

## 一次不用你转述的真实协作

**两个 Codex session：一个记着你之前的约定，另一个修改产品事实。你不用转述变化。**

在安装包真实运行中，网站 session 先自主说明了依赖，品牌 session 随后自行决定发送相关变化。
实际收到消息后，运行器续接**同一个原生网站 session**，由它自己的模型修改注册页文案。

| 网站内容 | 修改前 | 修改后 |
|---|---|---|
| 品牌与拼写 | Organise work with Team Hub | Organize work with Member Portal |
| 免费额度 | 无限免费项目 | 免费方案最多 5 个项目 |
| 之前约定的按钮 | Create my workspace | **保持不变** |
| 付费价格 | $12/月 | **保持不变** |

上表是已验收文件的紧凑摘要，不是界面截图。每个模型收到普通业务任务和通用协作提示，
没有在任务里指定接收者或要求必须发消息。验收检查接收方自己修改文件、完整业务含义，
以及此前约定是否保留。

安装包上保留了两次维护者通过记录：默认 300 秒上限内约 **273 秒**完成；
较早一次扩展时间预算的诊断约 **184 秒**完成。两次都没有改用其他模型或账户。
这是两次观察，不是可靠性统计，也不保证固定时间成功。
[真实任务、文件与时间线 →](docs/09-reviews/2026-09-07-codex-first-use-release.md)

**边界明确：** 这里是两个新的临时 Codex session，由运行器在实际投递后触发续接；
不是原生桌面后台唤醒，也不是接入已有聊天。
此前的 [Codex 连接失败](docs/09-reviews/2026-09-07-codex-first-use-candidate.md)
和[跨产品业务失败](docs/09-reviews/2026-09-05-workspace-awareness.md)继续保留。
消息送达仍然不等于工作做对。

## 开始体验

### 已经在用 Codex？沿用你的账户

需要 **Node 22+**，以及已经登录、可以正常使用的 Codex。
安装 GitHub Release 中固定的 **v0.1.0-alpha.3** 安装包，尚未发布到 npm registry：

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

默认运行 **Codex → Codex 文案案例**。不用另装 Pi、购买第二家订阅、改 API key，
不用自编 harness、准备测试项目或打开两个终端。沿用 Codex 已有配置，消耗正常额度。
macOS 下可以自动选择比 PATH 版本更新的桌面自带运行时，不一定需要单独安装 CLI。

安装进度和运行阶段可见。原生依赖编译、网络和模型表现都会影响耗时。
真实运行总上限是 **300 秒**；未完成或做错都会报告失败，不换成模拟成功。
不带 `--live` 只显示说明，不调用模型。结束后停止进程，私有结果保留供检查。
[权限、结果和失败处理 →](docs/zh-CN/first-workspace.md)

### 想连接已有的桌面任务？

另有[实验性无终端工作流](docs/zh-CN/codex-native-tasks.md)，通过 skill 使用 Codex
已经提供的原生任务工具；这条路径不用配置 Node、MCP 或 hook。
**它尚未通过原生桌面接入验收。** Skill 不能补出宿主缺失的工具，也不能强制保证
隐私边界或消除用户正在输入的竞争。它与上面的新 session 实测是两条不同路径。

### 已经在用 Pi？

沿用现有配置，明确选择 Pi 即可：

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

接口分页案例当前需用 Pi，Codex 首次体验只支持文案。两条路径都不依赖另一家产品。
[Pi 配置和限制](docs/zh-CN/first-workspace.md#可选pi-案例)。

### 不调用模型，先理解流程

```sh
npx threadmesh preview preferences
```

模拟 Agent、真实本地协调器：不需要 API key，不消耗模型额度，不读取聊天。
也可试 `preview api` 和 `preview quota`。预览解释流程，不证明模型主动性。
要连接自己的项目，可再看[进阶双终端接入](docs/zh-CN/first-workspace.md#进阶两个终端接入自己的项目)。

## 支持哪些 Harness

| Harness | 接入方式 | 空闲时自动续接 |
|---|---|---|
| **Codex** | `try` 使用原生 App Server 双 session；项目 launcher 使用限定范围的 MCP 与 hook | `try` 在投递后由运行器续接自身空闲接收方；不是通用原生空闲唤醒 |
| **Pi** | 原生扩展，四个工具与任务起始上下文 | 显式 `--wake-idle`；有忙碌保护，但不是所有输入竞争都已实测 |
| **Kimi Code** | 项目 MCP 配置，保留其他 server | 未提供 |
| **DeepSeek Harness** | 官方 `dsh` 的 Cordis MCP 插件 | 未声称支持 |
| **其他 Harness** | 标准 MCP 配置或 JavaScript SDK | 需要宿主接入 |

核验版本：新双 session 案例使用 Codex `0.153.1`，此前项目 launcher 使用 `0.145.0`；
Pi `0.84.2`、Kimi `0.39.1`、DeepSeek `0.1.2-rc.1`。
DeepSeek 通过的是**无模型**原生工具与收发检查，真实模型主动协作
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

下一步：先让同一产品的多 session 协作容易上手，保留完整业务约束，
验证真实历史 session 的连续性与独立用户体验。
[当前聚焦事项](https://github.com/fyaic/threadmesh/issues/156) · [路线图](ROADMAP.md)

欢迎报告**第一个失败步骤**、沉默的 Agent、无关消息，或一次真正有用的协作。
Harness 开发者可从 [workspace/MCP 接入](docs/06-guides/first-workspace.md#kimi-and-custom-harnesses)
或 [SDK adapter 指南](docs/06-guides/implement-an-adapter.md)开始。

[报告第一次使用](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[讨论场景](https://github.com/fyaic/threadmesh/discussions) ·
[参与贡献](CONTRIBUTING.md) · [中文文档](docs/zh-CN/README.md)

如果它帮你省了一次交接，欢迎 star，让更多人发现它。[Apache 2.0](LICENSE)。
