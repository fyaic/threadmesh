# 安全模型

ThreadMesh 的核心安全假设是：**Agent A 认为某条消息有帮助，并不意味着 A 有权把它直接写进 B 的上下文。**

## 默认权限

- 用户可以管理自己拥有的任务；
- 明确授权的 supervisor 可以按策略 steer 或 interrupt；
- parent 可以协调自己创建的 child，但权限仍有边界；
- peer 默认只能 notify 或 suggest；
- unrelated task 不能互相发现或通信。

## 四个意图

- `notify`：旁路信息，不自动进入 prompt；
- `suggest`：进入 mailbox，由 B 在 checkpoint 接受、拒绝或延迟；
- `steer`：改变当前执行方向，需要权限与 freshness 校验；
- `interrupt`：请求停止，需要最高权限并报告实际取消结果。

## 为什么 mailbox 很重要

模型上下文不是普通消息列表。内容一旦进入，可能影响注意力、调用工具、执行写操作，并在 summary 或 compaction 中长期保留。因此 ThreadMesh 把“送达 B”与“进入 B 的模型上下文”设计成两个不同事件。

## 必须防止的问题

- A 用旧目标打断已经被用户重新指派的 B；
- peer 把 suggestion 伪装成用户指令；
- 多个 agent 反复纠偏形成消息风暴；
- adapter 把不支持的语义偷偷降级；
- 审计日志复制并泄露私有 prompt；
- 多 agent 同时修改同一资源造成竞态。

## 当前实现边界

现有 SQLite/JSON-RPC/ACP 路径已经验证：请求体不能注入 principal、静态 token
由 host 映射为认证身份、agent proposal 与 owner/policy effective grant 分离、
revocation 会隔离 queued content，并支持 CAS、mailbox claim/ack 与 admission
claim。规范已经定义按目标拆分的 interruption result 和签名 verification
attestation，conformance kit 会用固定 Ed25519 信任锚做真实验签；本地原型仍
没有生产级网络凭据与 trust store、OS sandbox 或真实 interrupt 能力。
