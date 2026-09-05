# 第一次真实协作

[English](../06-guides/first-workspace.md) · [返回中文首页](../../README.zh-CN.md)

目标：在一个本地工作空间中，让 Codex 和 Pi 处理各自的普通任务，观察是否出现
无需人工转述的消息与同 session 续接。不会自动扫描或接管你已有的私聊。

## 先准备好

- Node 22+；当前真实产品记录来自 macOS，Windows 尚未完整验证。
- 分别安装并登录 Codex、Pi，保证两者有正常额度。
- 实测接收方是 Pi `0.84.2` 的 `zai/glm-5.3`，需要已配置的 ZAI 账户。
- 普通上手使用已有 API 契约和客户端的可丢弃项目；命令不会生成应用文件。
  没有合适项目，可以直接用下方的[固定案例复现](#固定案例复现)。

ThreadMesh 不提供模型账户、API key 或额度。Codex 实测版本为 `0.145.0`；
换模型或产品版本需要各自验证，不保证同样表现。

## 先看不消耗额度的预览

```sh
npm install github:fyaic/threadmesh
npx threadmesh preview api
```

当前从 GitHub 安装，尚未发布到 npm registry。预览经过真实本地协调器，
但 Agent 是模拟的。也可以试 `preview preferences` 和 `preview quota`。

## 两个终端，两个独立 session

在项目目录执行一次：

```sh
npx threadmesh init --workspace .threadmesh
npx threadmesh doctor
```

`doctor` 检查安装及版本，不证明已登录、还有额度或模型会主动协作。

**终端 B：启动 Pi 客户端工作流。**

```sh
npx threadmesh run pi --name client --goal "Maintain the /orders client" --wake-idle \
  -- --provider zai --model glm-5.3
```

正常布置任务：“检查客户端是否符合当前 API 契约，保持现有导出接口；后端变化时
保持可用。”等它完成初始回合，保持终端打开。

**终端 A：启动 Codex 后端工作流。**

```sh
npx threadmesh run codex --name backend --goal "Maintain the /orders API"
```

布置上游任务：“把契约从 next_page 改成 cursor 分页，保持 endpoint 和 item schema
不变。”这是使用示例；精确实测英文任务保留在[验证记录](../09-reviews/2026-09-05-workspace-awareness.md)。

不需要追加“请给 Pi 发消息”。观察是否出现消息、同一个 Pi 的自动续接和正确文件
变化。模型可能沉默、拒绝建议或做错；不能仅凭“已收到”判断成功。

不同目录需要传同一个**绝对** `--workspace` 路径。每个并发 session 使用不同名字。
工作流名字不是自动发现的原生聊天 ID；`run` 也不等于接入任意旧 tab。

## 固定案例复现

不想准备应用文件，可从仓库运行自包含的真实模型验证：

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
node scripts/validate-workspace-live.mjs codex api
```

这会在临时目录生成契约、客户端与工作空间，给两个真实 session 各一次普通任务，
并检查发送、同原生 session 续接、接收方自己改文件及最终分页行为。
需要上方的账户和模型配置，**会消耗正常模型额度**；历史通过不保证这次通过。

脚本输出测试目录和 `report.json`。另有 `codex preferences` 与 `codex api-no-contact`；
不需要为了入门全跑一遍。保留结果是：API 通过、文案业务完整性失败、无关修改保持安静。
Pi 曾先自主说明依赖，所以成功例是双向自主协作，不是无先行消息的盲发现。

原始事件可能含模型输出与原生标识，请保留为私有。要分享时，先审查
`node scripts/project-first-use-evidence.mjs PATH` 的精简投影。验证脚本只随源码提供，
不是安装包中的用户命令。

## 加入到底授权了什么

加入同一所有者的本地房间，共享公布的目标和非权威建议，不共享全部聊天。
Codex 本次启动预批准四个本地工具，并在 macOS/Linux 添加只信任自身精确定义的
原生任务起始 hook；不替换用户指令、全局配置或其他 hook 的信任状态。
禁用的 hook 不会被强制开启，Codex 也没有后台空闲唤醒。

Pi 的 `--wake-idle` 是明确的空闲续接选择；有忙碌与待处理输入保护，
但真实忙碌输入竞争还未完整验收。接收方始终需要判断建议；接受不等于业务完成。
这不是恶意进程或多租户环境的安全隔离。

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

[支持矩阵](../00-overview/harness-support.md) · [真实记录](../09-reviews/2026-09-05-workspace-awareness.md) ·
[当前重点](https://github.com/fyaic/threadmesh/issues/156)
