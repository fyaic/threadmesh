# Demo asset provenance

`session-initiative-wow.mp4` is a 12-second interaction reenactment designed to
make the project's core product moment legible at a glance. The GIF is the
README hero and the PNG captures its central cross-session notification frame.

It is deliberately labeled **evidence-backed interaction reenactment** in every
frame. It is not a Codex, Pi, or Kimi screen recording and does not reproduce a
private user task. The sequence combines behavior established by three retained
records:

- real Pi autonomous discovery and suggestion to a persistent Kimi session;
- real Codex autonomous discovery and suggestion to Kimi;
- the real Codex lifecycle chain's one kickoff and irrelevant zero-turn control.

The receiver checkpoint UI is explanatory: it visualizes ThreadMesh's tested
accept/defer/reject and context-admission semantics rather than claiming that a
specific harness already renders this exact interface. Rebuild the assets with:

```sh
npm run demo:initiative-assets
```

`threadmesh-proof-walkthrough.mp4` is a 76-second evidence walkthrough. The GIF
is the README preview and the PNG is its cover.

The walkthrough is generated from a fresh successful execution of:

```sh
node bin/threadmesh.mjs demo --json
```

`scripts/build-demo-assets.mjs` asserts the expected workflow accounting,
active-receiver checkpoint behavior, verified dependency result, and cleanup
before rendering any frame. Rebuild it with:

```sh
npm run demo:assets
```

## Claim boundary

This is not a live screen recording and it is not presented as one. It combines:

- fresh deterministic coordinator evidence from the command above;
- retained real Codex behavior evidence from the sixth M5.2 event-pump run;
- explicit labels where that retained run used simulated Git/verifier effects;
- the current real-effects status on `main`.

The visual sequence is an evidence-led explanation of tested behavior, not a
reconstruction of a hidden product UI. The full records remain in
`docs/09-reviews/`.
