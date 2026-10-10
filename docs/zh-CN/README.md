# ThreadMesh 中文文档

ThreadMesh 帮助独立的 Agent 任务分享相关变化，同时保留各自的上下文。
先根据你的工作方式选择入口，无需先学习协议。

[项目首页](../../README.zh-CN.md) · [English docs](../README.md)

## 选择使用路径

| 你的使用方式 | ThreadMesh 提供什么 | 从这里开始 |
|---|---|---|
| 选定的 Codex 桌面任务 | 可选 Skill，约定共享范围与交接方式，使用 Codex 自带的任务工具 | [候选插件与原生任务指南](codex-native-tasks.md) |
| 在本地启动 Agent 会话 | 工作空间，提供任务发现、持久建议收件箱与保存的工作快照 | [CLI alpha.3：首次工作空间](first-workspace.md) |

这是两个独立入口。Codex Skill 不提供 CLI 的持久收件箱或快照存储；
CLI 示例会创建新会话，不会接入已有桌面聊天。如果原生 Codex 已满足需要，
Skill 的增量可能很小，详见[原生能力与项目价值](native-capabilities-and-value.md)。

## 按问题查阅

| 我想…… | 推荐文档 |
|---|---|
| 理解用途与边界 | [ThreadMesh 是什么](product-guide.md) |
| 确认支持的产品和版本 | [接入支持矩阵](../00-overview/harness-support.md) |
| 从明确保存的上下文继续工作 | [Checkpoint 与额度边界](../06-guides/portable-checkpoints.md) |
| 核查模型实际做了什么 | [案例与证据](../06-guides/real-world-cases.md) · [桌面消息与修改记录](native-evidence.md) |
| 了解权限和隐私 | [威胁模型](../04-safety/threat-model.md) · [上下文归属](../01-concepts/context-sovereignty.md) |
| 接入另一种 Agent 应用 | [MCP 配置](../06-guides/first-workspace.md#kimi-and-custom-harnesses) · [SDK 指南](../06-guides/implement-an-adapter.md) |
| 反馈安装或协作问题 | [使用反馈](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) |
| 查看项目优先级 | [Roadmap](../../ROADMAP.md) · [当前状态](../10-planning/project-status.md) |

当前暂缓真实项目验证，详见[项目状态](../10-planning/project-status.md)。

## 已有证据说明什么

受控的 Codex 原生任务协作产生过接收方自己的修改。插件安装后使用、旧任务加载、
独立用户上手和相较原生 Codex 的收益仍未验证，详见[桌面指南](codex-native-tasks.md)。

[CLI 安装包案例](../09-reviews/2026-09-07-codex-first-use-release.md)使用两个
新建 Codex 会话，接收方正确修改了文案并保留此前约定；不能据此宣称已有桌面
任务接入或普遍可靠性。

[Codex → Pi 记录](../09-reviews/2026-09-05-workspace-awareness.md)包含接口协作
通过、无关变化保持安静，以及一例消息送达但遗漏“免费方案”条件的文案失败。
**消息送达不等于结果正确。**

- `preview` 使用模拟 Agent，不是模型主动性的证据。
- DeepSeek 通过无模型接入检查，真实模型主动协作仍未验证。
- Checkpoint 通过预置上下文测试，尚未验证额度耗尽后的真实长会话恢复。

## 实现、研究与历史记录

实现细节见[参考架构](../02-architecture/reference-architecture.md)，
完整目录见[英文文档导航](../README.md#explore-the-implementation)。

研究资料包括[Codex 调研摘要](research-summary.md)、
[社区研究](../07-research/community-signals.md)与[架构决策](../08-decisions/README.md)。
历史的多角色流程、人工转述基线和非打断交接实验保留在
[评审目录](../09-reviews/README.md)；它们不是安装前置条件、当前速度承诺，
也不能证明任意忙碌会话都可以安全唤醒。

[协议草案](../03-protocol/README.md)和[机器可读 schema](../../spec/schema)
供底层接入参考。只有明确标注为规范的文档定义协议要求，这些要求以英文为准。
