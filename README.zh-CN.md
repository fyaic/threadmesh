<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>让 Agent 之间自己沟通，你不用再当消息中转站。</strong></p>

<p align="center">把不同 Agent 的独立 session 接到同一个工作空间：主动分享有用信息，保留工作交接点。</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="docs/06-guides/first-workspace.md">接入指南</a> ·
  <a href="docs/06-guides/portable-checkpoints.md">额度用完怎么办</a> ·
  <a href="docs/06-guides/real-world-cases.md">真实案例与边界</a>
</p>

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="概念示意：一个 session 主动联系另一个，无关任务保持安静">
  <br><sub>这是概念插图，不是已发布的 ThreadMesh 聊天界面截图。</sub>
</p>

你让一个 Agent 改后端，另一个写客户端。后端把分页字段改成了 `next_cursor`，
客户端却还在用旧字段。通常你需要发现这个变化，复制内容，切换 session，再解释一遍。

ThreadMesh 希望省掉这次转述：你明确让两个 session 加入同一个本地 workspace，
Agent 能看到彼此公布的目标，自行判断是否需要联系、联系谁、说什么。
接收方再判断是否采用。**智能判断来自模型，ThreadMesh 提供让判断落地的连接。**

```text
后端 session                    客户端 session                  无关 session
改完分页接口 ── 主动发出建议 ──► 看到来自另一任务的变化           继续翻译隐私政策
                               判断、检查、更新                 不收到无关消息
```

## 先看到效果，再接自己的 Agent

需要 Node 22+。目前从 GitHub 安装，尚未发布到 npm registry。

```sh
npm install github:fyaic/threadmesh
npx threadmesh preview api
```

这是明确标注的**模拟 Agent 演示**，经过真实本地协调器，不消耗模型额度，也不读取
现有聊天。还有 `preview preferences` 和 `preview quota`，分别展示复用已确认的
偏好、额度耗尽后的工作交接。不要把这个预览当成真实模型主动性的证明。

## 接入真实 session

不只改接口：第二条真实 Pi 双 session 案例中，用户只在品牌任务里确认新名称和免费
额度。品牌 Agent 自己联系网站任务，后者自动续接，把“Team Hub / 无限免费项目”
改成“Member Portal / 最多 5 个免费项目”，原价未变，无关数据库任务收到 0 条消息。
这是一次受控实测，不是所有 Agent 都会自动成功的承诺。
[查看真实文件和事件记录](docs/09-reviews/2026-09-05-workspace-awareness.md)。

在项目目录创建工作空间：

```sh
npx threadmesh init --workspace .threadmesh
```

终端 B 先启动接收方：

```sh
npx threadmesh run pi --name client --goal "维护 /orders 客户端" --wake-idle \
  -- --provider zai --model glm-5.3
```

终端 A 在同一项目启动另一个 Agent：

```sh
npx threadmesh run codex --name backend --goal "维护 /orders 后端接口"
```

分别给它们正常的工作任务。它们现在可以发现 peer、发消息、读收件箱、存 checkpoint。
不同项目目录也能协作，只要传相同的绝对 `--workspace` 路径。
Agent 本身需要事先安装、登录，并有可用额度。这里固定了实测通过的 Pi 模型；
其他模型需各自验证。这个跨 harness 示例还需要已登录的 Codex；Kimi/DeepSeek 配置见指南。

[最新真实跨 harness 案例](docs/09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass)：
Codex 与 Pi 收到普通文件任务后自行沟通；同一个 Pi session 自动继续，用自己的工具
修改客户端，并通过独立两页分页断言；无关消息为 **0**。Pi 先自主说明了依赖，
Codex 随后回复变更：这是无需用户转述的双向协作，不是无先行消息的盲发现或可靠性承诺。

[完整上手步骤、DeepSeek 配置、排错 →](docs/06-guides/first-workspace.md)

## 能接哪些 Agent

| Harness | 接入方式 | 空闲时自动唤醒 |
|---|---|---|
| Pi | 原生扩展，turn 开始时提供收件箱 | 显式开启 `--wake-idle`；不打断正在运行的 turn |
| Codex | 本次启动的 MCP；macOS/Linux 原生任务起始上下文 hook | 未提供；模型工作期间刷新协作上下文 |
| Kimi Code | 项目 MCP 配置，保留其他 server | 未提供；模型工作期间读取 inbox |
| DeepSeek Harness | 官方 `dsh` 的 Cordis MCP 插件 | 未声称支持 |
| 其他 Harness | 标准 MCP 配置或 JavaScript SDK | 需要 host 自己接入 |

DeepSeek 官方 `0.1.2-rc.1` 已通过原生插件的工具发现、双向收发、接收方处置及
checkpoint 保存验证。**真实 DeepSeek 模型主动协作仍待 provider 凭证验证。**
此前 Codex→Kimi、Pi→Kimi 的真实模型记录使用了较强约束，不能代表任意日常任务
都能自主成功。新旧证据和失败记录在[支持矩阵](docs/00-overview/harness-support.md)中分开说明。

## 站在日常使用的角度

| 痛点 | 可以怎样用 |
|---|---|
| “这个接口变更，我还得跟另一个 Agent 再说一遍。” | 上游给维护客户端的 session 发变化和影响。 |
| “命名、文案语气已经确认过，为什么又被改回去？” | 主动分享明确批准的约束，而不是广播整段私聊。 |
| “调研 Agent 找到了答案，写代码的还卡着。” | 把结论、来源及为什么相关交给对应工作流。 |
| “额度满了，庞大上下文都在那个 session 里。” | 用已保存的目标、决策、约束、进度和下一步启动另一家 Agent。 |

这些是使用场景建议，不是每项都已独立跑过的成功宣称。

## 额度耗尽后的交接

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

**必须先有 checkpoint**。Agent 有保存工具和通用保存提示，但不能保证每次都主动保存，
请用 `status` 确认。目的地需要自己的正常账户、权限和额度。

它转移的是显式工作上下文，不是隐藏推理、完整聊天或授权；不会绕过额度，也不会
自动轮换账户。源 Agent 已完全不可访问且没保存的内容，ThreadMesh 无法凭空恢复。

[保存、导出和跨 Harness 继续工作的边界 →](docs/06-guides/portable-checkpoints.md)

## 诚实的边界

- 装上工具不等于模型一定会发现每个依赖。
- MCP 发消息不等于能自动唤醒所有 Agent 产品。
- 只共享明确加入的工作空间，不扫描所有私聊。
- 读 inbox 不会把消息“读没”；接受消息不等于任务完成。
- 当前是同一所有者的本地实验版，不是多租户或恶意进程的安全隔离。

我们优先解决“第一次上手就能获得实际帮助”，而不是继续堆协议术语。
安装失败、Agent 沉默、建议不相关，都值得直接提 issue。

[报告第一次使用](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[路线图](ROADMAP.md) · [文档](docs/README.md) · [贡献](CONTRIBUTING.md)

如果它确实帮你省了一次转述或重复劳动，欢迎 star，让更多人发现它。
采用 [Apache 2.0](LICENSE) 协议。
