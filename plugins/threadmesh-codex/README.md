# ThreadMesh for Codex

A skill-only plugin for relevant advice between explicitly selected Codex tasks.
It uses the desktop host's native task tools. It adds no model, MCP server,
hooks, background service or credentials. It cannot add missing host tools.

## Install the candidate

This checkout includes a repository marketplace. It is a development candidate,
not a plugin published in the public directory. From the repository root, a
maintainer can inspect it without installing, substituting the checkout path:

```sh
codex plugin list --marketplace threadmesh --available --json \
  -c 'marketplaces.threadmesh.source_type="local"' \
  -c 'marketplaces.threadmesh.source="/absolute/path/to/threadmesh"'
```

The per-command overrides do not register the marketplace persistently. On
Codex 0.154.0, running the list command without them did not discover the
unregistered repository marketplace, even from the repository root.

To install this local candidate deliberately:

```sh
codex plugin marketplace add /absolute/path/to/threadmesh
codex plugin add threadmesh-codex@threadmesh
```

These installation commands change your Codex plugin configuration and cache.
They are not run by the inspection command. Restart the desktop app after
changing a local plugin. The CLI must provide `codex plugin`; no Node runtime
or ThreadMesh npm package is required for this skill-only path.

The candidate snapshot can be registered without a manual source checkout or
JSON editing, then installed:

```sh
codex plugin marketplace add fyaic/threadmesh --ref a8a02a0101143d6033de855597e0d7ce291bc5e1
codex plugin add threadmesh-codex@threadmesh
```

This command pins the reviewed source candidate, not a stable release. Do not
assume `main` or an earlier alpha release contains this marketplace. This
candidate has not established a GUI add-from-GitHub path for ordinary users, so distribution still requires the
Codex CLI. It does not yet meet the no-terminal first-use goal.

## Use it with selected tasks

Official documentation says installed skills become available in **new chats
or CLI sessions**. It does not establish plugin hot-loading into existing
chats. A new chat can check package discovery, but cannot substitute for a test
in the user's original selected receiver.

In each selected task, first verify that the installed `threadmesh-codex` skill
is available. If it is missing, leave collaboration off; do not silently create
a replacement task or use a private runtime interface. Existing-task adoption
remains a separate acceptance gate.

Once the skill is available, a short request in each direction is sufficient:

> Use $threadmesh-codex with [selected chat link] for API/client changes. I
> authorize relevant automatic advice to that task; keep our existing decisions.

Copy the peer's **chat deep link**, not a public shared conversation. The skill
checks the selected task, tools, scope and send mode, and explains the idle/send
race before enabling automatic advice. Each task confirms its own readiness;
linking a peer does not activate it. For suggestions without sending, request
**review-only** mode instead. Installing a plugin alone is not consent to send.

Work normally after both ends are ready. Ask **Check ThreadMesh status** for a
read-only result. Say **Stop ThreadMesh collaboration** in each task to stop
both directions. Delivery alone does not establish a correct client edit.

The [desktop guide](https://github.com/fyaic/threadmesh/blob/feat/codex-install-first/docs/06-guides/codex-native-tasks.md) retains the manual
fallback and historical evidence. Loading the package, applying the workflow
manually, and useful original-task collaboration are different checks.

## Sources and validation boundary

Checked against the official documentation and `codex 0.154.0` command help on
2026-10-10:

- [Plugin packaging and repository marketplaces](https://developers.openai.com/plugins/build/plugins)
- [Plugin installation and new-chat availability](https://learn.chatgpt.com/docs/plugins)

The `.codex-plugin/plugin.json` compatibility manifest remains supported. A
successful marketplace listing proves discovery and manifest parsing, not
installation, loaded skill behavior, original-task adoption or a useful handoff.
