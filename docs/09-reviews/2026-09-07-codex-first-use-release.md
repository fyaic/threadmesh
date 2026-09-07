# Codex-first installed-package acceptance

Date: 2026-09-07. Published prerelease: [v0.1.0-alpha.3](https://github.com/fyaic/threadmesh/releases/tag/v0.1.0-alpha.3).

## Outcome

The public first-use command now defaults to Codex, uses its existing login and
model, and requires no Pi installation, second subscription, custom application
fixture, workspace argument or second terminal. It creates two **new** disposable
App Server threads. This is not attachment to existing desktop conversations.

Two actual installed-package copy runs passed. The decisive run used the exact
default CLI command, no runtime/model/provider override, and the unchanged
300-second total limit. It finished in **272.604 seconds**. The earlier diagnostic
finished in **184.050 seconds**, with an explicit bundled executable and a
480-second diagnostic limit; that diagnostic alone was not the release gate.

These are maintainer observations, not independent adoption or a success-rate
estimate. Connection retries still occur; there is no fixed three-minute promise.

## What the models did

Both runs used `openai/gpt-6-astra` under the existing Codex account. The default
run selected the already installed desktop CLI `0.153.1` over PATH CLI `0.145.0`.
No software was installed or updated by that selection; no global model,
provider, authentication, proxy or security configuration was changed.

The retained [ordinary tasks](../../src/workspace/live-scenarios.mjs) and generic
coordination guidance were unchanged. The website first volunteered its
dependency; the brand model later chose to send its actual changed claims.
This is reciprocal, model-selected cooperation, not blind discovery or a
business-specific send instruction.

| Event in the default run | Elapsed |
|---|---:|
| Original B task requested | 1.738 s |
| B voluntarily shares its dependency | 145.939 s |
| A's ordinary brand task requested | 160.185 s |
| A's actual advice durably queued for B | 213.627 s |
| Same native B thread receives delivery-triggered follow-up | 227.076 s |
| B's own native file-change completes | 258.865 s |
| Business assertions and sample cleanup complete | 272.604 s |

| Landing field | Before the handoff | After B's own edit |
|---|---|---|
| Headline | Organise work with Team Hub | Organize work with Member Portal |
| Description | Unlimited projects for your team on the free tier. | The free tier includes up to 5 projects for your team. |
| Signup label | Create my workspace | Create my workspace |
| Protected paid price | $12/month | $12/month |

All three native sends in each run were successful, including B's useful reply.
The unrelated database workstream received zero messages. The native receiver ID
was unchanged, and its post-delivery native patch owned the checked edit.
Both sample process sets stopped. Private logs, native IDs and before/after
files remain local; they are not published with this record.

Event SHA-256 commitments:

- Diagnostic pass: `b7b82df5b30257a18a97205e8d6e91d2e569b7b34e9f606bca16606258fadc9f`
- Default-command pass: `ab70a10e949c26e67524c3d6a2c921e17bf6691b2d99fb70d657c131832b4722`

## Failures that changed the implementation

The [earlier failed candidate](2026-09-07-codex-first-use-candidate.md) remains
available. Native retry notifications had been incorrectly treated as terminal;
that was repaired rather than declaring all reconnects external failures.
A repaired run then recovered B but expired during A at the 300-second limit.

The next exact default command selected PATH CLI `0.145.0`. After connection
retries, the provider explicitly reported that the configured model required a
newer Codex version; it stopped in 118.345 seconds without completing B.
Failure-event hash:
`b547a3d44edb74e8ea0b1986b9c79a5587c05c425217788501ee6cd18e3cbf05`.

The root integrated a first-use-only runtime selector: compare bounded read-only
version probes of PATH and the known macOS desktop bundle; use the newer verified
executable. Equal or unknown PATH versions retain PATH. An explicit absolute
override always wins and is not probed. Other harness launchers are unchanged.
The error hint now explains an outdated runtime instead of reporting a generic
protocol failure. The successful default run followed this fix.

No supported built-in-provider HTTP-only switch was established. The rejected
provider-override experiment was removed. Increasing the total timeout was
considered but **not implemented**: the final default pass used 300 seconds.

## Verification and release boundary

The exact runtime code was installed from a locally packed tarball into a fresh
consumer before the default live run. Later release edits change package version
and documentation, not the tested runtime behavior. The final alpha.3 tarball was
installed into a second fresh consumer: all packaged `src` files are byte-identical
to the default-pass consumer, the Codex module imports, and `threadmesh try`
loads its instructions without calling a model. The native skill is included.

Final tarball SHA-256:
`b8150ef2b9052b34cd0fb69841992f6a90cc9bc4446bceea172189424ad5ae89`.

[PR #164](https://github.com/fyaic/threadmesh/pull/164) merged after both CI jobs
passed. The public release asset was then installed by the documented GitHub URL
into another empty consumer. npm recovered from one connection reset and finished
in about 37 seconds, using an existing dependency cache; this is not a cold-install
benchmark. Its runtime sources again match the live-pass consumer byte for byte.
The public package's no-model `try` and simulated `preview preferences` both passed.
A separately downloaded public asset and GitHub's asset digest match the SHA-256
above. These publication checks did not spend additional model quota or establish
an independent-user live pass.

Regression: 455 tests passed, one optional native test skipped; 55 schema cases
and seven transition cases passed. Runtime-selection fixtures cover newer/equal/
unknown versions and explicit override preservation. No fixture count represents
model reliability. The model-written JavaScript API example remains unavailable
for Codex; this release's Codex example validates structured JSON copy only.

The [native desktop skill](2026-09-07-codex-native-skill.md) is a separate
experimental source-read/plugin package. Its packaging and tabletop review are
not existing-desktop acceptance. Do not transfer this App Server pass to native
GUI adoption, busy-user races, global revocation or cross-harness claims.

The [community follow-up](../10-planning/community-followup-2026-09-07.md) records
the contributor's latest priorities. Per the maintainer's request, no new issue
reply is sent in this increment; accumulate concrete improvements first.
