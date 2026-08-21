# ADR 0001 — V1 Output Contract

## Status

Accepted for the current vertical slice.

## Decision

V1 exports two deterministic artifacts. The **Gerber RS-274X Manufacturing Package ZIP** contains only `board.GTL`, `board.GBL`, `board.GTS`, `board.GBS`, `board.GTO`, and `board.GKO`, so fab upload tools cannot confuse review assets with manufacturing layers. A separate **Review Package ZIP** contains the manifest, guide, project metadata, manufacturability report, SVGs, and optional previews.

A custom `project.json` remains metadata and must never be described as an EasyEDA project. EasyEDA remains an optional review/debug path, not the primary V1 manufacturing handoff.

## Layer semantics

Material states are converted to layer intent before export. The exporter never adds an opaque full-board background rectangle to an artwork layer.

- Gerber copper and silkscreen layers contain positive geometry for cells whose material state includes that layer.
- Gerber solder-mask layers contain drawn **mask-opening** geometry only for material states whose per-side `maskIntent` is `OPEN`. `COVER` emits no opening; `DEFAULT` resolves to the profile default of covered. The image is emitted with `%LPD%`, while the standard X2 header declares `%TF.FileFunction,Soldermask,Top/Bot*%`, `%TF.FilePolarity,Negative*%`, and `%TF.Part,Single*%`. In this ADR, “positive geometry” means drawn aperture geometry; it does not mean positive Gerber file polarity. The X2 file polarity is `SPEC_VERIFIED`; the material-to-mask mapping remains `EXTERNAL_UNVERIFIED` until an independent Viewer/fab fixture confirms it.
- Gerber board outline is the single closed `board.GKO` path with board lower-left origin, mm units, and no artwork mixed into it.
- Review SVGs use the same canonical geometry, top-left viewBox coordinates, and explicit layer intent metadata.
- DRC preflight measures the minimum copper-to-board-boundary clearance against the profile target, blocks any emitted copper/mask-opening/silkscreen cell outside the board profile, and compares parsed layer flashes back to each Material State. This is a geometry/manufacturing gate, not electrical DRC.

Preview visibility is a view concern only. It does not remove a profile-required manufacturing layer from the ZIP.

## Consequences

The manufacturing package is a directly inspectable RS-274X handoff without pretending to be factory-validated. Tests assert the six-file manufacturing allowlist, deterministic bytes, mm coordinates, parser round-trip, dimensions, explicit `COVER`/`OPEN`/`DEFAULT` mask intent, layer differences, no background rectangle, measured copper clearance, all-layer board containment, cross-layer Material State semantics, and hard-gated export. External Viewer/DFM/physical validation remains a separate release gate.
