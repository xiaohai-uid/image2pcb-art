import test from "node:test";
import assert from "node:assert/strict";
import { quantizeMaterialGrid } from "../image-quantizer.mjs";
import {
  buildManufacturingPackage,
  buildReviewPackage,
  buildMaterials,
  buildProfile,
  findCollisions,
  generatePCBArtProject,
  parseGerber,
  renderedMaterialColor,
} from "../pcb-core.mjs";

const materials = [
  { id: "fr4", layers: { topCopper: false, bottomCopper: false, silk: false }, maskIntent: { top: "DEFAULT", bottom: "DEFAULT" } },
  { id: "copper", layers: { topCopper: true, bottomCopper: false, silk: false }, maskIntent: { top: "OPEN", bottom: "DEFAULT" } },
  { id: "masked", layers: { topCopper: true, bottomCopper: false, silk: false }, maskIntent: { top: "COVER", bottom: "DEFAULT" } },
  { id: "bottom", layers: { topCopper: false, bottomCopper: true, silk: false }, maskIntent: { top: "DEFAULT", bottom: "COVER" } },
  { id: "silk", layers: { topCopper: false, bottomCopper: false, silk: true }, maskIntent: { top: "DEFAULT", bottom: "DEFAULT" } },
  { id: "bareFr4", layers: { topCopper: false, bottomCopper: false, silk: false }, maskIntent: { top: "OPEN", bottom: "OPEN" } },
];

test("matches by CIELAB so a pure neutral beats a chromatic metal at similar lightness gap", () => {
  // Worked example: black target; silver L*≈76 chroma≈0 → ΔE 77.8;
  // gold L*≈70 chroma>0 → ΔE 80.5. redmean picks gold (blue-channel overweight);
  // CIELAB must pick silver.
  const data = new Uint8ClampedArray(2 * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index + 3] = 255;
  }

  const result = quantizeMaterialGrid({
    data,
    width: 2,
    height: 1,
    palette: [
      { id: "haslSilver", rgb: [183, 194, 197] },
      { id: "enigGold", rgb: [198, 166, 96] },
    ],
    diffusionStrength: 0,
  });

  assert.equal(result.grid[0], "haslSilver");
});

test("diffuses a mid-tone across material states instead of collapsing it to one flat state", () => {
  const data = new Uint8ClampedArray(8 * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 128;
    data[index + 1] = 128;
    data[index + 2] = 128;
    data[index + 3] = 255;
  }

  const result = quantizeMaterialGrid({
    data,
    width: 8,
    height: 1,
    palette: [
      { id: "dark", rgb: [0, 0, 0] },
      { id: "light", rgb: [255, 255, 255] },
    ],
  });

  assert.deepEqual([...new Set(result.grid)].sort(), ["dark", "light"]);
  assert.ok(result.metrics.averageLuminance > 90 && result.metrics.averageLuminance < 170);
});

test("diffuses serpentine rows in alternating directions so no row collapses to one material", () => {
  const width = 12;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 128;
    data[index + 1] = 128;
    data[index + 2] = 128;
    data[index + 3] = 255;
  }
  const palette = [
    { id: "dark", rgb: [0, 0, 0] },
    { id: "light", rgb: [255, 255, 255] },
  ];

  const result = quantizeMaterialGrid({ data, width, height, palette });
  const validIds = new Set(palette.map((material) => material.id));

  assert.ok(result.grid.every((id) => validIds.has(id)), "every grid cell must resolve to a palette material");
  for (let y = 0; y < height; y += 1) {
    const rowMaterials = new Set(result.grid.slice(y * width, (y + 1) * width));
    assert.ok(rowMaterials.size > 1, `row ${y} should diffuse instead of collapsing to one material`);
  }
  assert.ok(result.metrics.averageLuminance > 90 && result.metrics.averageLuminance < 170);
});

test("treats an invalid diffusion strength as plain nearest-color matching", () => {
  const data = new Uint8ClampedArray(8 * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 128;
    data[index + 1] = 128;
    data[index + 2] = 128;
    data[index + 3] = 255;
  }

  const result = quantizeMaterialGrid({
    data,
    width: 8,
    height: 1,
    palette: [
      { id: "dark", rgb: [0, 0, 0] },
      { id: "light", rgb: [255, 255, 255] },
    ],
    diffusionStrength: Number.NaN,
  });

  assert.equal(new Set(result.grid).size, 1);
});

test("quantizes a single-column image across serpentine rows without crashing", () => {
  const height = 6;
  const data = new Uint8ClampedArray(1 * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 128;
    data[index + 1] = 128;
    data[index + 2] = 128;
    data[index + 3] = 255;
  }

  const result = quantizeMaterialGrid({
    data,
    width: 1,
    height,
    palette: [
      { id: "dark", rgb: [0, 0, 0] },
      { id: "light", rgb: [255, 255, 255] },
    ],
  });

  assert.equal(result.grid.length, height);
  assert.ok(result.grid.every((id) => id === "dark" || id === "light"));
});

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
    profile: buildProfile(),
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
    profile: { ...buildProfile(), maskDefault: { top: "OPEN", bottom: "COVER" } },
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

test("blocks export when a maskIntent value is not a recognized intent", () => {
  const invalidMaterials = materials.map((material, index) => index === 0
    ? { ...material, maskIntent: { top: "open", bottom: "COVER" } }
    : material);
  const project = makeProject({ materials: invalidMaterials });

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

test("measures copper clearance to rounded corner arcs, not only straight edges", () => {
  // 40x40 board, r=10 corners, 1mm cells. The copper cell at grid (row 3, col 3)
  // maps to board rectangle x:3-4, y:36-37. Its corner (3, 37) sits sqrt(98) ≈
  // 9.899 mm from the top-left arc centre (10, 30), i.e. only ~0.101 mm inside
  // the routed edge — yet all four corners are inside the board, so a
  // straight-edge-only check wrongly reports a 3 mm clearance.
  const grid = Array(40 * 40).fill("fr4");
  grid[3 * 40 + 3] = "copper";
  const project = makeProject({
    grid,
    gridSize: { cols: 40, rows: 40 },
    board: { width: 40, height: 40, rounded: true, radius: 10 },
  });
  assert.equal(project.report.status, "BLOCKED");
  const edgeCheck = project.report.checks.find((check) => check.id === "copper-edge-clearance");
  assert.equal(edgeCheck.pass, false);
  assert.ok(
    project.report.evidence.copperMinimumEdgeClearanceMm < buildProfile().rules.minCopperEdgeClearanceMm,
    `arc clearance should be below ${buildProfile().rules.minCopperEdgeClearanceMm}, got ${project.report.evidence.copperMinimumEdgeClearanceMm}`,
  );
});

test("keeps copper that clears the rounded corner arcs READY", () => {
  const grid = Array(40 * 40).fill("fr4");
  grid[6 * 40 + 6] = "copper";
  const project = makeProject({
    grid,
    gridSize: { cols: 40, rows: 40 },
    board: { width: 40, height: 40, rounded: true, radius: 10 },
  });
  assert.equal(project.report.status, "READY");
  const edgeCheck = project.report.checks.find((check) => check.id === "copper-edge-clearance");
  assert.equal(edgeCheck.pass, true);
  assert.ok(project.report.evidence.copperMinimumEdgeClearanceMm >= buildProfile().rules.minCopperEdgeClearanceMm);
});

test("does not apply corner-arc clearance outside the corner quadrants", () => {
  // 40x40 board, r=10 corners, 1mm cells. The copper cell at grid (row 18,
  // col 10) maps to screen rectangle x:10-11, y:18-19 — directly below the
  // top-left arc centre (and outside its quadrant). Its true nearest boundary
  // is the straight left edge at 10 mm; the arc must not pull the reported
  // clearance down to ~0.94 mm.
  const grid = Array(40 * 40).fill("fr4");
  grid[18 * 40 + 10] = "copper";
  const project = makeProject({
    grid,
    gridSize: { cols: 40, rows: 40 },
    board: { width: 40, height: 40, rounded: true, radius: 10 },
  });
  assert.equal(project.report.status, "READY");
  assert.ok(project.report.evidence.copperMinimumEdgeClearanceMm >= buildProfile().rules.minCopperEdgeClearanceMm);
});

test("renders each board face with physically-correct material colors", () => {
  const profile = buildProfile();
  const materials = new Map(buildMaterials(profile).map((material) => [material.id, material]));
  const allOn = { topCopper: true, topMask: true, bottomCopper: true, bottomMask: true, silk: true };
  const render = (id, side, visibility = allOn) =>
    renderedMaterialColor({ material: materials.get(id), side, visibility, profile });
  // Independent expected literals from the Blue Classic placeholder table:
  const OVER_COPPER = "#4e8da5";
  const OVER_FR4 = "#28647b";
  const HASL = "#b7c2c5";
  const BARE_FR4 = "#b79a6b";
  const SILK_INK = "#eeeadd";

  // Top face: bottom copper is invisible (FR4 is opaque); silk only on top.
  assert.equal(render("maskedBottomCopper", "top"), OVER_FR4);
  assert.equal(render("silk", "top"), SILK_INK);
  assert.equal(render("silk", "top", { ...allOn, silk: false }), OVER_FR4);
  assert.equal(render("openedCopper", "top"), HASL);
  assert.equal(render("openedCopper", "top", { ...allOn, topMask: false }), HASL);
  assert.equal(render("openedCopper", "top", { ...allOn, topCopper: false }), OVER_FR4);
  assert.equal(render("maskedCopper", "top"), OVER_COPPER);
  assert.equal(render("bareFr4", "top"), BARE_FR4);

  // Bottom face: bottom art shows; top-only features do not.
  // Physically the back face is mask-over-copper, not the darkened identity tone.
  assert.equal(render("maskedBottomCopper", "bottom"), OVER_COPPER);
  assert.equal(render("silk", "bottom"), OVER_FR4);
  assert.equal(render("maskedCopper", "bottom"), OVER_FR4);
  assert.equal(render("bareFr4", "bottom"), BARE_FR4);

  // Exposed bottom copper (mask OPEN) reads as the finish metal, not its covered color.
  const exposedBottom = { ...materials.get("maskedBottomCopper"), maskIntent: { top: "COVER", bottom: "OPEN" } };
  assert.equal(renderedMaterialColor({ material: exposedBottom, side: "bottom", visibility: allOn, profile }), HASL);
  assert.equal(
    renderedMaterialColor({ material: exposedBottom, side: "bottom", visibility: { ...allOn, bottomCopper: false }, profile }),
    OVER_FR4,
  );

  // A mask opening over a non-substrate, non-copper face shows bare FR4, not its own color.
  const noSubstrateFlag = { ...materials.get("bareFr4"), substrateExposed: false, color: "#123456" };
  assert.equal(renderedMaterialColor({ material: noSubstrateFlag, side: "top", visibility: allOn, profile }), BARE_FR4);
});

test("buildProfile parameterizes the manufacturing profile by colorway", () => {
  const blue = buildProfile();
  assert.deepEqual(blue.params, { maskColor: "blue", finish: "hasl", layerCount: 2 });
  assert.equal(blue.name, "Blue Classic");
  assert.equal(blue.rules.minCopperEdgeClearanceMm, 0.3);
  assert.deepEqual(blue.maskDefault, { top: "COVER", bottom: "COVER" });

  const green = buildProfile({ maskColor: "green", finish: "enig" });
  assert.equal(green.name, "Green Classic");
  assert.deepEqual(green.params, { maskColor: "green", finish: "enig", layerCount: 2 });
});

test("buildMaterials derives every state color from the active colorway", () => {
  const blue = buildMaterials(buildProfile());
  const blueById = new Map(blue.map((material) => [material.id, material]));
  assert.deepEqual(
    blue.map((material) => material.id),
    ["silk", "openedCopper", "maskedCopper", "maskedFr4", "bareFr4", "maskedBottomCopper"],
  );
  // Blue Classic keeps its calibrated placeholder values.
  assert.deepEqual(blueById.get("maskedCopper").rgb, [78, 141, 165]);
  assert.deepEqual(blueById.get("maskedFr4").rgb, [40, 100, 123]);
  assert.deepEqual(blueById.get("openedCopper").rgb, [183, 194, 197]);
  assert.deepEqual(blueById.get("bareFr4").rgb, [183, 154, 107]);
  assert.deepEqual(blueById.get("silk").rgb, [238, 234, 221]);

  // Switching colorway rebuilds copper/mask tones; FR4 base is colorway-independent.
  const green = buildMaterials(buildProfile({ maskColor: "green" }));
  const greenById = new Map(green.map((material) => [material.id, material]));
  assert.deepEqual(greenById.get("maskedCopper").rgb, [30, 122, 62]);
  assert.deepEqual(greenById.get("maskedFr4").rgb, [18, 82, 45]);
  assert.deepEqual(greenById.get("bareFr4").rgb, [183, 154, 107]);

  // Surface finish drives the exposed-copper tone.
  const enig = buildMaterials(buildProfile({ finish: "enig" }));
  const enigById = new Map(enig.map((material) => [material.id, material]));
  assert.deepEqual(enigById.get("openedCopper").rgb, [198, 166, 96]);
});

test("contrast guard swaps silkscreen ink when it would vanish into the mask", () => {
  const blueSilk = buildMaterials(buildProfile()).find((m) => m.id === "silk");
  assert.deepEqual(blueSilk.rgb, [238, 234, 221]);

  const whiteMaskSilk = buildMaterials(buildProfile({ maskColor: "white" })).find((m) => m.id === "silk");
  assert.deepEqual(whiteMaskSilk.rgb, [38, 38, 40]);
});

test("collision warnings surface near-identical tones without disabling them", () => {
  const closePair = [
    { id: "a", rgb: [198, 166, 96] },
    { id: "b", rgb: [192, 160, 90] },
  ];
  assert.deepEqual(findCollisions(closePair), [{ ids: ["a", "b"], deltaE: findCollisions(closePair)[0].deltaE }]);
  assert.ok(findCollisions(closePair)[0].deltaE < 12);

  const distinct = buildMaterials(buildProfile());
  assert.deepEqual(findCollisions(distinct), []);
});
