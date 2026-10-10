# ThreadMesh for Codex

A skill-only plugin for relevant advice between explicitly selected Codex tasks.
It uses the desktop host's native task tools. It adds no model, MCP server,
hooks, background service or credentials. It cannot add missing host tools.

This package contains the workflow and its UI metadata. Installation alone does
not activate collaboration or grant permission to send. The instructions below
are self-contained and apply once the installed skill is available.

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

## Sources and validation boundary

Checked against the official documentation and `codex 0.154.0` command help on
2026-10-10:

- [Plugin packaging and repository marketplaces](https://developers.openai.com/plugins/build/plugins)
- [Plugin installation and new-chat availability](https://learn.chatgpt.com/docs/plugins)

The `.codex-plugin/plugin.json` compatibility manifest remains supported. A
successful marketplace listing proves discovery and manifest parsing, not
installation, loaded skill behavior, original-task adoption or a useful handoff.
