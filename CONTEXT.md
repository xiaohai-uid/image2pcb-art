# Image2PCB Art — Domain Context

## Product boundary

Image2PCB Art is a browser-local converter for constrained, no-component PCB artwork. It turns a supported image into a deterministic material-state map, then into physical millimetre geometry and a Gerber RS-274X manufacturing package.

The V1 chain is:

`image → material state map → canonical layer geometry → Gerber RS-274X package → Gerber Viewer → JLCPCB DFM`

Gerber is the V1 primary manufacturing handoff. The manufacturing ZIP contains only the six Gerbers; SVG, metadata, reports, and optional previews are delivered in a separate review ZIP. Neither artifact is a native EasyEDA `.epro` project or a factory approval.

## Vocabulary

- **Material State** — a semantic PCB material combination used by the preview and mapping stages. It contains appearance hints plus layer-presence flags; it is not an SVG and RGB is not manufacturing truth.
- **Canonical Geometry** — board-coordinate geometry in millimetres, independent of the UI renderer. It is the single source for preview and export.
- **Layer Intent** — the meaning of geometry on one layer. Copper, solder-mask coverage candidate, bottom copper, bottom solder-mask coverage candidate, and top silkscreen are distinct intents.
- **Mask Intent** — an explicit per-side material state: `COVER`, `OPEN`, or `DEFAULT`. `DEFAULT` is resolved by the manufacturing profile's `maskDefault.top/bottom` contract before solder-mask opening geometry is emitted.
- **Substrate Exposure** — a Material State flag (`substrateExposed`) marking that a mask opening over it reveals the board substrate itself (bare FR4), so the preview shows that state's own color; states without the flag read as bare FR4 under an opening.
- **Gerber X2 metadata** — each emitted layer also declares standard `FileFunction`, `FilePolarity`, and `Part=Single` attributes. GTS/GBS are machine-declared `Soldermask,Top/Bot` with `Negative` file polarity; X2 polarity is `SPEC_VERIFIED`, while material-to-mask mapping remains `EXTERNAL_UNVERIFIED`.
- **Mapping Verification Status** — the evidence ladder for the material→mask mapping: `SPEC_VERIFIED` (declared per the RS-274X/X2 specification and covered by in-process parser fixtures) → `VIEWER_VERIFIED` (an independent Gerber Viewer renders all six layers matching the preview) → `FAB_VERIFIED` (JLCPCB DFM passes with no blockers and a physical board matches). ADR 0001's `EXTERNAL_UNVERIFIED` means the ladder has not yet advanced past `SPEC_VERIFIED`.
- **Manufacturing Package** — one deterministic ZIP containing only the six root Gerber layers for Gerber Viewer/JLCPCB upload.
- **Review Package** — a separate deterministic ZIP containing the project metadata, manifest, report, guide, review SVGs, and optional PNG previews; it is not a fab upload.
- **READY** — Image2PCB's internal geometry, Gerber parser round-trip, board-outline binding, layer semantic contract, and input gates pass. It does not mean Gerber Viewer, JLCPCB DFM, or physical validation passed.
- **DRC preflight** — copper must meet the profile's measured minimum edge clearance; copper, mask openings, and silkscreen must remain inside the board outline; and the parsed six-layer geometry must agree with each material state's copper/mask/silk intent. This is an artwork-geometry gate, not electrical DRC.
- **BLOCKED** — at least one hard gate failed. A blocked project must not produce the official package.
- **Auto-fix evidence** — browser image quantization may replace copper cells whose measured board-edge clearance is below the profile target or whose corners fall outside a rounded board with FR4. Separate counts are recorded in the report and project manifest; externally supplied canonical geometry remains strictly gated.
- **Experimental Profile** — a preview/manufacturing profile whose real calibration-card and physical-board evidence is not complete. Blue Classic remains Experimental until that evidence exists.
- **Validated Profile** — reserved for a profile that has passed Gerber inspection, JLCPCB DFM, and physical-board comparison.

## Non-goals for V1

- Native EasyEDA `.epro` generation or reverse-engineering.
- Components, pads, nets, holes, electrical DRC, or functional circuits.
- Arbitrary board shapes or automatic factory ordering.
- Treating screen colors as physical material measurements.

## Working constraints

This project has no Git repository or configured MaTt issue tracker yet. The MaTt flow is therefore recorded in Markdown and `.scratch/image2pcb-art/issues/` until repository setup is explicitly approved. No `AGENTS.md` or `CLAUDE.md` is created implicitly.
