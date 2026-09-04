# Visual asset provenance

## Cross-task moment hero

`threadmesh-cross-task-moment.png` is an image-generation-assisted editorial
recreation of a real Codex UI moment supplied privately by the maintainer. The
source screenshot is intentionally not committed because it contains unrelated
project names and task content.

The hero has one job: make the native provenance line
`由 ChatGPT 从另一项任务发送` legible enough that a new visitor immediately asks
why one agent task contacted another. It is not a product walkthrough,
architecture diagram, live recording, or evidence artifact.

The generated image removes private text, uses neutral placeholder content, and
keeps only the cross-task provenance concept. Behavioral claims are supported
separately by the [real agent case portfolio](../06-guides/real-world-cases.md)
and records under [`docs/09-reviews`](../09-reviews/README.md).

### Generation brief

- use case: high-fidelity UI mockup for a GitHub README hero;
- reference: the private Codex screenshot supplied by the maintainer;
- focal point: the exact cross-task provenance line;
- visual language: bright, restrained, editorial, and close to a native product
  surface;
- exclusions: private content, dashboards, metrics, flowcharts, feature cards,
  terminals, marketing copy, and architecture explanations.

The asset was produced with the built-in OpenAI image-generation tool and then
copied into the repository without modifying the private source image.

## Cinematic cross-task demo

`threadmesh-cross-task-demo.gif` turns the static hero into an 11.6-second,
silent README story. The MP4 is the higher-quality linked version and the cover
captures the native provenance close-up.

The storyboard uses five beats:

1. establish two independent sessions;
2. zoom into Agent A finishing upstream work;
3. draw the relationship as A decides to reach out;
4. move the camera to Session B and magnify the cross-task provenance line;
5. state the product moment: “A reached B before you did.”

This is still an editorial explanation, not a native product recording. The
animation makes the intended causal sequence understandable; it does not add
behavioral evidence beyond the linked case records. Rebuild it on macOS with:

```sh
npm run demo:cross-task-assets
```

The checked-in builder renders deterministic SVG frames, verifies no private
source screenshot is needed, then exports MP4, optimized GIF, and cover assets.
