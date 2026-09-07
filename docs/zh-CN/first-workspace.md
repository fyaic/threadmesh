# 第一次真实协作

[English](../06-guides/first-workspace.md) · [返回中文首页](../../README.zh-CN.md)

ThreadMesh 连接你明确加入同一本地工作空间的 session，不扫描私聊，不合并完整聊天。
**Codex 用户是优先对象**，但下面的自包含 Codex 入口还没有通过完整真实验证。
已发布的 Pi 案例仅供已有 Pi 用户选择，不要求 Codex 用户另装一家产品。

## Codex 候选入口（未发布）

需要 Node 22+ 和已登录、有额度的 Codex 运行时。候选功能先查找 PATH 中的 Codex；
macOS 下还可以自动发现桌面应用自带的二进制，不一定需要单独安装 CLI。
发现二进制**不等于接入已有桌面对话**，也不证明账户可用、有额度或协作成功。

这是**源码 checkout 中的开发者测试**，不是 alpha.2 安装包的使用命令。
在包含候选改动的源码目录运行：

```sh
npm ci
node bin/threadmesh.mjs try preferences --agent codex --live
```

不带 `--live` 只显示说明，不调用模型。候选入口默认 Codex 和 `preferences` 文案案例；
Codex 当前只开放这个文案案例，接口分页仍需明确选择 Pi。
可选 `--model YOUR_CODEX_MODEL` 用于选择现有配置中可用的模型。
不依赖 Pi、不要求第二份订阅，也不会失败后偷偷换 Agent。

预期验收会创建两个新的临时 Codex session：

1. B 先维护注册文案，保留此前按钮名称的约定。
2. A 收到修改品牌与免费方案额度的普通任务。启用通用协作提示，但不在任务中
   指定接收对象或要求必须发消息。
3. 只有实际收到消息后，运行器才为同一个原生 B session 启动后续回合。
   B 自行判断如何使用建议，必须自己修改文案，保留旧约定和完整业务含义。

这是运行器触发的续接，**不是 Codex 桌面端原生后台唤醒**。
最近一次默认完整运行中，B 主动说明了依赖并完成首轮；随后 A 因反复 WebSocket 超时，
未在整体 300 秒内完成。[部分结果与失败记录](../09-reviews/2026-09-07-codex-first-use-candidate.md)保留。
没有声称 Codex 双 session 的完整业务结果已经通过；登录、送达或第一轮完成都不够，
真实失败也不会替换成模拟成功。

### 权限、记录与失败处理

候选入口为每个 Codex session 请求其自身案例工作目录内的原生沙箱。
业务检查读取结构化 JSON，不执行模型改写的应用代码。这不代表所有 ThreadMesh
进程都在操作系统沙箱中；请使用可信本地进程，并留意运行时权限说明。

模型调用消耗现有 Codex 账户的正常额度。命令会打印私有结果目录，保留案例文件、
报告和原始模型记录，分享前请审查脱敏。结束或按 Ctrl-C 后停止进程，结果文件保留。
案例不会读取、接入或修改已有私聊。

登录错误、额度限制、模型沉默和业务错误都算失败。在 Codex 自己的配置中处理账户
问题，不要对耗尽的额度反复重试。ThreadMesh 不提供凭证或额度，不会偷偷换成 Pi
或另一账户。

## 已发布版本：可选 Pi 案例

对**已经使用 Pi** 的用户，需要 Node 22+ 和现有可用的 Pi 配置。
不用 clone 仓库、自编 harness、准备应用文件、填写工作空间或开两个终端：

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.2/fyaic-threadmesh-0.1.0-alpha.2.tgz
npx threadmesh try preferences --agent pi --live
```

这是固定的 **v0.1.0-alpha.2** 安装包，尚未发布到 npm registry。参数显示安装进度，
但原生依赖仍可能编译，不保证固定时长。Alpha.2 的 `try` 仅运行 Pi；
明确写出 `--agent pi` 也便于在候选版本中使用时保持含义不变。

命令创建两个新的 Pi session 和案例文件，使用现有模型的正常额度。
源模型判断是否联系，验收检查原接收方自己修改文件、完整业务含义和此前约定。
这不是接入已有桌面聊天；沉默、provider 错误和错误结果都报告失败，不替换成模拟成功。

接口分页案例：

```sh
npx threadmesh try api --agent pi --live
```

Pi 可按需添加 `--provider zai --model glm-5.3`，需要已有的对应账户配置。
历史 Pi 成功案例使用 `zai/glm-5.3`，其他模型表现可能不同；历史通过不保证本次成功。
不带 `--live` 只显示说明，不调用模型。

Pi 保留正常的本地工具权限，临时目录不是操作系统沙箱。结束或 Ctrl-C 后停止进程，
私有案例文件与原始模型记录保留在打印出的结果目录，分享前请审查脱敏。
登录或额度错误应在 Pi 原生配置中处理，不要对耗尽的额度反复重试。

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
