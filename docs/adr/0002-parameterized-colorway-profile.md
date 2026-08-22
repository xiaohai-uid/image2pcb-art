# ADR 0002 — Parameterized Colorway Profile and Color-Free Material Identifiers

## Status

Accepted for v1.1.0-rc.1.

## Decision

The manufacturing profile becomes a parameterized template: `buildProfile({ maskColor, finish })` instantiates it from a solder-mask colorway (JLC's standard LPI palette: green, black, red, purple, yellow, blue, white) and a surface finish (HASL, ENIG). `buildMaterials(profile)` derives the six Material States — their labels, display colors, and quantizer targets — from that colorway's layer-composition table, which is the single color source. The silkscreen ink is chosen by the Contrast Guard (white mask ⇒ black ink).

Material State identifiers name the layer combination (`silk`, `maskedCopper`, `openedCopper`, `maskedFr4`, `bareFr4`, `maskedBottomCopper`) and carry no color word. Image-to-material matching uses CIELAB ΔE² (CIE76, D65) directly, replacing the redmean approximation with no compatibility switch.

## Alternatives considered

- **Static per-color profiles** (copy the Blue Classic definition per color): rejected — every new color would duplicate six material definitions and drift; the architecture was already data-driven, so parameterization costs the same and scales for free.
- **Keeping color-named ids with aliases**: rejected — the project's stated principle is to remove obsolete paths, not to maintain alias tables.

## Consequences

Every colorway's color values are placeholders pending physical calibration; all colorways are equally `EXTERNAL_UNVERIFIED` and the release label stays `SOFTWARE RC / PHYSICAL VALIDATION PENDING` for all of them. Perceptual near-collisions between states under some colorways (e.g. ENIG gold vs bare FR4) are surfaced as Collision Warnings, never auto-disabled. Existing exports made before this change reference the old color-named identifiers and do not correspond to current project files; no migration is provided.
