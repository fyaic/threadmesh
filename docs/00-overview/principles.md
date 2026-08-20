# Design principles

## 1. Context sovereignty

A task owns its current objective, model-visible history, and execution plan. Receiving a message does not automatically grant the sender the right to modify them.

## 2. Least-authority coordination

Senders use the least disruptive intent that can achieve the outcome. `notify` is preferred over `suggest`, `suggest` over `steer`, and `steer` over `interrupt`.

## 3. Mailbox before injection

Messages between peers enter a receiver-controlled mailbox by default. They become model-visible only at a checkpoint or after an explicit policy decision.

## 4. Freshness before mutation

State-changing coordination binds to the run, objective version, or checkpoint that the sender observed. A mismatch fails closed instead of applying the request to newer work.

## 5. Visible provenance

Every message has an attributable sender, target, relationship, reason, timestamp, and causal parent when applicable. Forwarding does not erase origin.

## 6. Explicit degradation

An adapter that cannot implement an intent safely advertises that limitation. It must not silently reinterpret `suggest` as direct prompt injection or `interrupt` as best-effort text.

## 7. User-owned work is privileged

A session directly controlled by a user has stronger protections than a delegated child task. Peer agents do not acquire state-changing authority merely because they share a project.

## 8. Auditable autonomy

Agents may decide when coordination is useful, but decisions must produce inspectable actions and outcomes. Hidden cross-task writes are incompatible with ThreadMesh.

## 9. Protocol, not personality

ThreadMesh defines observable behavior and safety boundaries. It does not prescribe chain-of-thought, consciousness claims, or a universal internal reasoning process.

## 10. Evaluate interference, not only completion

A coordination system is not successful merely because the global task completes. Evaluation must include interruptions, rejected messages, context contamination, duplicated work, and user overrides.
