<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>让你的不同对话主动协作。<br>你不用再当消息中转站。</strong></p>

<p align="center">可以是同一个 Agent 的不同 session，也可以来自不同产品。<br>让它们发现相关工作、分享变化、带着上下文继续。</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="实验性 alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#一次不用你转述的真实协作">看真实效果</a> ·
  <a href="#开始体验">开始体验</a> ·
  <a href="#支持哪些-harness">支持的 Agent</a> ·
  <a href="docs/zh-CN/README.md">中文文档</a> ·
  <a href="README.md">English</a>
</p>

你在一个对话里确认了决策，另一个却还在按旧版本工作。
ThreadMesh 帮相关 session 分享有用变化，省掉你再解释一次——即使它们都来自同一个产品。

**你选择协作对象，模型判断什么值得分享。**

| 反复遇到的麻烦 | ThreadMesh 提供什么 |
|---|---|
| “把变化再告诉另一个 session。” | 明确选择的协作目标和建议交接，由模型判断是否需要联系。 |
| “之前已经说好的，别忘了。” | 接收方保留自己的任务上下文，结合先前约定判断建议。 |
| “它只是收到了，还是真的做完了？” | Workspace 收件箱与处置记录，以及核验接收方实际产物的案例，不只统计送达。 |

两条使用路径：基于原生任务工具的可选 **Codex 桌面 Skill**；或包含持久收件箱、
已支持 harness 适配器和显式 checkpoint 的**本地 workspace**。
它们不是一个通用桌面连接器；Skill 路径的通信由 Codex 提供。
[我们增加什么，什么时候原生 Codex 就够用 →](docs/zh-CN/native-capabilities-and-value.md)

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="概念示意：Agent A 向 Agent B 发送来自另一任务的建议，无关工作保持安静">
  <br><sub>协作机制的概念插图，不是已发布的聊天界面或真实录屏。</sub>
</p>

## 一次不用你转述的真实协作

**A 掌握新的产品事实，B 记着你之前的网站约定。**

一次受控 Codex 桌面实测中，两个任务先完成原工作，再启用 Skill。
B 早已知道按钮名称不能改。明确配对后，只向 A 提出普通业务修改，意思是：

> 产品更名为 Member Portal，免费方案最多五个项目，使用美式拼写。
> 付费价格不变，更新批准的产品事实。

没有要求“把这条消息发给 B”。A 自行检查 B 的状态、发送相关事实，
**原来的 B 接着自己修改了网站文案。** 管理任务没有转述变化、手动续跑 B 或代写文件。

| 网站内容 | 修改前 | 修改后 |
|---|---|---|
| 品牌与拼写 | Organise work with Team Hub | Organize work with Member Portal |
| 免费额度 | 无限免费项目 | 免费方案最多 5 个项目 |
| 之前约定的按钮 | Create my workspace | **保持不变** |
| 付费价格 | $12/月 | **保持不变** |

普通业务请求到 B 完成约 **49 秒，不含设置时间**。另做对照时，B 忙碌则 A 暂缓发送；
停止协作后再修改产品，A 也没有继续发消息。
[实际消息、B 的 diff 与审计 →](docs/zh-CN/native-evidence.md)

这是一组维护者操作、保留原上下文的专用任务，不是速度保证或独立用户上手结果。
原生消息与续跑来自 Codex，Skill 提供协作规则。上表概括已核验文件，不是界面截图。
同时输入的竞争和插件热加载仍未验证。

## 开始体验

| 你现在想做什么 | 选择这条路径 |
|---|---|
| 连接已有 Codex 桌面任务 | [原生任务流程](#想连接已有的桌面任务)：不用配置 Node/MCP/hook，但需明确配对且宿主已有工具。 |
| 先跑一个自包含的真实例子 | [Codex 安装包案例](#已经在用-codex沿用你的账户)：一个终端、两个新临时任务、沿用账户和额度。 |
| 接入自己项目里的 session | [Workspace 指南](docs/zh-CN/first-workspace.md#进阶两个终端接入自己的项目)：设置更多，提供持久收件箱和已支持的 harness 接入。 |

### 想连接已有的桌面任务？

[**打开免安装配对页面 →**](https://fyaic.github.io/threadmesh/)

粘贴两个**聊天链接**，选择允许交流的话题，分别复制为它们生成的设置提示。
不用终端、安装、注册账号或手工修改长提示词。输入留在浏览器页面中，页面不读聊天、
不代发消息。Codex 的“复制聊天深链”快捷键是 macOS **⌘⌥L**、Windows **Ctrl+Alt+L**。
你仍需在两个原任务分别粘贴发送；等双方确认后正常工作。
[手动入口与限制](docs/zh-CN/codex-native-tasks.md)。

另一个真实案例：A 修改 API 约定后，原 B 自己更新客户端和测试，同时保留此前的
超时、特殊游标编码约定。[页面检查与实际 API 协作记录 →](docs/09-reviews/2026-09-08-pairing-helper-acceptance.md)

**已实测，仍属实验入口：** [公开工作流＋聊天链接实测](docs/09-reviews/2026-09-08-native-deep-link-acceptance.md)
不查全局任务列表就定位了原来的两个任务；A 主动发送，原 B 自己改对文案并保留按钮和价格。
本次由管理任务通过原生工具提供官方格式的链接；人工 GUI 上手和常规插件安装仍未验收。
Skill 不能补出缺失的宿主工具，也不能强制
保证隐私隔离或无竞争发送。如果原生 Codex 已满足需求，直接使用即可；
目前不声称比原生用法更有效。

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

与上方桌面实测分开，这个 Codex 安装包例子在默认上限内约 **273 秒**通过；
更早一次扩展时间预算的诊断约 184 秒通过。运行器在实际投递后续接自己的接收方，
不是接入已有桌面聊天。[安装包证据与保留的失败 →](docs/09-reviews/2026-09-07-codex-first-use-release.md)

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
| **Codex 桌面** | 宿主原生任务工具之上的可选 Skill | 一组受控双任务通过；Codex 提供续跑，工具可用性取决于宿主 |
| **Codex 安装包 / 项目** | `try` 使用 App Server 双 session；项目 launcher 使用限定范围的 MCP 与 hook | `try` 运行器续接自己的接收方；不是任意旧聊天接入 |
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

仅用于已经配置好的 workspace，不是 `try` 的临时样例。在该目录执行，
或显式提供 `--workspace /path/to/your/room`：

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

**必须先有 checkpoint**，目的地也必须有额度。保存由模型选择，不是保证执行的
自动备份。这个命令用显式上下文启动一个**新的原生 session**，不迁移完整聊天、
隐藏状态、权限或跨机器文件。真正的额度耗尽长会话恢复仍未验证。

[哪些内容能带走，哪些不能 →](docs/06-guides/portable-checkpoints.md)

## Session 仍由你掌控

在 workspace 路径，加入只共享公布的目标和建议，不扫描全部私聊。读收件箱不会消耗消息，接受建议
不等于任务完成。Pi 的空闲续接需要明确开启。使用 `npx threadmesh status` 查看，
或用 `npx threadmesh mute client` 静音。

当前是**同一所有者的本地实验版**，不是多租户安全边界。它不会自动接入任意旧 tab、
唤醒所有 Agent 产品，也不保证工作一定正确。宿主原有的工具权限仍然适用。
桌面 Skill 则使用 Codex 原生历史和模型遵循的规则；workspace 的收件箱与静音命令
不能控制这条独立路径。

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
