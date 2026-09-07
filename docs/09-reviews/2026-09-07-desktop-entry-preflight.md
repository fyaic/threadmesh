# Desktop entry preflight

Date: 2026-09-07. Baseline: `19a9b13`.
Scope: [desktop-first entry](../10-planning/desktop-entry-2026-09-07.md).

## Result: developer preparation passed; native desktop acceptance pending

### Delegated integration follow-up

Three bounded lanes completed: [Codex](2026-09-07-codex-desktop-lane.md),
[ZCode](2026-09-07-zcode-desktop-lane.md), and
[independent internal review](2026-09-07-desktop-independent-review.md).
The main agent integrated a no-write MCP identity diagnostic, corrected
SessionId/ThreadId handling, and selected the runtime-verified camelCase
`mcpServers` configuration. An unused hook-rewrite alternative was discarded.

Final local regression: **422 passed, 1 optional native test skipped**, including
15 targeted desktop tests. Schema/state checks remain 55 + 7 passed; 129 standard
Markdown documents plus the experiment guide lint cleanly. Plugin Creator's
validator passes. The main agent independently repeated the actual passive
Codex endpoint probe: runtime 0.153.1, default control socket absent, zero model
calls and zero chat operations. No private fallback endpoint was attempted.

The original table below records the earlier preflight. Native installation,
old-conversation adoption, actual metadata receipt and peer delivery are still
**unexecuted**. Installing the probe and creating disposable GUI test
conversations require explicit operator coordination. No global plugin/trust
configuration changed in this increment.

### Original preflight

| Check | Result | What it establishes |
|---|---|---|
| Official extension review | Completed; linked in the plan | Documented seams, not installed-host behavior |
| Local version inventory | ChatGPT desktop 26.901.31953 / bundled Codex 0.153.1; ZCode 3.10.2 | Installed versions, not compatibility certification |
| ZCode settings inspection | Plugins, MCP Servers, Hooks visible; Plugins screen opened | A real GUI entry point exists; no installation performed |
| Probe subprocess and fixtures | 5 passed | Identity correlation, projection privacy, invalid-input handling, packaging consistency |
| Codex plugin manifest validator | Passed | Manifest shape only, not native loading |
| Full unit regression | 412 passed, 1 optional native test skipped, 0 failed | Existing runtime and new fixtures; no desktop live proof |
| Schema/state validation | 55 schema cases, 7 transition cases passed | Unchanged protocol regressions |
| Documentation | Markdown lint and diff whitespace checks passed | Source quality, not usability |
| Native probe installation | Not performed | Host trust and pickup still pending |
| Existing desktop receiver delivery/wake | Not performed | Still the main capability gap |

Commands from the repository root:

```sh
node --test test/desktop-probe.test.mjs
npm run test:unit
npm run validate:spec
npm run lint:docs
npx markdownlint-cli2 'experiments/desktop/**/*.md'
git diff --check
```

The local Plugin Creator validator also passed with PyYAML in an isolated
`uv run --no-project --with PyYAML` environment. Initial system/bundled Python
attempts lacked PyYAML; no dependency was added to ThreadMesh or global Python.

No model requests, plugin installation, global configuration edits, trust
changes, desktop restarts or cross-session sends were performed. No private
transcript files were read and no screenshots or unrelated chat content were
published. The probe is developer tooling, not a user installation path.

Next evidence must come from the native procedure in the
[probe guide](../../experiments/desktop/threadmesh-desktop-probe/README.md),
then an attributed message reaching the same opted-in desktop receiver through
a supported host interface. Neither a fixture marker nor an MCP receipt closes
that gate. Prior CLI successes and copy-quality failure remain unchanged.
