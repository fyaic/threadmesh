# Security Policy

ThreadMesh is pre-alpha and should not be used to authorize production agent actions.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities that could expose task content, bypass coordination permissions, forge provenance, interrupt unrelated tasks, or execute unauthorized actions.

Use GitHub private vulnerability reporting when it is enabled for this repository. If it is unavailable, contact the maintainers privately through the organization profile before sharing technical details.

Include:

- affected component or document;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- impact on confidentiality, integrity, availability, or user intent;
- suggested mitigation, if known.

## Security-sensitive areas

- task discovery and metadata leakage;
- sender identity and provenance forgery;
- authorization between parent, child, peer, and user-owned tasks;
- stale `steer` or `interrupt` requests;
- replay and duplicate delivery;
- prompt injection through coordination content;
- adapter privilege mismatches;
- audit-log tampering;
- cross-tenant routing.

## Supported versions

There are no supported releases yet. Security fixes will be applied to the default branch until a release policy is published.
