# 第一次真实协作

[English](../06-guides/first-workspace.md) · [返回中文首页](../../README.zh-CN.md)

目标：先让**同一个 Pi 产品的两个独立 session**处理各自的普通任务，观察是否出现
无需人工转述的消息与同 session 续接。只需配置一个 harness 账户，不需要两家产品订阅；
各 session 保留独立上下文，交换选定的建议，不合并完整聊天。
这是面向开发者的 CLI 接入，不会自动扫描、接管或接入已有 GUI 私聊。

## 先准备好

- Node 22+；当前真实产品记录来自 macOS，Windows 尚未完整验证。
- 安装 Pi，配置一个正常可用、有额度的模型账户。
- 新的 `try` 入口沿用 Pi 当前配置；历史案例实测使用 Pi `0.84.2` 的 `zai/glm-5.3`。
- 不用准备应用文件、clone 仓库或开两个终端；下面的真实体验会自动准备案例。

ThreadMesh 不提供模型账户、API key 或额度。两个 session 都消耗同一账户的正常额度。
换模型或产品版本需要各自验证，不保证同样表现。

## 一条命令体验真实协作

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.2/fyaic-threadmesh-0.1.0-alpha.2.tgz
npx threadmesh try preferences --live
```

这里安装 GitHub Release 中固定的 **v0.1.0-alpha.2** 安装包，尚未发布到 npm registry。
预先打包的文件省去 npm 准备 Git checkout 的步骤，参数会显示安装进度和安装脚本输出。
原生依赖仍可能需要编译，安装时长取决于环境，不保证固定耗时。
旧的 `v0.1.0-alpha.1` 标签不包含 `try`。不带 `--live` 只显示说明与额度提醒，**不调用模型**。
默认场景是 `preferences`，因此 `npx threadmesh try --live` 等价。

带上 `--live` 后，会准备临时案例文件，沿用 Pi 已配置的模型，
启动**两个新的独立 session**：

1. 接收方先维护注册页文案，保留此前“按钮名称不要变”的约定。它完成第一轮，session 保持打开。
2. 源 session 收到修改品牌与免费方案额度的普通任务。工具和通用协作提示可用，
   但任务没有指定接收对象，也没有要求它必须发消息。
3. 如果模型决定联系相关 session，原接收方可以继续任务并自己改文案。
   验收检查文件修改、完整业务含义和此前约定，不只看收件回执。

结果会报告通过或失败。**沉默、provider 错误和业务错误都不是成功**，
也不会在真实模型失败后替换成模拟成功。这证明的是本次新 session 的上下文续接，
**不是接入你已有的桌面聊天**。

想看接口分页变化，可运行 `npx threadmesh try api --live`。
只有需要覆盖 Pi 当前配置时，才传 provider/model：

```sh
npx threadmesh try preferences --live --provider zai --model glm-5.3
```

这个覆盖示例需要自己的 ZAI 配置和额度，并不是要求已有可用 Pi 模型的用户再买订阅。
不同模型可能表现不同或保持沉默。每次真实运行都会消耗正常额度；能找到可执行程序、
检测到版本，不证明已登录、有额度或能成功协作。

### 查看结果和停止

命令会打印临时结果目录，保留报告、案例文件和原始模型记录；其中可能有模型输出与
原生标识，请留作私有。运行结束后停止本次案例的进程，Ctrl-C 也会停止它们，
但结果目录保留供你检查。

Pi 仍有正常的本地工具权限，**临时目录不是操作系统沙箱**。只在信任的 harness
和模型上运行。命令不会接入、修改或读取你已有的私聊 session。

遇到登录或额度错误，在 Pi 自己的配置中处理，或选择另一项已有配置且有额度的 provider。
ThreadMesh 不提供凭证、不绕过额度，也不建议对耗尽的额度反复重试。
模型沉默或业务错误时，保留失败记录，只分享审查脱敏后的首个失败步骤。

## 先看不消耗额度的预览

```sh
npx threadmesh preview preferences
```

预览经过真实本地协调器，但 Agent 是模拟的，不证明模型主动性。
也可以试 `preview api` 和 `preview quota`。预览与真实 `try --live` 是分开的入口。

## 进阶：两个终端接入自己的项目

此时才需要已有 API 契约和客户端的可丢弃项目；`run` 连接 Agent，不生成应用文件。

在项目目录执行一次：

```sh
npx threadmesh init --workspace .threadmesh
npx threadmesh doctor
```

`doctor` 检查安装及版本，不证明已登录、还有额度或模型会主动协作。

**终端 B：启动 Pi 客户端工作流。**

```sh
npx threadmesh run pi --workspace .threadmesh --name client \
  --goal "Maintain the /orders client" --wake-idle \
  -- --provider zai --model glm-5.3
```

正常布置任务：“检查客户端是否符合当前 API 契约，保持现有导出接口；后端变化时
保持可用。”等它完成初始回合，保持终端打开。

**终端 A：启动另一个独立 Pi 后端工作流。**

```sh
npx threadmesh run pi --workspace .threadmesh --name backend \
  --goal "Maintain the /orders API" -- --provider zai --model glm-5.3
```

布置上游任务：“把契约从 next_page 改成 cursor 分页，保持 endpoint 和 item schema
不变。”这是使用示例；精确实测英文任务保留在[Pi 双 session 验证记录](../09-reviews/2026-09-05-first-use-validation.md#the-actual-initiative-case)。

不需要追加“请给 Pi 发消息”。观察是否出现消息、同一个 Pi 的自动续接和正确文件
变化。模型可能沉默、拒绝建议或做错；不能仅凭“已收到”判断成功。

不同目录需要传同一个**绝对** `--workspace` 路径。每个并发 session 使用不同名字。
工作流名字不是自动发现的原生聊天 ID；`run` 也不等于接入任意旧 tab。

## 固定案例复现

维护者需要复现历史验证时，可从仓库运行以下脚本；首次体验请用上方安装包中的
`threadmesh try api --live`，不用 clone 仓库：

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
node scripts/validate-workspace-live.mjs pi api
```

这会在临时目录生成契约、客户端与工作空间，给两个真实 session 各一次普通任务，
并检查发送、同原生 session 续接、接收方自己改文件及最终分页行为。
需要上方的账户和模型配置，**会消耗正常模型额度**；历史通过不保证这次通过。

脚本输出测试目录和 `report.json`。保留的 Pi 双 session API 案例通过；客户端曾先自主
说明依赖，所以成功例是双向自主协作，不是无先行消息的盲发现。首次体验不需要另装 Codex。

原始事件可能含模型输出与原生标识，请保留为私有。要分享时，先审查
`node scripts/project-first-use-evidence.mjs PATH` 的精简投影。验证脚本只随源码提供，
不是安装包中的用户命令；新的 `try` 用户入口不依赖这些仓库脚本。

## 加入到底授权了什么

加入同一所有者的本地房间，共享公布的目标和非权威建议，不共享全部聊天。
Pi 的 `--wake-idle` 是明确的空闲续接选择；有忙碌与待处理输入保护，
但真实忙碌输入竞争还未完整验收。接收方始终需要判断建议；接受不等于业务完成。
这不是恶意进程或多租户环境的安全隔离。

## 可选后续：Codex → Pi

Pi 双 session 跑通后，若想尝试不同 harness，另行安装并登录 Codex。
先结束终端 A 的 Pi，再静音旧工作流，使用新名字启动：`backend` 已绑定 Pi，
不能原名换成 Codex。

```sh
npx threadmesh mute backend --workspace .threadmesh
npx threadmesh run codex --workspace .threadmesh --name backend-codex \
  --goal "Maintain the /orders API"
```

仓库固定案例命令为 `node scripts/validate-workspace-live.mjs codex api`。
[该路径的保留记录](../09-reviews/2026-09-05-workspace-awareness.md)是 API 通过；
另两例 `codex preferences` 文案业务完整性失败、`codex api-no-contact` 无关修改保持安静。
它们是可选后续，不是首个 Pi 双 session 体验的前置条件。

Codex 本次启动只预批准四个本地 ThreadMesh 工具，不改变 shell、文件和其他 MCP 权限，
也不强迫模型调用工具。macOS/Linux 还添加本次调用范围的 `SessionStart` 和
`UserPromptSubmit` hook，提供公布的目标与有上限、非消耗式的 inbox 预览；不指定接收方、
发消息、读取原生聊天或替换用户指令。只信任这两个精确定义，不改全局配置或其他
user/project hook 的信任状态；禁用的 hook 不会被强制开启。
原生实测版本为 Codex `0.145.0`，后续版本需要重新验证；Windows 目前仅提供 MCP。
这增加任务时的上下文感知，**不提供 Codex 后台空闲唤醒**。

## 查看、静音与排错

```sh
npx threadmesh status
npx threadmesh mute client
npx threadmesh unmute client
```

关闭 harness 结束连接；目标、收件箱与 checkpoint 保留在本地工作空间。
读 inbox 不会消耗消息。若什么都没发生：

1. 检查原生 harness 本身能正常使用，而不只看 `doctor`。
2. 确认两个进程用同一个工作空间、不同名字和明确的工作目标。
3. 用 `status` 区分“没有消息”和“有待处理消息”。
4. 确认四个工具可用；非 Pi 接收方需要在工作回合中读取 inbox，不能假设后台唤醒。
5. SQLite 缺少适合当前 Node/OS 的预构建二进制时，可能需要本机构建工具链。
6. 报告[第一个失败步骤](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml)，无需先做出成功演示。

## 其他 Agent 与工作交接

[DeepSeek 官方 dsh 配置](../06-guides/first-workspace.md#deepseek-harness)已提供；
通过的是原生无模型检查，真实模型主动性仍待凭证验证。
[Kimi 和自定义 MCP harness](../06-guides/first-workspace.md#kimi-and-custom-harnesses)
使用各自宿主配置，不应把消息投递能力等同于后台唤醒。

额度满时可用[已保存的 checkpoint](../06-guides/portable-checkpoints.md)启动另一家 Agent。
它需要目的地有额度，会新建 session；不是无损迁移完整聊天或自动绕过限制。

[支持矩阵](../00-overview/harness-support.md) · [Pi 双 session 真实记录](../09-reviews/2026-09-05-first-use-validation.md) ·
[当前重点](https://github.com/fyaic/threadmesh/issues/156)
