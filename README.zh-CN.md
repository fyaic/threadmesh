# ThreadMesh

**面向不同 agent harness 的安全、主动任务协调层。**

[English](README.md) · [中文文档入口](docs/zh-CN/README.md) · [当前进度](docs/10-planning/project-status.md) · [协议草案](spec/README.md) · [路线图](ROADMAP.md)

> 当前状态：pre-alpha。仓库已包含可执行协议草案、SQLite coordinator
> 实验原型和 ACP adapter，但协议尚未稳定，也没有可用于生产的 adapter。

## 当前进度

PR [#20](https://github.com/fyaic/threadmesh/pull/20) 已合并一条经过三路内部
review 的实验链路：任务注册、持久 mailbox、relationship grant、CAS、单次
admission claim、ACP session reload、来源封装和审计记录均有自动化测试。

当前不能把它称为跨 harness 产品能力：

- M0 仍有 #7、#15–#17、#19 五个开放 issue；
- principal 仍是可信进程注入，不是网络认证；
- ACP 中的 peer 内容仍通过普通 prompt surface；
- steer/interrupt 未启用；
- Kimi ACP 握手已通过，但真实模型调用因账户额度被阻塞，未计为成功。

后续主线是先稳定 schema、authority/transport binding、crash
reconciliation 和 interruption/verification，再完成外部 review 与 M1 本地
coordinator。详见[项目状态](docs/10-planning/project-status.md)和
[主线计划](docs/10-planning/mainline-plan.md)。

ThreadMesh 关注一种具体能力：Agent A 在执行过程中发现 Agent B 的任务与自己的目标存在依赖，于是主动发起通知、建议、纠偏或停止请求。

难点并不是把一段文字从 A 送到 B，而是让 agent 能够发现依赖并主动协调，同时不悄悄夺走 B 的上下文主权、不覆盖用户的新目标，也不造成跨任务消息风暴。

## 项目目标

ThreadMesh 希望把这项能力抽离成模型和 harness 无关的协议与 adapter，使 Codex、Claude Code、LangGraph、自研 agent loop 等运行时可以共享一套协调语义：

- 发现相关任务，但不默认读取完整私有上下文；
- 区分 `notify`、`suggest`、`steer`、`interrupt`；
- 对高影响行为执行权限、时效和目标版本检查；
- 让接收方明确接受、拒绝或延迟消息；
- 保存可审计的来源和因果链；
- 让用户拥有的 session 比 agent 创建的子任务受到更强保护。

## 四类协调意图

| 类型 | 默认语义 | 适用关系 |
|---|---|---|
| `notify` | 旁路信息，不直接进入当前 prompt | 任意获准任务 |
| `suggest` | 进入 mailbox，由接收方在 checkpoint 判断 | peer → peer |
| `steer` | 改变当前任务方向，需要显式授权 | parent → child |
| `interrupt` | 请求停止执行，权限最高 | 用户或监督者 → task |

## 核心立场

我们希望让“智能”体现在：发现依赖、说明理由、提出建议和协商；而不是让 agent 获得无边界改写其他 session 的权力。

详细内容请从[中文文档入口](docs/zh-CN/README.md)开始，英文规范文档是当前的 canonical source。

## License

Apache License 2.0，见 [LICENSE](LICENSE)。
