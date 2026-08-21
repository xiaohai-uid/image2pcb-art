# MaTt Domain Notes

The working domain terms and decisions live in [`../../CONTEXT.md`](../../CONTEXT.md). Keep `Material State`, `Canonical Geometry`, `Layer Intent`, `READY`, `BLOCKED`, `Experimental`, and `Validated` distinct in code and copy.

The highest-value seam is:

```text
generatePCBArtProject(input, config, profile) → PCBArtProjectResult
buildManufacturingPackage(projectResult) → six-Gerber manufacturing ZIP artifact
buildReviewPackage(projectResult) → metadata/review ZIP artifact
```

Material mask semantics are explicit: `maskIntent.top` and `maskIntent.bottom` are each `COVER`, `OPEN`, or `DEFAULT`; `DEFAULT` is resolved through the profile's `maskDefault.top/bottom` setting before becoming GTS/GBS opening geometry.

The DRC preflight is geometry-only: copper clearance is measured, all emitted copper/mask-opening/silkscreen cells must fit the board profile, and parsed Gerber flashes must agree with the source Material State across layers.
