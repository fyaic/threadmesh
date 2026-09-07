# 第一次真实协作

[English](../06-guides/first-workspace.md) · [返回中文首页](../../README.zh-CN.md)

先用**现有账户运行两个 Codex session**。ThreadMesh 准备案例、提供相关工作目标和建议，
并检查真正有用的结果。它不扫描已有私聊，也不合并完整聊天记录。

## 安装并运行 Codex 案例

需要 Node 22+，以及已登录、有额度的 Codex 运行时。macOS 下会比较 PATH 与桌面
应用自带的版本，可以自动选择版本已核实的更新运行时，不一定需要单独安装 CLI。
命令会显示所选版本，不会偷偷更换你的账户或模型配置。

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

这里是固定的 **v0.1.0-alpha.3** 安装包，尚未发布到 npm registry。参数显示安装进度；
原生依赖仍可能编译，安装时间取决于环境。不用 clone 仓库、自编 harness、准备应用文件、
填写工作空间路径、另装 Pi 或打开两个终端。

默认场景为 `preferences`、Agent 为 `codex`，完整写法等价：

```sh
npx threadmesh try preferences --agent codex --live
```

不带 `--live` 只显示说明，不调用模型。可选 `--model YOUR_CODEX_MODEL` 用于选择
现有配置可用的模型。Codex 当前只提供文案案例，接口分页需明确选择 Pi。
不要求另买订阅，也不会在失败后偷偷换 Agent。

### 应该看到什么

1. 新的网站 session B 维护注册文案，记住此前按钮名称 `Create my workspace` 的约定；
   它可能自主说明自己的依赖。
2. 独立品牌 session A 收到普通任务：改为 Member Portal、使用美式拼写，免费方案
   限制为五个项目。启用通用协作提示，但任务不指定接收对象或要求必须发消息。
3. 只有实际收到消息后，运行器才为**同一个原生 B session** 启动后续回合。
   B 自行判断建议并修改自己的文案。验收要求新品牌、拼写和完整免费方案含义，
   同时保留按钮名称和 $12/月的付费价格。

通过必须包含接收方自己的原生文件修改和正确业务结果。登录、投递或接受建议本身都不够。
沉默、provider 错误、错误结果或未完成都报告失败，不以预览替换真实结果。

[两次安装包真实记录](../09-reviews/2026-09-07-codex-first-use-release.md)通过：
默认 300 秒上限内约 273 秒完成；此前扩展预算诊断约 184 秒完成。
两次都沿用原模型和账户。这是维护者观察，不是独立用户采用、可靠性统计或固定时长保证。
网络与模型表现可能变化，[此前连接失败](../09-reviews/2026-09-07-codex-first-use-candidate.md)继续保留。

### 已有桌面对话是另一条路径

上例创建**两个新的临时 session**，实际收件后由运行器触发续接。
它不是桌面原生后台唤醒，也不是接入旧任务。

[实验性已有任务工作流](codex-native-tasks.md)通过 skill 使用 Codex 宿主已经提供的任务工具，
不需要配置 Node、MCP 或 hook；但**尚未通过原生桌面接入验收**。
Skill 不能补出缺失的工具、强制保证隐私边界或消除用户输入竞争；
新 session 案例通过不代表这条路径通过。

### 权限、记录与失败处理

每个 Codex session 会请求其自身案例工作目录内的原生沙箱。业务检查读取结构化 JSON，
不执行模型改写的应用代码。这不代表所有 ThreadMesh 进程都在操作系统沙箱中；
请使用可信本地进程，并留意权限说明。

模型调用消耗现有 Codex 账户的正常额度。检测到运行时或登录不证明还有额度。
进度区分准备、模型工作与验收；连接重试始终在**整体 300 秒预算**内。
失败后不会自动重开整次运行、换账户或模拟成功。

命令打印私有结果目录，保留案例文件、报告和原始模型记录。分享前请审查脱敏。
结束或按 Ctrl-C 后停止进程，结果文件保留供检查。
本案例不会读取、接入或修改已有私聊。

登录缺失、额度耗尽或运行时过旧，应通过 Codex 原生配置或更新入口处理，
不要对耗尽的额度反复重试。ThreadMesh 不提供凭证或额度。其他失败应保留首个失败阶段，
分享经过审查的摘要，不必提供私有完整聊天。

## 可选：Pi 案例

已经在用 Pi？沿用其现有登录配置并明确选择：

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

Pi 不依赖 Codex，Codex 也不依赖 Pi。两者都会准备案例，不需要自编代码或双终端。
历史 alpha.2 的 `try` 只运行 Pi；alpha.3 默认 Codex，因此需明确写出 `--agent pi`。

Pi 可按需添加 `--provider zai --model glm-5.3`，需要已有对应账户配置。
历史 Pi 成功案例使用 `zai/glm-5.3`，其他模型表现可能不同，历史通过不保证本次成功。

Pi 保留正常本地工具权限，临时目录不是操作系统沙箱。结束或 Ctrl-C 后停止进程，
私有结果文件保留。登录或额度错误应在 Pi 原生配置中处理，不要反复重试耗尽的额度。

## 先看不消耗额度的预览

```sh
npx threadmesh preview preferences
```

预览经过真实本地协调器，但 Agent 是模拟的，不证明模型主动性。
也可以试 `preview api` 和 `preview quota`。预览与真实 `try --live` 是分开的入口。

## 进阶：两个终端接入自己的项目

以下是 **Pi 专用**的原生空闲续接示例，不是上方 Codex 首次体验的前置条件。
Codex 的普通 launcher 当前提供任务时上下文，不提供原生后台空闲唤醒。

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
`threadmesh try api --agent pi --live`，不用 clone 仓库：

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
