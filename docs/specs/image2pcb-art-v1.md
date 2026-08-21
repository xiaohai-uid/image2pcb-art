# Image2PCB Art — V1 Specification

## Problem

The previous prototype looked like a PCB editor but produced placeholder SVGs, hard-coded manufacturing passes, and eight unconfirmed downloads. A user could not trust that the exported geometry matched the preview or the board dimensions.

## User outcome

For a supported image and supported rectangular board, the user can upload locally, configure the board, inspect the material simulation, receive evidence-backed READY/BLOCKED checks, and download a deterministic six-Gerber manufacturing package plus a separate review package.

## Contract

### Input

- A local PNG, JPEG, or WebP image.
- Rectangular board, 30–300 mm per side.
- Optional square or rounded corners.
- Blue Classic Experimental profile.

### Canonical output

All artwork layers and board outline use the same millimetre width/height and physical extent. Gerber uses `board-lower-left` origin, +X right, +Y up, and RS-274X `FSLAX46Y46` in millimetres. Review SVG uses a top-left viewBox. Both are derived from the same material-state grid used by the preview.

### Package files

```text
image2pcb-<source>-manufacturing.zip  # fab upload; six files only
├── board.GTL                         (Top Copper)
├── board.GBL                         (Bottom Copper)
├── board.GTS                         (Top Solder Mask openings)
├── board.GBS                         (Bottom Solder Mask openings)
├── board.GTO                         (Top Silkscreen)
└── board.GKO                         (Board Outline)

image2pcb-<source>-review.zip         # human/debug review; never the fab upload
├── README.html
├── manifest.json
├── project/project.json
├── review/                           (SVG inspection output)
├── preview/                           (when browser previews are supplied)
└── reports/manufacturability.json
```

### Hard gates

- Source image is present for official export.
- Board dimensions are within 30–300 mm.
- Rounded radius is no more than half the smaller board side.
- Grid dimensions and cell count agree.
- Smallest grid cell is at least 0.25 mm in both axes.
- Copper geometry has at least the profile target edge clearance (0.30 mm for Blue Classic), measured from each emitted cell to the board bounds.
- Every copper cell is contained by the configured board profile; for rounded boards, all four cell corners must remain inside the rounded outline.
- Every emitted copper, solder-mask opening, and silkscreen cell is contained by the configured board profile.
- Grid complexity stays within the V1 package limit.
- Profile and layer contracts are complete.
- Every material declares per-side `maskIntent` as `COVER`, `OPEN`, or `DEFAULT`; `DEFAULT` resolves to the profile's `maskDefault.top/bottom` value (`COVER` or `OPEN`) before GTS/GBS geometry is emitted.
- The Gerber contract declares the expected custom layer semantic, standard X2 `FileFunction`, `FilePolarity`, and `Part=Single`; the in-process parser round-trip matches every emitted layer.
- The parsed Gerber flashes agree with the source Material State for top/bottom copper, top/bottom mask openings, and silkscreen; any cross-layer mismatch blocks export.
- `board.GKO` is one continuous closed path whose bounds match the configured board.

These are conservative Image2PCB rules, not a claim about a factory's limits. Warnings may remain on READY output. BLOCKED output cannot be packaged.

For the browser image path, the quantizer applies one explicit safety cleanup before these gates: copper cells below the profile edge-clearance target or outside a rounded board are replaced with FR4. The counts are recorded as `autoFixes.copperEdgeCells` and `autoFixes.copperRoundedCornerCells`. This is not a silent manufacturing override; it is visible evidence in the report and manifest. Canonical geometry supplied to the core remains strictly gated.

## Verification

1. Deterministic core contract tests.
2. Package contract tests (file list, ZIP validity, Gerber syntax/parser round-trip, SVG dimensions and semantics, board containment, and cross-layer material semantics).
3. Browser upload → configure → READY → manufacturing ZIP and review ZIP download tests.
4. Gerber Viewer fixture: the pre-split mixed archive was historically parsed and rendered by Ucamco; the current six-file package has independent PyGerber syntax/header/render evidence, plus the asymmetric fixture and explicit `COVER`/`OPEN`/`DEFAULT` solder-mask fixture. Re-uploading the current package to Ucamco remains an external review item, as does manual material-state polarity/origin/mirror confirmation.
5. JLCPCB DFM and physical-board evidence before Blue Classic can become Validated.

The handoff evidence file `.scratch/external-validation/current-release-validation.json` binds the exact manufacturing/review artifact hashes to the local validation state. It is an audit aid, not a replacement for external Viewer, DFM, or physical evidence.

## Current release label

`SOFTWARE RC / PHYSICAL VALIDATION PENDING`.
