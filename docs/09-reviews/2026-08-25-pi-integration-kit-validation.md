# Pi integration-kit validation — 2026-08-25

## Purpose and claim boundary

This plan validates the packaged ThreadMesh proactive bridge from a clean Pi
extension consumer, then exercises real Pi model behavior and one real Pi-to-
Kimi cross-harness path. It is maintainer-run integration evidence, not the
independent human feedback still requested by M4.

No test may import coordinator, adapter, or validation internals from the Pi
consumer. A localhost-only reference fixture may use repository internals to
provide the control plane and receiver orchestration.

## Environment plan

| Component | Planned boundary |
|---|---|
| Repository | Clean synchronized `main`; exact SHA recorded at execution |
| Package | `npm pack`, install tarball into a new temporary consumer |
| Sender harness | Pi `0.84.2`, explicit extension, no built-in tools |
| Sender model | Explicit ZAI model with readiness checked without exposing credentials |
| Receiver | Public SDK checkpoint loop for Layer 2; real Kimi ACP for Layer 3 |
| Control plane | `127.0.0.1` random port, temporary SQLite database and static tokens |
| Session state | Temporary Pi session directory or `--no-session`; exact Kimi session cleanup |
| Evidence | Bounded JSON projection; no transcript, token, session ID, or local home path |

## Test matrix

| ID | Layer | Case | Expected result | Risk |
|---|---:|---|---|---|
| PI-L1-01 | 1 | Fresh consumer installs packed SDK | Import and bridge creation pass | P0 |
| PI-L1-02 | 1 | Pi extension tool enumeration | Exactly discover and suggest; schema digest recorded | P0 |
| PI-L1-03 | 1 | Deterministic authorized suggestion | One discover, one send, receiver accepts | P0 |
| PI-L1-04 | 1 | Send before discovery | Stable fail-closed error; no mailbox item | P0 |
| PI-L1-05 | 1 | Unknown target | Stable fail-closed error; no mailbox item | P0 |
| PI-L1-06 | 1 | Duplicate send | First accepted; second budget-rejected | P0 |
| PI-L2-01 | 2 | Real Pi relevant dependency | Discover once, send once, receiver accepts | P0 |
| PI-L2-02 | 2 | Real Pi irrelevant task | Read-only discovery allowed; zero sends | P0 |
| PI-L2-03 | 2 | Real Pi control | Zero ThreadMesh calls and sends | P1 |
| PI-L3-01 | 3 | Real Pi A to persistent Kimi B | Kimi missing baseline becomes completed outcome | P0 |
| PI-L3-02 | 3 | Exact cleanup | Pi temp state removed; Kimi delete and absence pass | P0 |

## GO / NO-GO

GO requires every P0 case to pass, no unexpected non-ThreadMesh tool, exact
receiver disposition, bounded evidence, and complete cleanup. Provider quota or
authentication unavailability is `Blocked`, not `Passed` or `Failed`. Any
unwanted send, second send, unknown target acceptance, cleanup residue, or
credential/transcript disclosure is NO-GO.

## Execution report

Execution status: pending.

### Environment fingerprint

Pending.

### Result matrix

Pending.

### Findings and dispositions

Pending.

### Cleanup confirmation

Pending.

### Final verdict

Pending.
