# Contributing to Image2PCB Art

Image2PCB Art is a browser-local converter for constrained PCB artwork. Contributions should preserve the separation between canonical geometry, manufacturing Gerbers, and review artifacts.

Before opening a pull request:

1. Run `npm test`.
2. Keep the manufacturing ZIP limited to the six allowed Gerber files.
3. Add or update tests for changes to geometry, layer semantics, DRC preflight, or export contracts.
4. Do not treat `READY` as factory approval. External Gerber Viewer, fab DFM, and physical-board evidence remain separate gates.

Please avoid adding user images, generated ZIPs, credentials, or local validation caches to commits.
