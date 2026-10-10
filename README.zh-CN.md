<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>让相关 Agent 任务共享有用的上下文。</strong><br>少一次手动转述，让各自的工作跟上变化。</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="实验性 alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#开始体验">开始体验</a> ·
  <a href="#一次不用你转述的真实协作">实测证据</a> ·
  <a href="docs/zh-CN/README.md">中文文档</a> ·
  <a href="README.md">English</a>
</p>

你在一个任务里修改 API，另一个维护客户端的任务却还在沿用旧约定。
ThreadMesh 帮你选中的任务分享这次变化，同时让接收方保留自己对话中已经确定的决策。

**你选择协作对象和允许的话题，Agent 判断哪些信息相关、如何使用。**
这些任务可以来自同一个 Agent 产品，也可以来自不同的受支持产品。

ThreadMesh 提供两条独立的使用路径：

| 路径 | 提供什么 | 当前状态 |
|---|---|---|
| **Codex 桌面 Skill** | 通过 Codex 原生任务工具，按指定范围协作的工作流指导 | 实验性插件候选版；已检查 marketplace 发现，安装与已有任务加载未验收 |
| **本地 workspace / CLI** | 持久收件箱、已支持的 harness 接入和显式保存的 checkpoint | GitHub Releases 已提供 `v0.1.0-alpha.3`；保留受控真实案例 |

Skill 没有新增消息服务。如果原生 Codex 已经满足你的工作方式，可能不需要它。
相对原生用法的增量收益尚未测量。
[ThreadMesh 增加了什么 →](docs/zh-CN/native-capabilities-and-value.md)

## 开始体验

### 想连接已有的桌面任务？

从 [Codex 插件与任务启用指南](docs/zh-CN/codex-native-tasks.md) 开始。
指南介绍候选版安装、选择协作对象、确定共享话题，以及启用允许的通信方向。
Skill 路径不需要配置 Node、MCP server 或 hook，但宿主必须提供原生任务工具。

**插件实际安装、在已有任务中加载仍未验收。** 指南将它们与 marketplace 发现、
实验性的手动工作流分别说明。下方的受控协作案例使用了从源码加载的工作流指导，
不能证明正常插件安装已经跑通。

启用后，可说“检查 ThreadMesh 状态”查看待发建议与已观察结果。
在各参与任务中分别说“停止 ThreadMesh 协作”，才能停止两个方向。
这些是 Agent 遵循的指令，不是即时控制服务，也无法撤回已经提交的消息。

### 已经在用 Codex？沿用你的账户

想先跑一个自包含例子，可以安装已发布的 **CLI 包**。需要 **Node 22+**、
已登录的受支持 Codex runtime，以及可用的模型额度。
安装包通过 GitHub Releases 分发，不在 npm registry 上：

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

它沿用现有配置，启动**两个新的临时 Codex 会话**完成文案修改例子。
运行器在消息送达后续跑自己的接收方，并核对接收方实际完成的修改；它不会接入已有桌面任务。
在 macOS 上，也可以选择受支持的桌面应用内置 runtime。

运行进度可见，**总时限为 300 秒**，失败会直接报告。
结束时停止进程，私有结果保留供检查。省略 `--live` 则只显示说明，不调用模型。
[配置、权限与排错 →](docs/zh-CN/first-workspace.md)

### 已经在用 Pi？

安装同一个 CLI 包后，显式选择 Pi：

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

它们沿用 Pi 的已有配置与额度。安装包里的 API 例子目前需要 Pi；
Codex 例子目前只支持文案场景。
[Pi 配置 →](docs/zh-CN/first-workspace.md)

### 不调用模型，先看预览

安装 CLI 包后运行：

```sh
npx threadmesh preview preferences
```

模拟 Agent 使用真实的本地 coordinator，不需要模型登录或额度。
也可以试 `preview api` 和 `preview quota`。
预览用于理解流程，不能证明 Agent 会自主协作。

如果要让自己的项目会话使用持久收件箱，见
[workspace 指南](docs/zh-CN/first-workspace.md#进阶两个终端接入自己的项目)。

## 一次不用你转述的真实协作

在一次受控 Codex 桌面案例中，A 维护产品事实，B 维护网站文案，两者已有各自任务上下文。
配对后，只向 A 提出普通业务请求：产品更名、免费方案最多五个项目、使用美式拼写。
A 自行发送相关变化，**原来的 B 随后修改了自己的文案**，并保留之前约定的按钮文字和付费价格。

[查看实际消息、接收方 diff 与审计 →](docs/zh-CN/native-evidence.md)

| 证据 | 证明了什么 | 不能证明什么 |
|---|---|---|
| [原生桌面文案案例](docs/09-reviews/2026-09-07-native-desktop-acceptance.md) | 一次原任务协作、保留先前决策，以及受控忙碌/停止检查 | 插件安装、独立用户上手或同时输入的安全性 |
| [原生 API/客户端案例](docs/09-reviews/2026-09-08-pairing-helper-acceptance.md) | 原接收方修改客户端与测试，保留超时和编码决策 | 生产部署或相对原生 Codex 的收益 |
| [已安装 Codex CLI 案例](docs/09-reviews/2026-09-07-codex-first-use-release.md) | 发布包的一次运行在默认时限内通过，早期失败记录保留 | 已有桌面任务接入或普遍成功率 |

这些案例由维护者操作。消息送达不等于成功：接收方的实际修改还必须同时满足新要求与先前约定。
[证据索引](docs/evidence/README.md) 和 [兼容记录](docs/00-overview/harness-support.md)
也保留了范围更窄的检查、失败和未验证路径。

## 支持哪些 harness

| 接入 | 入口与边界 |
|---|---|
| **Codex 桌面** | 基于原生任务工具的可选 Skill，工具是否可用取决于宿主 |
| **Codex CLI / 项目** | App Server 示例任务对；项目会话使用限定范围的 MCP 与 hook |
| **Pi** | 原生扩展；可选空闲唤醒，带忙碌回合检查 |
| **Kimi Code** | 项目 MCP 接入，不自动续跑空闲任务 |
| **DeepSeek Harness** | 已检查不调用模型的原生 MCP 接入；真实模型主动性未验证 |
| **其他 harness** | 通过 MCP 或 JavaScript SDK 接入，需要按宿主配置 |

支持范围与版本有关，各路径证据程度不同。选择前请查阅
[完整支持矩阵](docs/00-overview/harness-support.md)。

## 从保存的 checkpoint 继续

在已配置的 workspace 中，checkpoint 可以为新会话保留选定的目标、决策、约束和下一步：

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

从 workspace 目录运行，前提是已有 checkpoint，且目标 harness 有可用额度。
这是显式上下文交接，不是完整对话备份或文件迁移。
从真正耗尽额度的长任务中恢复仍未验收。
[Checkpoint 指南 →](docs/06-guides/portable-checkpoints.md)

## 你的会话仍由你控制

原生 Skill 遵循你选择的任务、话题与发送权限；收到建议不代表获得回复权限。
它不能强制保证隐私，也无法把检查空闲和随后发送变成一个原子操作；宿主权限仍然生效。

Workspace 路径分享发布的目标与建议，而非整段私有对话。
读取收件箱不会消费消息，接受建议也不代表完成工作。
它的收件箱与静音控制独立于原生 Skill。
这是**实验性的、同一所有者使用的本地系统**，不构成多租户安全边界。

[安全模型](docs/04-safety/threat-model.md) · [安全政策](SECURITY.md)

## 一起改进

欢迎反馈看不懂的配置步骤、遗漏的业务约束，或不该发送的消息。
请注明接入路径和第一个失败步骤，并去掉凭证与私有对话内容。
开发适配器可从 [SDK 指南](docs/06-guides/implement-an-adapter.md) 开始。

当前维护重点是清晰的安装指引和准确的能力描述。真实项目验证暂缓；
安装、独立用户首用和相对原生用法的收益验证仍然开放，没有标记通过。
[当前状态](docs/10-planning/project-status.md) · [路线图](ROADMAP.md)

[反馈使用体验](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[讨论使用场景](https://github.com/fyaic/threadmesh/discussions) ·
[参与贡献](CONTRIBUTING.md) · [中文文档](docs/zh-CN/README.md)

[Apache 2.0](LICENSE)。
