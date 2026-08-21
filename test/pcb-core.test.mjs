import test from "node:test";
import assert from "node:assert/strict";
import {
  BLUE_CLASSIC_PROFILE,
  buildManufacturingPackage,
  buildReviewPackage,
  generatePCBArtProject,
  parseGerber,
} from "../pcb-core.mjs";

const materials = [
  { id: "fr4", layers: { topCopper: false, bottomCopper: false, silk: false }, maskIntent: { top: "DEFAULT", bottom: "DEFAULT" } },
  { id: "copper", layers: { topCopper: true, bottomCopper: false, silk: false }, maskIntent: { top: "OPEN", bottom: "DEFAULT" } },
  { id: "masked", layers: { topCopper: true, bottomCopper: false, silk: false }, maskIntent: { top: "COVER", bottom: "DEFAULT" } },
  { id: "bottom", layers: { topCopper: false, bottomCopper: true, silk: false }, maskIntent: { top: "DEFAULT", bottom: "COVER" } },
  { id: "silk", layers: { topCopper: false, bottomCopper: false, silk: true }, maskIntent: { top: "DEFAULT", bottom: "DEFAULT" } },
  { id: "bareFr4", layers: { topCopper: false, bottomCopper: false, silk: false }, maskIntent: { top: "OPEN", bottom: "OPEN" } },
];

function makeProject(overrides = {}) {
  return generatePCBArtProject({
    grid: [
      "fr4", "fr4", "fr4", "fr4",
      "fr4", "copper", "masked", "silk",
      "fr4", "fr4", "fr4", "fr4",
    ],
    gridSize: { cols: 4, rows: 3 },
    board: { width: 100, height: 80, rounded: true, radius: 4 },
    materials,
    source: { fileName: "fixture.png", width: 640, height: 480 },
    imagePresent: true,
    adjustments: { detail: 62, smoothing: 28, cropFocus: 50, brightness: 0, contrast: 0 },
    profile: BLUE_CLASSIC_PROFILE,
    ...overrides,
  });
}

test("generates aligned layer SVGs without an opaque board background", () => {
  const project = makeProject();
  assert.equal(project.report.status, "READY");
  assert.match(project.layers.topCopper, /data-layer-intent="top-copper"/);
  assert.match(project.layers.topCopper, /fill="#000000"/);
  assert.doesNotMatch(project.layers.topCopper, /<rect width="100" height="80" fill="#000000"/);
  assert.match(project.layers.topMask, /data-layer-intent="top-soldermask-coverage-candidate"/);
  assert.match(project.boardOutlineSvg, /fill="none"/);
  assert.doesNotMatch(project.boardOutlineSvg, /fill="#000000"/);
  assert.match(project.gerbers.topCopper, /%FSLAX46Y46\*%/);
  assert.match(project.gerbers.topCopper, /%MOMM\*%/);
  assert.equal(project.gerberValidation.pass, true);
  assert.equal(project.gerberValidation.semanticPass, true);
  assert.equal(project.gerberValidation.crossLayerSemanticPass, true);
  assert.equal(project.gerberValidation.outlinePass, true);
  assert.ok(project.report.checks.some((check) => check.id === "board-outline-binding" && check.pass));
  assert.ok(project.report.checks.some((check) => check.id === "layer-semantic-contract" && check.pass));
  const parsedTopCopper = parseGerber(project.gerbers.topCopper);
  const parsedOutline = parseGerber(project.gerbers.boardOutline);
  assert.equal(parsedTopCopper.units, "MM");
  assert.equal(parsedTopCopper.format, "X46Y46");
  assert.equal(parsedTopCopper.semantic, "top-copper-present");
  assert.equal(parsedTopCopper.declaredPolarity, "POSITIVE_GEOMETRY");
  assert.equal(parsedTopCopper.fileFunction, "Copper,L1,Top");
  assert.equal(parsedTopCopper.filePolarity, "Positive");
  assert.equal(parsedTopCopper.part, "Single");
  const parsedTopMask = parseGerber(project.gerbers.topMask);
  assert.equal(parsedTopMask.fileFunction, "Soldermask,Top");
  assert.equal(parsedTopMask.filePolarity, "Negative");
  assert.equal(parsedTopMask.part, "Single");
  assert.equal(parseGerber(project.gerbers.boardOutline).fileFunction, "Profile,NP");
  assert.equal(parsedTopCopper.flashes[0].x, 37.5);
  assert.equal(parsedTopCopper.flashes[0].y, 40);
  assert.equal(parsedOutline.moveCount, 1);
  assert.ok(parsedOutline.segments.length >= 4);
  assert.deepEqual(parsedOutline.bbox, { minX: 0, minY: 0, maxX: 100, maxY: 80 });

  for (const svg of Object.values(project.layers)) {
    assert.match(svg, /width="100mm" height="80mm" viewBox="0 0 100 80"/);
    assert.match(svg, /data-origin="top-left" data-units="mm"/);
  }
  assert.match(project.boardOutlineSvg, /width="100mm" height="80mm" viewBox="0 0 100 80"/);
});

test("blocks official export when there is no source image", () => {
  const project = makeProject({ imagePresent: false, source: { fileName: "Calibration sample", width: null, height: null } });
  assert.equal(project.report.status, "BLOCKED");
  assert.ok(project.report.checks.some((check) => check.id === "source-image" && !check.pass));
  assert.throws(() => buildManufacturingPackage(project), /BLOCKED/);
});

test("blocks copper geometry that touches the routed board edge", () => {
  const project = makeProject({
    grid: [
      "copper", "fr4", "fr4", "fr4",
      "fr4", "fr4", "fr4", "fr4",
      "fr4", "fr4", "fr4", "fr4",
    ],
  });
  assert.equal(project.report.status, "BLOCKED");
  assert.ok(project.report.checks.some((check) => check.id === "copper-edge-clearance" && !check.pass));
});

test("blocks copper that is inside the edge ring but closer than the configured clearance", () => {
  const gridSize = { cols: 107, rows: 100 };
  const grid = Array.from({ length: gridSize.cols * gridSize.rows }, () => "fr4");
  grid[gridSize.cols + 1] = "copper";
  const project = makeProject({
    board: { width: 30, height: 30, rounded: false, radius: 0 },
    grid,
    gridSize,
  });

  assert.equal(project.report.status, "BLOCKED");
  const clearanceCheck = project.report.checks.find((check) => check.id === "copper-edge-clearance");
  assert.equal(clearanceCheck.pass, false);
  assert.match(clearanceCheck.detail, /0\.28 mm minimum/);
  assert.equal(project.report.evidence.copperMinimumEdgeClearanceMm < 0.3, true);
});

test("blocks copper cells that extend outside a rounded board corner", () => {
  const gridSize = { cols: 10, rows: 10 };
  const grid = Array.from({ length: gridSize.cols * gridSize.rows }, () => "fr4");
  grid[gridSize.cols + 1] = "copper";
  const project = makeProject({
    board: { width: 30, height: 30, rounded: true, radius: 15 },
    grid,
    gridSize,
  });

  assert.equal(project.report.status, "BLOCKED");
  const clearanceCheck = project.report.checks.find((check) => check.id === "copper-edge-clearance");
  assert.equal(clearanceCheck.pass, false);
  assert.match(clearanceCheck.detail, /rounded-board violation/);
  assert.equal(project.report.evidence.copperRoundedCornerViolations, 1);
});

test("blocks non-copper manufacturing geometry outside a rounded board corner", () => {
  const gridSize = { cols: 10, rows: 10 };
  const grid = Array.from({ length: gridSize.cols * gridSize.rows }, () => "fr4");
  grid[gridSize.cols + 1] = "silk";
  const project = makeProject({
    board: { width: 30, height: 30, rounded: true, radius: 15 },
    grid,
    gridSize,
  });

  assert.equal(project.report.status, "BLOCKED");
  assert.ok(project.report.checks.some((check) => check.id === "layer-board-containment" && !check.pass));
  assert.equal(project.report.evidence.layerBoardContainmentViolationCount, 1);
});

test("preserves lower-left Gerber Y direction for asymmetric bottom geometry", () => {
  const grid = Array.from({ length: 20 }, () => "fr4");
  grid[6] = "bottom"; // x=1, y=1: upper half in the review grid
  grid[13] = "bottom"; // x=3, y=2: lower half in the review grid
  const project = makeProject({ grid, gridSize: { cols: 5, rows: 4 } });
  assert.equal(project.report.status, "READY");
  const parsed = parseGerber(project.gerbers.bottomCopper);
  assert.deepEqual(parsed.flashes.map(({ x, y }) => ({ x, y })), [
    { x: 30, y: 50 },
    { x: 70, y: 30 },
  ]);
  assert.equal(project.gerberValidation.pass, true);
});

test("preserves solder-mask covered/opening intent in the Gerber contract", () => {
  const project = makeProject({
    grid: [
      "fr4", "fr4", "fr4", "fr4",
      "fr4", "copper", "masked", "fr4",
      "fr4", "fr4", "fr4", "fr4",
    ],
  });
  const topCopper = parseGerber(project.gerbers.topCopper);
  const topMask = parseGerber(project.gerbers.topMask);

  assert.deepEqual(topCopper.flashes.map(({ x, y }) => ({ x, y })), [
    { x: 37.5, y: 40 },
    { x: 62.5, y: 40 },
  ]);
  assert.equal(topMask.fileFunction, "Soldermask,Top");
  assert.equal(topMask.filePolarity, "Negative");
  assert.ok(topMask.flashes.some(({ x, y }) => x === 37.5 && y === 40), "unmasked copper must be an opening");
  assert.ok(!topMask.flashes.some(({ x, y }) => x === 62.5 && y === 40), "masked copper must not be an opening");
  assert.equal(project.report.gerberValidation.semanticPass, true);
});

test("keeps DEFAULT FR4 covered and only emits explicit OPEN mask intent", () => {
  const project = makeProject({
    grid: ["fr4", "bareFr4", "fr4", "fr4"],
    gridSize: { cols: 4, rows: 1 },
  });
  const topMask = parseGerber(project.gerbers.topMask);
  const bottomMask = parseGerber(project.gerbers.bottomMask);

  assert.deepEqual(topMask.flashes.map(({ x, y }) => ({ x, y })), [{ x: 37.5, y: 40 }]);
  assert.deepEqual(bottomMask.flashes.map(({ x, y }) => ({ x, y })), [{ x: 37.5, y: 40 }]);
  assert.equal(project.gerberValidation.maskIntentPass, true);
  assert.equal(project.report.status, "READY");
});

test("resolves DEFAULT mask intent through the manufacturing profile", () => {
  const project = makeProject({
    board: { width: 100, height: 80, rounded: false, radius: 0 },
    profile: { ...BLUE_CLASSIC_PROFILE, maskDefault: { top: "OPEN", bottom: "COVER" } },
    grid: Array.from({ length: 12 }, () => "fr4"),
    gridSize: { cols: 4, rows: 3 },
  });

  assert.equal(parseGerber(project.gerbers.topMask).flashes.length, 12);
  assert.equal(parseGerber(project.gerbers.bottomMask).flashes.length, 0);
  assert.equal(JSON.parse(project.projectJson).profile.maskDefault.top, "OPEN");
  assert.equal(project.report.status, "READY");
});

test("blocks export when a material omits one side of maskIntent", () => {
  const incompleteMaterials = materials.map((material, index) => index === 0
    ? { ...material, maskIntent: { top: "DEFAULT" } }
    : material);
  const project = makeProject({ materials: incompleteMaterials });

  assert.equal(project.report.status, "BLOCKED");
  assert.ok(project.report.checks.some((check) => check.id === "mask-intent-contract" && !check.pass));
  assert.throws(() => buildManufacturingPackage(project), /BLOCKED/);
});

test("returns a deterministic ZIP with a stable manufacturing package contract", () => {
  const project = makeProject();
  const first = buildManufacturingPackage(project);
  const second = buildManufacturingPackage(makeProject());
  assert.deepEqual(first.fileNames, [
    "board.GBL",
    "board.GBS",
    "board.GKO",
    "board.GTL",
    "board.GTO",
    "board.GTS",
  ]);
  assert.equal(first.fileCount, 6);
  assert.equal(first.bytes[0], 0x50);
  assert.equal(first.bytes[1], 0x4b);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.manifest.primaryFormat, "RS-274X");
  assert.equal(first.manifest.drillRequired, false);
  assert.equal(first.manifest.gerberFilePolarityStatus, "SPEC_VERIFIED");
  assert.equal(first.manifest.materialMaskMappingStatus, "EXTERNAL_UNVERIFIED");
  assert.equal(first.manifest.gerberLayers.every((layer) => layer.part === "Single"), true);
  assert.deepEqual(first.manifest.gerberLayers.find((layer) => layer.fileName === "board.GTS"), {
    fileName: "board.GTS",
    semantic: "top-soldermask-openings",
    fileFunction: "Soldermask,Top",
    filePolarity: "Negative",
    part: "Single",
    polarityStatus: "POLARITY_UNVERIFIED",
  });
  const drcPreflight = JSON.parse(project.projectJson).manufacturing.drcPreflight;
  assert.equal(drcPreflight.scope, "Image2PCB geometry and Gerber contract");
  assert.equal(drcPreflight.copperEdgeClearanceTargetMm, 0.3);
  assert.equal(drcPreflight.copperMinimumEdgeClearanceMm, 25);
  assert.equal(drcPreflight.copperRoundedCornerViolations, 0);
  assert.equal(drcPreflight.layerBoardContainmentViolationCount, 0);
  assert.equal(drcPreflight.crossLayerSemanticPass, true);
  const manufacturingZipText = new TextDecoder().decode(first.bytes);
  for (const fileName of first.fileNames) assert.ok(manufacturingZipText.includes(fileName), fileName);
  assert.doesNotMatch(manufacturingZipText, /\.svg|\.png|\.html|\.json/);

  const review = buildReviewPackage(project, { previewDataUrls: {} });
  assert.deepEqual(review.fileNames, [
    "README.html",
    "manifest.json",
    "project/project.json",
    "reports/manufacturability.json",
    "review/board-outline.svg",
    "review/layers/bottom-copper.svg",
    "review/layers/bottom-soldermask.svg",
    "review/layers/top-copper.svg",
    "review/layers/top-silkscreen.svg",
    "review/layers/top-soldermask.svg",
  ]);
  const reviewZipText = new TextDecoder().decode(review.bytes);
  assert.match(reviewZipText, /review\/layers\/top-soldermask\.svg/);
  assert.ok(review.fileNames.every((fileName) => !fileName.startsWith("board.")), "review ZIP must not contain manufacturing Gerbers");
});
