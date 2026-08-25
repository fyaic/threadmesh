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

Execution status: complete. Final verdict: **GO for the bounded maintainer
experiment**. Independent human harness-author feedback remains open under
[#79](https://github.com/fyaic/threadmesh/issues/79).

### Environment fingerprint

- Repository: clean synchronized `main`
  `02d8d24e41d0e7800a3b648c8a41376aba849535`
- Node.js: `26.3.1`; npm: `11.16.0`
- Pi: `0.84.2`; provider/model: `zai/glm-5.3`
- Kimi Code: `0.38.0`; ACP protocol version `1`
- Package: `@fyaic/threadmesh@0.1.0-alpha.0`
- Package integrity:
  `sha512-YZ9uHdtsyKjQLHmGLhYubl8LdJuMjbpUASDz5HhoPDigbmo4Uj9eC+iJWlP/kQwI0hCoUmCA3cbScD6QT2dL2A==`
- Packed tarball digest:
  `sha256:02e75763b0e298f613aa00f3d36027e4789c3883e5c95a614ba6955d73061261`
- Formal live run: `2026-08-25T11:49:03.568Z` through
  `2026-08-25T11:52:32.653Z`
- Formal Layer 1 rerun: `2026-08-25T11:53:17.683Z` through
  `2026-08-25T11:53:18.632Z`

### Result matrix

| ID | Result | Bounded evidence |
|---|---|---|
| PI-L1-01 | Passed | Fresh packed consumer imported and executed |
| PI-L1-02 | Passed | Exactly two tools: related tasks and send suggestion |
| PI-L1-03 | Passed | One authorized message; receiver accepted |
| PI-L1-04 | Passed | Discovery-required error; zero messages |
| PI-L1-05 | Passed | Unknown-target error; zero messages |
| PI-L1-06 | Passed | Second send budget-rejected; exactly one accepted message |
| PI-L2-01 | Passed | Relevant: discover then send; one accepted message |
| PI-L2-02 | Passed | Irrelevant: discovery only; zero messages |
| PI-L2-03 | Passed | Control: zero tool calls and zero messages |
| PI-L3-01 | Passed | Pi sent once; Kimi accepted; `context-admitted`; exact marker |
| PI-L3-02 | Passed | No Pi session; Kimi delete and absence; all temporary roots removed |

The exact Layer 1 negative-path codes were
`threadmesh_proactive_bridge_discovery_required`,
`threadmesh_proactive_bridge_target_unknown`, and
`threadmesh_proactive_bridge_send_budget_exceeded`. The formal live run
observed zero non-ThreadMesh tool calls.

The Layer 1 tool-descriptor projection digest was
`sha256:7f8494cfae2877bd5a565d5e8dac14d2b13c4a7b12ce9ec45521dd08efdee81e`.
It includes the run-specific host-bounded target and is an execution
fingerprint, not a release-stable API hash.

### Findings and dispositions

Three failed attempts materially improved the case instead of being discarded:

1. Two clean-main runs at `208f366` completed Pi discovery, send, mailbox,
   acceptance, and cleanup, but failed Kimi's exact outcome marker. A bounded
   replay showed Kimi returning the missing-dependency marker.
2. A third clean-main run at `8310aa6` classified the same result explicitly as
   `threadmesh_pi_kimi_missing_dependency_outcome`.
3. The cause was semantic: the public bridge truthfully labels an agent's
   checksum assertion as `unverified`, while the benchmark asked Kimi to treat
   it as a verified fact. Kimi's refusal was reasonable. The cross-harness case
   was changed to an unverified, non-authoritative release coordination input.
   The checksum scenarios remain in Layer 2, where they test Pi's decision to
   contact or remain silent rather than Kimi's trust in the claim.

An attempted `--agent-file` receiver profile was also rejected during
diagnosis because Kimi documents that surface for experimental print mode, not
ACP. It was not merged. The final implementation uses an isolated
`KIMI_CODE_HOME/SYSTEM.md`, which Kimi
[documents as applying across launch modes](https://moonshotai.github.io/kimi-code/en/customization/agents),
without altering the user's real Kimi home.

No protocol intent, authority, or verified-claim surface was expanded. The fix
made the demonstration conform to the existing advisory semantics.

### Cleanup confirmation

- Pi used `--no-session`; no Pi conversation was persisted.
- Every localhost control plane closed and every temporary SQLite root was
  removed.
- Kimi's exact ACP session was deleted and list-confirmed absent.
- The isolated 0700 Kimi home, including temporary credential copies and
  session/log state, was removed.
- The packed consumer root was removed.
- No transcript, bearer token, task/session identifier, credential, or local
  home path is present in this record.

### Final verdict

**GO** for the bounded integration claim: a real Pi sender can use only the
packaged public ThreadMesh SDK to discover one host-authorized dependency,
select one suggestion, and reach a persistent real Kimi receiver through
mailbox acceptance and audited context admission while irrelevant and control
conditions remain quiet.

This is not a production or universal-interoperability claim. The control plane
is localhost/trusted-process, Pi has no ThreadMesh-provided OS sandbox, Kimi's
accepted peer context remains an ordinary ACP prompt, and the run does not make
unverified peer claims authoritative. Independent human integration feedback
is still required to close issue #79 completely.
