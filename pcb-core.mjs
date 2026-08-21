const textEncoder = new TextEncoder();

export const LAYER_DEFINITIONS = Object.freeze([
  {
    id: "topCopper",
    shortLabel: "F.Cu",
    label: "Top Copper",
    fileName: "top-copper.svg",
    intent: "top-copper",
    polarity: "positive",
  },
  {
    id: "topMask",
    shortLabel: "F.Mask",
    label: "Top Solder Mask",
    fileName: "top-soldermask.svg",
    intent: "top-soldermask-coverage-candidate",
    polarity: "positive",
  },
  {
    id: "bottomCopper",
    shortLabel: "B.Cu",
    label: "Bottom Copper",
    fileName: "bottom-copper.svg",
    intent: "bottom-copper",
    polarity: "positive",
  },
  {
    id: "bottomMask",
    shortLabel: "B.Mask",
    label: "Bottom Solder Mask",
    fileName: "bottom-soldermask.svg",
    intent: "bottom-soldermask-coverage-candidate",
    polarity: "positive",
  },
  {
    id: "silk",
    shortLabel: "F.Silk",
    label: "Top Silkscreen",
    fileName: "top-silkscreen.svg",
    intent: "top-silkscreen",
    polarity: "positive",
  },
]);

export const GERBER_DEFINITIONS = Object.freeze([
  { id: "topCopper", fileName: "board.GTL", label: "Top Copper", semantic: "top-copper-present", fileFunction: "Copper,L1,Top", filePolarity: "Positive" },
  { id: "bottomCopper", fileName: "board.GBL", label: "Bottom Copper", semantic: "bottom-copper-present", fileFunction: "Copper,L2,Bot", filePolarity: "Positive" },
  { id: "topMask", fileName: "board.GTS", label: "Top Solder Mask", semantic: "top-soldermask-openings", polarityStatus: "POLARITY_UNVERIFIED", fileFunction: "Soldermask,Top", filePolarity: "Negative" },
  { id: "bottomMask", fileName: "board.GBS", label: "Bottom Solder Mask", semantic: "bottom-soldermask-openings", polarityStatus: "POLARITY_UNVERIFIED", fileFunction: "Soldermask,Bot", filePolarity: "Negative" },
  { id: "silk", fileName: "board.GTO", label: "Top Silkscreen", semantic: "top-silkscreen-present", fileFunction: "Legend,Top", filePolarity: "Positive" },
  { id: "boardOutline", fileName: "board.GKO", label: "Board Outline", semantic: "board-outline", fileFunction: "Profile,NP", filePolarity: "Positive" },
]);

export const MASK_INTENTS = Object.freeze(["COVER", "OPEN", "DEFAULT"]);

export const BLUE_CLASSIC_PROFILE = Object.freeze({
  id: "blue-classic",
  name: "Blue Classic",
  version: "candidate-0.1",
  validationStatus: "experimental",
  rulesVersion: "v1-conservative-artwork",
  rules: Object.freeze({
    minFeatureMm: 0.25,
    minCopperEdgeClearanceMm: 0.3,
    maxGridCells: 24000,
  }),
  maskDefault: Object.freeze({ top: "COVER", bottom: "COVER" }),
  layers: Object.freeze(LAYER_DEFINITIONS.map((layer) => layer.id)),
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function mm(value) {
  return Number(finiteNumber(value).toFixed(4)).toString();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}

function normalizeBoard(board = {}) {
  const width = finiteNumber(board.width);
  const height = finiteNumber(board.height);
  const rounded = Boolean(board.rounded);
  const radius = rounded ? Math.max(0, finiteNumber(board.radius)) : 0;
  return { width, height, rounded, radius };
}

function normalizeSource(source = {}) {
  return {
    fileName: source.fileName || "artwork",
    width: Number.isFinite(Number(source.width)) ? Number(source.width) : null,
    height: Number.isFinite(Number(source.height)) ? Number(source.height) : null,
  };
}

function materialMap(materials = []) {
  return new Map(materials.map((material) => [material.id, material]));
}

function hasLayer(material, layerId) {
  return Boolean(material?.layers?.[layerId]);
}

function maskSideForLayer(layerId) {
  if (layerId === "topMask") return "top";
  if (layerId === "bottomMask") return "bottom";
  return null;
}

function maskIntentForLayer(material, layerId) {
  const side = maskSideForLayer(layerId);
  return side ? material?.maskIntent?.[side] : null;
}

function resolvedMaskIntentForLayer(material, layerId, profile) {
  const side = maskSideForLayer(layerId);
  const intent = maskIntentForLayer(material, layerId);
  if (intent !== "DEFAULT") return intent;
  return profile?.maskDefault?.[side] || null;
}

function isValidMaskIntent(material, side) {
  return MASK_INTENTS.includes(material?.maskIntent?.[side]);
}

function maskIntentContractPass(materials) {
  return [...materials.values()].every((material) => isValidMaskIntent(material, "top") && isValidMaskIntent(material, "bottom"));
}

function maskDefaultContractPass(profile) {
  return ["top", "bottom"].every((side) => ["COVER", "OPEN"].includes(profile?.maskDefault?.[side]));
}

function isMaskCovered(material, layerId, profile) {
  return resolvedMaskIntentForLayer(material, layerId, profile) === "COVER";
}

function isMaskOpening(material, layerId, profile) {
  return resolvedMaskIntentForLayer(material, layerId, profile) === "OPEN";
}

function activeCellIndexes(grid, gridSize, materials, layerId, profile = BLUE_CLASSIC_PROFILE) {
  const { cols, rows } = gridSize;
  const output = [];
  for (let index = 0; index < grid.length; index += 1) {
    const material = materials.get(grid[index]);
    if (maskSideForLayer(layerId)) {
      if (!isMaskCovered(material, layerId, profile)) continue;
    } else if (!hasLayer(material, layerId)) continue;
    output.push(index);
  }
  return output;
}

function gerberCellIndexes(grid, gridSize, materials, layerId, profile = BLUE_CLASSIC_PROFILE) {
  if (!maskSideForLayer(layerId)) return activeCellIndexes(grid, gridSize, materials, layerId, profile);
  const output = [];
  for (let index = 0; index < grid.length; index += 1) {
    const material = materials.get(grid[index]);
    if (isMaskOpening(material, layerId, profile)) output.push(index);
  }
  return output;
}

function coordinate(value) {
  return Math.round(finiteNumber(value) * 1_000_000).toString();
}

function gerberPoint(x, y, operation) {
  return `X${coordinate(x)}Y${coordinate(y)}${operation}*`;
}

function gerberComment(value) {
  return `G04 ${String(value).replaceAll("*", " ")}*`;
}

function outlinePoints(board) {
  const width = board.width;
  const height = board.height;
  const radius = board.rounded ? Math.min(board.radius, width / 2, height / 2) : 0;
  if (radius <= 0) return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];

  const points = [];
  const addArc = (cx, cy, start, end, steps = 8) => {
    for (let step = 0; step <= steps; step += 1) {
      const angle = start + ((end - start) * step) / steps;
      const point = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
      if (!points.length || point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1]) points.push(point);
    }
  };

  points.push([radius, 0], [width - radius, 0]);
  addArc(width - radius, radius, -Math.PI / 2, 0);
  points.push([width, height - radius]);
  addArc(width - radius, height - radius, 0, Math.PI / 2);
  points.push([radius, height]);
  addArc(radius, height - radius, Math.PI / 2, Math.PI);
  points.push([0, radius]);
  addArc(radius, radius, Math.PI, (Math.PI * 3) / 2);
  points.push([radius, 0]);
  return points;
}

function buildGerberLayer({ definition, grid, gridSize, board, materials, profile }) {
  const lines = [
    gerberComment(`Image2PCB Art ${definition.label}`),
    gerberComment(`I2P-SEMANTIC=${definition.semantic}`),
    gerberComment(`I2P-POLARITY=${definition.polarityStatus || "POSITIVE_GEOMETRY"}`),
    `%TF.FileFunction,${definition.fileFunction}*%`,
    `%TF.FilePolarity,${definition.filePolarity}*%`,
    "%TF.Part,Single*%",
    "%FSLAX46Y46*%",
    "%MOMM*%",
    "%LPD*%",
  ];

  if (definition.id === "boardOutline") {
    lines.push("%ADD10C,0.010000*%", "D10*");
    const points = outlinePoints(board);
    lines.push(gerberPoint(points[0][0], points[0][1], "D02"));
    for (const point of points.slice(1)) lines.push(gerberPoint(point[0], point[1], "D01"));
    lines.push("M02*");
    return `${lines.join("\n")}\n`;
  }

  const indexes = gerberCellIndexes(grid, gridSize, materials, definition.id, profile);
  const cellWidth = gridSize.cols ? board.width / gridSize.cols : 0;
  const cellHeight = gridSize.rows ? board.height / gridSize.rows : 0;
  if (indexes.length && cellWidth > 0 && cellHeight > 0) {
    lines.push(`%ADD10R,${cellWidth.toFixed(6)}X${cellHeight.toFixed(6)}*%`, "D10*");
    for (const index of indexes) {
      const x = (index % gridSize.cols) * cellWidth + cellWidth / 2;
      const yTop = Math.floor(index / gridSize.cols) * cellHeight;
      const y = board.height - yTop - cellHeight / 2;
      lines.push(gerberPoint(x, y, "D03"));
    }
  }
  lines.push("M02*");
  return `${lines.join("\n")}\n`;
}

function parseGerberNumber(value) {
  return Number(value) / 1_000_000;
}

export function parseGerber(content) {
  const text = String(content);
  const units = /%MO(MM|IN)\*%/.exec(text)?.[1] || null;
  const formatMatch = /%FSLAX(\d)(\d)Y(\d)(\d)\*%/.exec(text);
  const polarity = /%LP([DC])\*%/.exec(text)?.[1] || null;
  const semantic = /G04 I2P-SEMANTIC=([^\r\n*]+)\*/.exec(text)?.[1] || null;
  const declaredPolarity = /G04 I2P-POLARITY=([^\r\n*]+)\*/.exec(text)?.[1] || null;
  const fileFunction = /%TF\.FileFunction,([^*]+)\*%/.exec(text)?.[1] || null;
  const filePolarity = /%TF\.FilePolarity,([^*]+)\*%/.exec(text)?.[1] || null;
  const part = /%TF\.Part,([^*]+)\*%/.exec(text)?.[1] || null;
  const apertures = {};
  const aperturePattern = /%ADD(\d+)([RC]),([^*]+)\*%/g;
  for (const match of text.matchAll(aperturePattern)) {
    const id = Number(match[1]);
    const shape = match[2];
    const dimensions = match[3].split("X").map(Number);
    apertures[id] = { shape, width: dimensions[0], height: dimensions[1] ?? dimensions[0] };
  }

  let currentAperture = null;
  let currentPoint = null;
  let moveCount = 0;
  const flashes = [];
  const segments = [];
  for (const rawToken of text.replaceAll("%", "").split("*")) {
    const token = rawToken.trim();
    if (!token || token.startsWith("G04")) continue;
    const apertureMatch = /^D(\d+)$/.exec(token);
    if (apertureMatch && Number(apertureMatch[1]) >= 10) {
      currentAperture = Number(apertureMatch[1]);
      continue;
    }
    const drawMatch = /^X(-?\d+)Y(-?\d+)D0([123])$/.exec(token);
    if (!drawMatch) continue;
    const point = { x: parseGerberNumber(drawMatch[1]), y: parseGerberNumber(drawMatch[2]) };
    const operation = Number(drawMatch[3]);
    if (operation === 2) {
      currentPoint = point;
      moveCount += 1;
    } else if (operation === 1) {
      if (currentPoint) segments.push({ from: currentPoint, to: point, aperture: currentAperture });
      currentPoint = point;
    } else if (operation === 3) {
      flashes.push({ ...point, aperture: currentAperture, shape: apertures[currentAperture]?.shape || null, width: apertures[currentAperture]?.width || 0, height: apertures[currentAperture]?.height || 0 });
      currentPoint = point;
    }
  }

  const allPoints = [
    ...flashes.flatMap((flash) => [[flash.x - flash.width / 2, flash.y - flash.height / 2], [flash.x + flash.width / 2, flash.y + flash.height / 2]]),
    ...segments.flatMap((segment) => [[segment.from.x, segment.from.y], [segment.to.x, segment.to.y]]),
  ];
  const bbox = allPoints.length
    ? { minX: Math.min(...allPoints.map((point) => point[0])), minY: Math.min(...allPoints.map((point) => point[1])), maxX: Math.max(...allPoints.map((point) => point[0])), maxY: Math.max(...allPoints.map((point) => point[1])) }
    : null;

  return {
    units,
    format: formatMatch ? `X${formatMatch[1]}${formatMatch[2]}Y${formatMatch[3]}${formatMatch[4]}` : null,
    polarity,
    semantic,
    declaredPolarity,
    fileFunction,
    filePolarity,
    part,
    moveCount,
    apertures,
    flashes,
    segments,
    bbox,
  };
}

function expectedGerberRectangles({ definition, grid, gridSize, board, materials, profile }) {
  const cellWidth = gridSize.cols ? board.width / gridSize.cols : 0;
  const cellHeight = gridSize.rows ? board.height / gridSize.rows : 0;
  return gerberCellIndexes(grid, gridSize, materials, definition.id, profile).map((index) => ({
    x: (index % gridSize.cols) * cellWidth + cellWidth / 2,
    y: board.height - Math.floor(index / gridSize.cols) * cellHeight - cellHeight / 2,
    width: cellWidth,
    height: cellHeight,
  }));
}

function closeEnough(a, b, tolerance = 0.00001) {
  return Math.abs(a - b) <= tolerance;
}

function parsedFlashIndexes(parsed, gridSize, board) {
  const cellWidth = gridSize.cols ? board.width / gridSize.cols : 0;
  const cellHeight = gridSize.rows ? board.height / gridSize.rows : 0;
  if (!(cellWidth > 0 && cellHeight > 0)) return [];
  return parsed.flashes
    .map((flash) => {
      const column = Math.round(flash.x / cellWidth - 0.5);
      const rowFromBottom = Math.round(flash.y / cellHeight - 0.5);
      const row = gridSize.rows - 1 - rowFromBottom;
      return column >= 0 && column < gridSize.cols && row >= 0 && row < gridSize.rows
        ? row * gridSize.cols + column
        : null;
    })
    .filter((index) => index !== null);
}

function validateCrossLayerSemantics({ gerbers, grid, gridSize, board, materials, profile }) {
  const parsed = Object.fromEntries(
    GERBER_DEFINITIONS
      .filter((definition) => definition.id !== "boardOutline")
      .map((definition) => [definition.id, new Set(parsedFlashIndexes(parseGerber(gerbers[definition.id] || ""), gridSize, board))]),
  );
  const mismatches = [];
  const sides = [
    { side: "top", copperLayer: "topCopper", maskLayer: "topMask" },
    { side: "bottom", copperLayer: "bottomCopper", maskLayer: "bottomMask" },
  ];

  for (let index = 0; index < grid.length; index += 1) {
    const material = materials.get(grid[index]);
    for (const { side, copperLayer, maskLayer } of sides) {
      const expectedCopper = Boolean(material && hasLayer(material, copperLayer));
      const expectedOpening = Boolean(material && isMaskOpening(material, maskLayer, profile));
      const actualCopper = parsed[copperLayer].has(index);
      const actualOpening = parsed[maskLayer].has(index);
      if (actualCopper !== expectedCopper || actualOpening !== expectedOpening) {
        mismatches.push({ index, materialId: grid[index], side, expectedCopper, actualCopper, expectedOpening, actualOpening });
      }
    }

    const expectedSilk = Boolean(material && hasLayer(material, "silk"));
    const actualSilk = parsed.silk.has(index);
    if (actualSilk !== expectedSilk) mismatches.push({ index, materialId: grid[index], layer: "silk", expectedSilk, actualSilk });
  }

  return { pass: mismatches.length === 0, mismatchCount: mismatches.length, mismatches };
}

function validateGerberRoundTrip({ gerbers, grid, gridSize, board, materials, profile }) {
  const maskIntentPass = maskIntentContractPass(materials);
  const layerResults = [];
  for (const definition of GERBER_DEFINITIONS) {
    const content = gerbers[definition.id];
    const parsed = parseGerber(content || "");
    const expectedPolarity = definition.polarityStatus || "POSITIVE_GEOMETRY";
    const contractPass = parsed.units === "MM"
      && parsed.format === "X46Y46"
      && parsed.polarity === "D"
      && parsed.semantic === definition.semantic
      && parsed.declaredPolarity === expectedPolarity
      && parsed.fileFunction === definition.fileFunction
      && parsed.filePolarity === definition.filePolarity
      && parsed.part === "Single";
    const semanticPass = parsed.semantic === definition.semantic
      && parsed.declaredPolarity === expectedPolarity
      && parsed.fileFunction === definition.fileFunction
      && parsed.filePolarity === definition.filePolarity
      && parsed.part === "Single";
    if (definition.id === "boardOutline") {
      const bbox = parsed.bbox;
      const firstSegment = parsed.segments[0];
      const lastSegment = parsed.segments.at(-1);
      const continuous = parsed.segments.length >= 4 && parsed.segments.every((segment, index) => index === 0 || (
        closeEnough(segment.from.x, parsed.segments[index - 1].to.x)
        && closeEnough(segment.from.y, parsed.segments[index - 1].to.y)
      ));
      const closed = Boolean(firstSegment && lastSegment
        && closeEnough(firstSegment.from.x, lastSegment.to.x)
        && closeEnough(firstSegment.from.y, lastSegment.to.y));
      const outlinePass = contractPass
        && parsed.moveCount === 1
        && parsed.flashes.length === 0
        && parsed.segments.every((segment) => segment.aperture === 10)
        && continuous
        && closed
        && bbox
        && closeEnough(bbox.minX, 0)
        && closeEnough(bbox.minY, 0)
        && closeEnough(bbox.maxX, board.width)
        && closeEnough(bbox.maxY, board.height);
      layerResults.push({
        fileName: definition.fileName,
        pass: Boolean(outlinePass),
        semanticPass,
        geometryPass: Boolean(outlinePass),
        outlinePass: Boolean(outlinePass),
        detail: outlinePass ? "one continuous closed outline matches board bbox" : "outline contract/path/bounds mismatch",
      });
      continue;
    }
    const expected = expectedGerberRectangles({ definition, grid, gridSize, board, materials, profile });
    const actual = parsed.flashes;
    const geometryPass = contractPass
      && parsed.moveCount === 0
      && parsed.segments.length === 0
      && actual.length === expected.length
      && actual.every((flash, index) => {
      const target = expected[index];
      return flash.shape === "R" && closeEnough(flash.x, target.x) && closeEnough(flash.y, target.y) && closeEnough(flash.width, target.width) && closeEnough(flash.height, target.height);
    });
    layerResults.push({
      fileName: definition.fileName,
      pass: Boolean(geometryPass),
      semanticPass,
      geometryPass: Boolean(geometryPass),
      outlinePass: null,
      detail: geometryPass ? `${actual.length} flashes and semantic contract round-trip in mm` : `expected ${expected.length} flashes, parsed ${actual.length} or contract mismatch`,
    });
  }
  const crossLayerSemantic = validateCrossLayerSemantics({ gerbers, grid, gridSize, board, materials, profile });
  return {
    pass: maskIntentPass && crossLayerSemantic.pass && layerResults.every((result) => result.pass),
    semanticPass: maskIntentPass && crossLayerSemantic.pass && layerResults.every((result) => result.semanticPass),
    maskIntentPass,
    crossLayerSemanticPass: crossLayerSemantic.pass,
    crossLayerSemantic,
    geometryPass: layerResults.every((result) => result.geometryPass),
    outlinePass: layerResults.find((result) => result.fileName === "board.GKO")?.outlinePass === true,
    layers: layerResults,
  };
}

function buildLayerSvg({ layer, grid, gridSize, board, materials, profile }) {
  const { cols, rows } = gridSize;
  const cellWidth = board.width / cols;
  const cellHeight = board.height / rows;
  const rects = activeCellIndexes(grid, gridSize, materials, layer.id, profile)
    .map((index) => {
      const x = (index % cols) * cellWidth;
      const y = Math.floor(index / cols) * cellHeight;
      return `<rect x="${mm(x)}" y="${mm(y)}" width="${mm(cellWidth)}" height="${mm(cellHeight)}" fill="#000000" />`;
    })
    .join("");
  const radius = board.rounded ? Math.min(board.radius, board.width / 2, board.height / 2) : 0;
  const clipId = `${layer.id}-board-clip`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mm(board.width)}mm" height="${mm(board.height)}mm" viewBox="0 0 ${mm(board.width)} ${mm(board.height)}" data-layer="${escapeXml(layer.id)}" data-layer-intent="${escapeXml(layer.intent)}" data-polarity="${escapeXml(layer.polarity)}" data-origin="top-left" data-units="mm">
  <title>Image2PCB Art ${escapeXml(layer.label)}</title>
  <metadata>Positive geometry in board millimetres. Solder-mask polarity is a coverage candidate and requires external Gerber Viewer and fab-specific DFM confirmation.</metadata>
  <defs><clipPath id="${clipId}"><rect x="0" y="0" width="${mm(board.width)}" height="${mm(board.height)}" rx="${mm(radius)}" /></clipPath></defs>
  <g id="${escapeXml(layer.id)}-geometry" clip-path="url(#${clipId})" shape-rendering="crispEdges">${rects}</g>
</svg>`;
}

function buildBoardOutlineSvg(board) {
  const radius = board.rounded ? Math.min(board.radius, board.width / 2, board.height / 2) : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mm(board.width)}mm" height="${mm(board.height)}mm" viewBox="0 0 ${mm(board.width)} ${mm(board.height)}" data-layer="board-outline" data-layer-intent="board-outline" data-origin="top-left" data-units="mm">
  <title>Image2PCB Art board outline</title>
  <rect x="0" y="0" width="${mm(board.width)}" height="${mm(board.height)}" rx="${mm(radius)}" fill="none" stroke="#000000" stroke-width="0.01" />
</svg>`;
}

function pointInsideBoard(x, y, board) {
  if (!(board.width > 0 && board.height > 0)) return false;
  const radius = board.rounded
    ? Math.min(Math.max(0, board.radius), board.width / 2, board.height / 2)
    : 0;
  const centerX = Math.max(radius, Math.min(board.width - radius, x));
  const centerY = Math.max(radius, Math.min(board.height - radius, y));
  const dx = x - centerX;
  const dy = y - centerY;
  return (dx * dx) + (dy * dy) <= (radius * radius) + 1e-9;
}

export function isCellInsideBoard(index, gridSize, board) {
  const cols = Number(gridSize?.cols) || 0;
  const rows = Number(gridSize?.rows) || 0;
  if (!(cols > 0 && rows > 0)) return false;
  const cellWidth = board.width / cols;
  const cellHeight = board.height / rows;
  const column = index % cols;
  const row = Math.floor(index / cols);
  const x = column * cellWidth;
  const y = row * cellHeight;
  const maxX = x + cellWidth;
  const maxY = y + cellHeight;
  return [[x, y], [maxX, y], [maxX, maxY], [x, maxY]].every(([cornerX, cornerY]) => pointInsideBoard(cornerX, cornerY, board));
}

function getLayerBoardContainment(grid, gridSize, materials, board, profile) {
  const layers = [
    { id: "topCopper", indexes: activeCellIndexes(grid, gridSize, materials, "topCopper", profile) },
    { id: "bottomCopper", indexes: activeCellIndexes(grid, gridSize, materials, "bottomCopper", profile) },
    { id: "topMask", indexes: gerberCellIndexes(grid, gridSize, materials, "topMask", profile) },
    { id: "bottomMask", indexes: gerberCellIndexes(grid, gridSize, materials, "bottomMask", profile) },
    { id: "silk", indexes: activeCellIndexes(grid, gridSize, materials, "silk", profile) },
  ];
  const violations = [];
  for (const layer of layers) {
    for (const index of layer.indexes) {
      if (!isCellInsideBoard(index, gridSize, board)) violations.push({ layer: layer.id, index, materialId: grid[index] });
    }
  }
  return {
    pass: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

function roundedRectArcCenters(board) {
  const radius = board.rounded ? Math.min(Math.max(0, board.radius), board.width / 2, board.height / 2) : 0;
  if (!(radius > 0)) return [];
  return [
    [radius, radius],
    [board.width - radius, radius],
    [board.width - radius, board.height - radius],
    [radius, board.height - radius],
  ].map(([centerX, centerY]) => ({ centerX, centerY, radius }));
}

// True distance from a grid cell to the board boundary: straight edges plus
// routed corner arcs. For a cell fully inside the board, the closest approach
// to each corner arc is radius minus the largest corner-to-centre distance,
// which is always attained at one of the cell's four corners.
export function cellEdgeClearanceMm(index, gridSize, board) {
  const cols = Number(gridSize?.cols) || 0;
  const rows = Number(gridSize?.rows) || 0;
  if (!(cols > 0 && rows > 0) || !(board.width > 0 && board.height > 0)) return null;
  const cellWidth = board.width / cols;
  const cellHeight = board.height / rows;
  const x = (index % cols) * cellWidth;
  const y = Math.floor(index / cols) * cellHeight;
  const maxX = x + cellWidth;
  const maxY = y + cellHeight;
  let clearance = Math.min(x, y, board.width - maxX, board.height - maxY);
  for (const arc of roundedRectArcCenters(board)) {
    const maxCornerDistance = Math.max(
      Math.hypot(x - arc.centerX, y - arc.centerY),
      Math.hypot(maxX - arc.centerX, y - arc.centerY),
      Math.hypot(maxX - arc.centerX, maxY - arc.centerY),
      Math.hypot(x - arc.centerX, maxY - arc.centerY),
    );
    const arcClearance = arc.radius - maxCornerDistance;
    if (arcClearance > 0) clearance = Math.min(clearance, arcClearance);
  }
  return clearance;
}

function getCopperBoardClearance(grid, gridSize, materials, board) {
  let minimumEdgeClearanceMm = Infinity;
  let roundedCornerViolations = 0;

  for (let index = 0; index < grid.length; index += 1) {
    const material = materials.get(grid[index]);
    if (!material || (!hasLayer(material, "topCopper") && !hasLayer(material, "bottomCopper"))) continue;
    minimumEdgeClearanceMm = Math.min(minimumEdgeClearanceMm, cellEdgeClearanceMm(index, gridSize, board));
    if (board.rounded && !isCellInsideBoard(index, gridSize, board)) roundedCornerViolations += 1;
  }

  return {
    minimumEdgeClearanceMm: Number.isFinite(minimumEdgeClearanceMm) ? minimumEdgeClearanceMm : null,
    roundedCornerViolations,
  };
}

function makeChecks({ board, grid, gridSize, materials, source, imagePresent, profile, layers, boardOutlineSvg, gerberValidation, copperClearance, layerBoardContainment }) {
  const widthPass = board.width >= 30 && board.width <= 300;
  const heightPass = board.height >= 30 && board.height <= 300;
  const dimensionsPass = widthPass && heightPass;
  const maxRadius = Math.min(board.width, board.height) / 2;
  const radiusPass = !board.rounded || (board.radius >= 0 && board.radius <= maxRadius);
  const colsPass = gridSize.cols > 0;
  const rowsPass = gridSize.rows > 0;
  const expectedCells = gridSize.cols * gridSize.rows;
  const validMaterialIds = grid.every((id) => materials.has(id));
  const gridPass = colsPass && rowsPass && grid.length === expectedCells && validMaterialIds;
  const cellWidth = gridSize.cols ? board.width / gridSize.cols : 0;
  const cellHeight = gridSize.rows ? board.height / gridSize.rows : 0;
  const minFeaturePass = cellWidth >= profile.rules.minFeatureMm && cellHeight >= profile.rules.minFeatureMm;
  const complexityPass = expectedCells <= profile.rules.maxGridCells;
  const sourcePass = Boolean(imagePresent && source.width > 0 && source.height > 0);
  const edgePass = copperClearance.minimumEdgeClearanceMm === null
    || (copperClearance.minimumEdgeClearanceMm >= profile.rules.minCopperEdgeClearanceMm && copperClearance.roundedCornerViolations === 0);
  const profilePass = Boolean(profile.id && profile.version && profile.validationStatus === "experimental" && maskDefaultContractPass(profile));
  const alignmentPass = LAYER_DEFINITIONS.every((layer) => {
    const svg = layers[layer.id];
    return typeof svg === "string" && svg.includes(`width="${mm(board.width)}mm" height="${mm(board.height)}mm" viewBox="0 0 ${mm(board.width)} ${mm(board.height)}"`);
  }) && boardOutlineSvg.includes(`width="${mm(board.width)}mm" height="${mm(board.height)}mm" viewBox="0 0 ${mm(board.width)} ${mm(board.height)}"`);
  const outlineBindingPass = gerberValidation.outlinePass === true;
  const layerSemanticsPass = gerberValidation.semanticPass === true;
  const maskIntentPass = gerberValidation.maskIntentPass === true;
  const crossLayerSemanticPass = gerberValidation.crossLayerSemanticPass === true;

  return [
    {
      id: "source-image",
      label: "Source image",
      detail: sourcePass ? `${source.width} × ${source.height}px · local input` : "Upload a real image before official export",
      pass: sourcePass,
      severity: "error",
    },
    {
      id: "board-dimensions",
      label: "Board dimensions",
      detail: `${board.width.toFixed(1)} × ${board.height.toFixed(1)} mm · V1 range 30–300 mm`,
      pass: dimensionsPass,
      severity: "error",
    },
    {
      id: "grid-shape",
      label: "Geometry grid",
      detail: `${gridSize.cols} × ${gridSize.rows} shared cells`,
      pass: gridPass,
      severity: "error",
    },
    {
      id: "layer-alignment",
      label: "Layer alignment",
      detail: "Shared mm width, height, origin, and viewBox",
      pass: alignmentPass,
      severity: "error",
    },
    {
      id: "corner-geometry",
      label: "Corner geometry",
      detail: board.rounded ? `R ${board.radius.toFixed(1)} mm · max ${Math.max(0, maxRadius).toFixed(1)} mm` : "Square",
      pass: radiusPass,
      severity: "error",
    },
    {
      id: "minimum-feature",
      label: "Minimum feature",
      detail: `${cellWidth.toFixed(3)} × ${cellHeight.toFixed(3)} mm cells · target ≥ ${profile.rules.minFeatureMm.toFixed(2)} mm`,
      pass: minFeaturePass,
      severity: "error",
    },
    {
      id: "copper-edge-clearance",
      label: "Copper edge clearance",
      detail: copperClearance.minimumEdgeClearanceMm === null
        ? "No copper geometry"
        : `${copperClearance.minimumEdgeClearanceMm.toFixed(2)} mm minimum edge clearance · target ≥ ${profile.rules.minCopperEdgeClearanceMm.toFixed(2)} mm · ${copperClearance.roundedCornerViolations} rounded-board violation(s)`,
      pass: edgePass,
      severity: "error",
    },
    {
      id: "layer-board-containment",
      label: "Layer board containment",
      detail: layerBoardContainment.pass
        ? "Copper, mask openings, and silkscreen stay inside the board outline"
        : `${layerBoardContainment.violationCount} layer cell(s) extend outside the board outline`,
      pass: layerBoardContainment.pass,
      severity: "error",
    },
    {
      id: "geometry-complexity",
      label: "Geometry complexity",
      detail: `${expectedCells.toLocaleString()} cells · limit ${profile.rules.maxGridCells.toLocaleString()}`,
      pass: complexityPass,
      severity: "error",
    },
    {
      id: "profile-contract",
      label: "Manufacturing profile",
      detail: `${profile.name || profile.id} · ${profile.validationStatus}`,
      pass: profilePass,
      severity: "error",
    },
    {
      id: "gerber-round-trip",
      label: "Gerber round-trip",
      detail: gerberValidation.pass ? "RS-274X parser matched canonical layer geometry" : "Gerber export could not be parsed back to canonical geometry",
      pass: gerberValidation.pass,
      severity: "error",
    },
    {
      id: "board-outline-binding",
      label: "Board outline binding",
      detail: outlineBindingPass ? "One closed board.GKO path matches the configured board bounds" : "board.GKO is not one closed path bound to the configured board",
      pass: outlineBindingPass,
      severity: "error",
    },
    {
      id: "mask-intent-contract",
      label: "Mask intent contract",
      detail: maskIntentPass ? "Each material declares top/bottom COVER, OPEN, or DEFAULT" : "Each material must declare top/bottom maskIntent as COVER, OPEN, or DEFAULT",
      pass: maskIntentPass,
      severity: "error",
    },
    {
      id: "layer-semantic-contract",
      label: "Layer semantic contract",
      detail: layerSemanticsPass ? "Gerber semantic and polarity declarations match the layer contract" : "Gerber semantic or polarity declaration mismatch",
      pass: layerSemanticsPass,
      severity: "error",
    },
    {
      id: "cross-layer-semantic-contract",
      label: "Cross-layer semantic contract",
      detail: crossLayerSemanticPass ? "Material states resolve consistently to copper, mask opening, and silkscreen geometry" : `${gerberValidation.crossLayerSemantic?.mismatchCount || 0} material-to-layer mismatch(es) detected`,
      pass: crossLayerSemanticPass,
      severity: "error",
    },
  ];
}

function buildReport({ checks, board, gridSize, profile, layerCounts, autoFixes, gerberValidation, copperClearance, layerBoardContainment }) {
  const hardFailures = checks.filter((check) => !check.pass && check.severity === "error");
  const warnings = [
    "Gerber file polarity is SPEC_VERIFIED; material-to-mask opening mapping remains EXTERNAL_UNVERIFIED until an independent Gerber Viewer and DFM fixture pass.",
    "Preview is an approximation. Actual PCB color varies with materials and process.",
    "Blue Classic is Experimental until calibration-card, DFM, and physical-board evidence exists.",
    "Gerber is the primary output; SVG is bundled under review/ for inspection and debugging.",
  ];
  if (autoFixes?.copperEdgeCells) warnings.unshift(`${autoFixes.copperEdgeCells} 个铜单元因板边间距不足已自动替换为 FR4 安全边框。`);
  if (autoFixes?.copperRoundedCornerCells) warnings.unshift(`${autoFixes.copperRoundedCornerCells} 个圆角外铜单元已自动替换为 FR4 安全边框。`);
  if (autoFixes?.layerBoardContainmentCells) warnings.unshift(`${autoFixes.layerBoardContainmentCells} 个越过板框的层单元已自动替换为安全 FR4 状态。`);
  return {
    schemaVersion: "i2p-art.manufacturability.v1",
    status: hardFailures.length === 0 ? "READY" : "BLOCKED",
    validationStatus: "experimental",
    rulesVersion: profile.rulesVersion,
    profileId: profile.id,
    checks,
    warnings,
    autoFixes: { ...(autoFixes || {}) },
    gerberValidation,
    evidence: {
      boardWidthMm: board.width,
      boardHeightMm: board.height,
      gridCols: gridSize.cols,
      gridRows: gridSize.rows,
      cellWidthMm: gridSize.cols ? board.width / gridSize.cols : 0,
      cellHeightMm: gridSize.rows ? board.height / gridSize.rows : 0,
      layerCellCounts: layerCounts,
      copperMinimumEdgeClearanceMm: copperClearance.minimumEdgeClearanceMm,
      copperRoundedCornerViolations: copperClearance.roundedCornerViolations,
      layerBoardContainmentViolationCount: layerBoardContainment.violationCount,
      crossLayerSemanticPass: gerberValidation.crossLayerSemanticPass,
    },
  };
}

function buildProjectJson({ board, profile, source, adjustments, report, gridSize, autoFixes }) {
  return JSON.stringify(
    {
      schemaVersion: "i2p-art.project.v1",
      appVersion: "0.2.0-geometry-slice",
      board: {
        widthMm: board.width,
        heightMm: board.height,
        cornerRadiusMm: board.rounded ? board.radius : 0,
        cornerStyle: board.rounded ? "rounded" : "square",
      },
      profile: {
        id: profile.id,
        name: profile.name,
        version: profile.version,
        validationStatus: profile.validationStatus,
        maskDefault: profile.maskDefault,
        layers: profile.layers,
      },
      source,
      processing: { ...adjustments },
      geometry: {
        cols: gridSize.cols,
        rows: gridSize.rows,
        reviewCoordinateSystem: "top-left / millimetres",
        manufacturingCoordinateSystem: "board-lower-left / millimetres / +X right / +Y up",
        autoFixes: { ...(autoFixes || {}) },
      },
      manufacturing: {
        status: report.status,
        validationStatus: report.validationStatus,
        rulesVersion: report.rulesVersion,
        minimumFeatureTargetMm: profile.rules.minFeatureMm,
        drcPreflight: {
          status: report.status,
          scope: "Image2PCB geometry and Gerber contract",
          copperMinimumEdgeClearanceMm: report.evidence.copperMinimumEdgeClearanceMm,
          copperEdgeClearanceTargetMm: profile.rules.minCopperEdgeClearanceMm,
          copperRoundedCornerViolations: report.evidence.copperRoundedCornerViolations,
          layerBoardContainmentViolationCount: report.evidence.layerBoardContainmentViolationCount,
          crossLayerSemanticPass: report.evidence.crossLayerSemanticPass,
          externalGatesPending: ["fab-specific DFM", "physical-board validation"],
        },
        note: "READY means internal checks passed. It is not EasyEDA DRC, JLCPCB DFM, or factory approval.",
      },
      outputs: {
        primary: "Gerber RS-274X manufacturing package (six Gerber files only)",
        review: "separate SVG/metadata review package",
        drillRequired: false,
        drillReason: "board contains no holes",
        gerberFilePolarityStatus: "SPEC_VERIFIED",
        materialMaskMappingStatus: "EXTERNAL_UNVERIFIED",
      },
    },
    null,
    2,
  );
}

function buildGuideHtml({ board, profile, report }) {
  const rows = LAYER_DEFINITIONS
    .map((layer) => `<tr><td><code>${escapeHtml(layer.shortLabel)}</code></td><td>${escapeHtml(layer.label)}</td><td><code>layers/${escapeHtml(layer.fileName)}</code></td><td><code>${escapeHtml(layer.intent)}</code></td></tr>`)
    .join("");
  const status = report.status;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Image2PCB Art guide</title><style>body{font-family:Arial,sans-serif;max-width:880px;margin:40px auto;color:#18252b;line-height:1.6}code{background:#eef2ef;padding:2px 4px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccd6d4;padding:8px;text-align:left}h1{font-size:28px}.notice{padding:12px 16px;background:#fff3d7;border-left:4px solid #d28b2d}</style><h1>Image2PCB Art 制板指南</h1><p>板框：<strong>${mm(board.width)} × ${mm(board.height)} mm</strong>；Profile：<strong>${escapeHtml(profile.name)}</strong>（Experimental）；内部状态：<strong>${status}</strong>。</p><div class="notice">制造 ZIP 只含 RS-274X Gerber 六层：GTL、GBL、GTS、GBS、GTO、GKO；审阅 ZIP 另含 SVG、项目配置和报告。当前没有钻孔文件，因为此版本不支持孔。Gerber file polarity：<strong>SPEC_VERIFIED</strong>；material → mask opening mapping：<strong>EXTERNAL_UNVERIFIED</strong>。</div><h2>Gerber 层</h2><table><thead><tr><th>文件</th><th>含义</th><th>语义</th></tr></thead><tbody><tr><td><code>board.GTL</code></td><td>Top Copper</td><td>copper present</td></tr><tr><td><code>board.GBL</code></td><td>Bottom Copper</td><td>copper present</td></tr><tr><td><code>board.GTS</code></td><td>Top Solder Mask</td><td>solder-mask openings · mapping externally unverified</td></tr><tr><td><code>board.GBS</code></td><td>Bottom Solder Mask</td><td>solder-mask openings · mapping externally unverified</td></tr><tr><td><code>board.GTO</code></td><td>Top Silkscreen</td><td>silkscreen present</td></tr><tr><td><code>board.GKO</code></td><td>Board Outline</td><td>one closed outline</td></tr></tbody></table><h2>阻焊意图</h2><p>每个 material 必须为 top/bottom 声明 <code>COVER</code>、<code>OPEN</code> 或 <code>DEFAULT</code>。只有 <code>OPEN</code> 会生成 GTS/GBS opening geometry；<code>COVER</code> 和 <code>DEFAULT</code> 按 Profile 的 <code>maskDefault.top/bottom</code> 解析。</p><h2>检查顺序</h2><ol><li>只把 manufacturing ZIP 的六个根目录 Gerber 上传到 Gerber Viewer/JLCPCB；不要把 review ZIP 当制造上传包。</li><li>确认单位为 mm、下左原点、+X 向右、+Y 向上。</li><li>确认 Top/Bottom Solder Mask 表达的是开窗；X2 file polarity 已按规范声明，但 material mapping 仍需 fab/实板确认。</li><li>确认板框是唯一闭合轮廓且尺寸为 ${mm(board.width)} × ${mm(board.height)} mm。</li><li>查看 Gerber Viewer，再提交 JLCPCB DFM；如果需要人工审阅，可打开 review ZIP 中的 SVG。</li></ol><h2>去嘉立创下单</h2><p>把 manufacturing ZIP 直接拖进 jlc.com 的 PCB 下单页（无需解压），参数选择：<strong>板层 2 层 · 板厚 1.6mm · 阻焊颜色 蓝色 · 丝印颜色 白色 · 表面处理 HASL（有铅/无铅均可）</strong>。下单前在嘉立创 Gerber 预览里确认：图案与预期一致；深色细节在底层预览中，正面看不到属于正常现象（它们是背面铜层艺术）。这块板没有元件和孔，是纯装饰艺术板。</p><p><strong>提示：</strong>Preview is an approximation. Actual PCB color varies with manufacturing materials and process. READY 只代表 Image2PCB 内部检查通过，不代表工厂保证。</p></html>`;
}

function slugify(value) {
  return String(value || "artwork")
    .replace(/.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "artwork";
}

export function generatePCBArtProject(input = {}) {
  const profile = input.profile || BLUE_CLASSIC_PROFILE;
  const board = normalizeBoard(input.board);
  const gridSize = {
    cols: positiveInteger(input.gridSize?.cols),
    rows: positiveInteger(input.gridSize?.rows),
  };
  const grid = Array.isArray(input.grid) ? [...input.grid] : [];
  const source = normalizeSource(input.source);
  const adjustments = { ...(input.adjustments || {}) };
  const materials = materialMap(input.materials || []);
  const autoFixes = input.autoFixes || {};
  const layers = Object.fromEntries(
    LAYER_DEFINITIONS.map((layer) => [layer.id, buildLayerSvg({ layer, grid, gridSize, board, materials, profile })]),
  );
  const boardOutlineSvg = buildBoardOutlineSvg(board);
  const gerbers = Object.fromEntries(
    GERBER_DEFINITIONS.map((definition) => [definition.id, buildGerberLayer({ definition, grid, gridSize, board, materials, profile })]),
  );
  const gerberValidation = validateGerberRoundTrip({ gerbers, grid, gridSize, board, materials, profile });
  const copperClearance = getCopperBoardClearance(grid, gridSize, materials, board);
  const layerBoardContainment = getLayerBoardContainment(grid, gridSize, materials, board, profile);
  const layerCounts = Object.fromEntries(
    LAYER_DEFINITIONS.map((layer) => [layer.id, activeCellIndexes(grid, gridSize, materials, layer.id, profile).length]),
  );
  const checks = makeChecks({ board, grid, gridSize, materials, source, imagePresent: input.imagePresent, profile, layers, boardOutlineSvg, gerberValidation, copperClearance, layerBoardContainment });
  const report = buildReport({ checks, board, gridSize, profile, layerCounts, autoFixes, gerberValidation, copperClearance, layerBoardContainment });
  const projectJson = buildProjectJson({ board, profile, source, adjustments, report, gridSize, autoFixes });
  const guideHtml = buildGuideHtml({ board, profile, report });

  return {
    board,
    gridSize,
    profile,
    source,
    adjustments,
    layers,
    boardOutlineSvg,
    gerbers,
    gerberValidation,
    report,
    projectJson,
    guideHtml,
    packageName: `image2pcb-${slugify(source.fileName)}.zip`,
  };
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return textEncoder.encode(value);
  throw new TypeError("Package entries must be strings or byte arrays");
}

function decodeDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) return null;
  const payload = value.slice(comma + 1);
  if (!value.slice(0, comma).includes(";base64")) return textEncoder.encode(decodeURIComponent(payload));
  const binary = typeof atob === "function" ? atob(payload) : "";
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function compareEntryNames(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const data = entry.bytes;
    const checksum = crc32(data);
    const local = concatBytes(
      u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    );
    const central = concatBytes(
      u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    );
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const localData = concatBytes(...localParts);
  const centralData = concatBytes(...centralParts);
  const end = concatBytes(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralData.length), u32(localData.length), u16(0));
  return concatBytes(localData, centralData, end);
}

function packageVariantName(packageName, variant) {
  return `${String(packageName || "image2pcb-art.zip").replace(/\.zip$/i, "")}-${variant}.zip`;
}

function buildManufacturingEntries(project) {
  return {
    "board.GBL": project.gerbers.bottomCopper,
    "board.GBS": project.gerbers.bottomMask,
    "board.GKO": project.gerbers.boardOutline,
    "board.GTL": project.gerbers.topCopper,
    "board.GTO": project.gerbers.silk,
    "board.GTS": project.gerbers.topMask,
  };
}

function buildManifest(project, contentEntries) {
  return {
    schemaVersion: "i2p-art.manifest.v1",
    packageType: "gerber-rs274x-manufacturing-package",
    generatedBy: "Image2PCB Art 0.2.0-geometry-slice",
    profile: { id: project.profile.id, version: project.profile.version, validationStatus: project.profile.validationStatus, maskDefault: project.profile.maskDefault },
    primaryFormat: "RS-274X",
    units: "mm",
    coordinateOrigin: "board-lower-left",
    gerberFilePolarityStatus: "SPEC_VERIFIED",
    materialMaskMappingStatus: "EXTERNAL_UNVERIFIED",
    drillRequired: false,
    drillReason: "board contains no holes",
    manufacturingStatus: project.report.status,
    files: contentEntries.map((entry) => ({ name: entry.name, bytes: entry.bytes.length, crc32: crc32(entry.bytes).toString(16).padStart(8, "0") })),
    gerberLayers: GERBER_DEFINITIONS.map((definition) => ({
      fileName: definition.fileName,
      semantic: definition.semantic,
      fileFunction: definition.fileFunction,
      filePolarity: definition.filePolarity,
      part: "Single",
      polarityStatus: definition.polarityStatus || "POSITIVE_GEOMETRY",
    })),
  };
}

export function buildManufacturingPackage(project) {
  if (!project || project.report?.status !== "READY") throw new Error("Cannot package a BLOCKED project");

  const contentEntries = Object.entries(buildManufacturingEntries(project)).map(([name, value]) => ({ name, bytes: toBytes(value) }));
  contentEntries.sort(compareEntryNames);
  const manifest = buildManifest(project, contentEntries);

  return {
    bytes: createStoredZip(contentEntries),
    fileNames: contentEntries.map((entry) => entry.name),
    manifest,
    fileCount: contentEntries.length,
    packageName: packageVariantName(project.packageName, "manufacturing"),
  };
}

export function buildReviewPackage(project, options = {}) {
  if (!project || project.report?.status !== "READY") throw new Error("Cannot package a BLOCKED project");

  const manufacturing = buildManufacturingPackage(project);
  const rawEntries = {
    "README.html": project.guideHtml,
    "manifest.json": JSON.stringify(manufacturing.manifest, null, 2),
    "project/project.json": project.projectJson,
    "reports/manufacturability.json": JSON.stringify(project.report, null, 2),
    "review/board-outline.svg": project.boardOutlineSvg,
    "review/layers/bottom-copper.svg": project.layers.bottomCopper,
    "review/layers/bottom-soldermask.svg": project.layers.bottomMask,
    "review/layers/top-copper.svg": project.layers.topCopper,
    "review/layers/top-silkscreen.svg": project.layers.silk,
    "review/layers/top-soldermask.svg": project.layers.topMask,
  };
  const previews = options.previewDataUrls || {};
  for (const [key, fileName] of Object.entries({
    original: "preview/original-preview.png",
    pcb: "preview/pcb-preview.png",
    layer: "preview/layer-preview.png",
  })) {
    const decoded = decodeDataUrl(previews[key]);
    if (decoded) rawEntries[fileName] = decoded;
  }

  const contentEntries = Object.entries(rawEntries).map(([name, value]) => ({ name, bytes: toBytes(value) }));
  contentEntries.sort(compareEntryNames);
  return {
    bytes: createStoredZip(contentEntries),
    fileNames: contentEntries.map((entry) => entry.name),
    fileCount: contentEntries.length,
    packageName: packageVariantName(project.packageName, "review"),
    manufacturingManifest: manufacturing.manifest,
  };
}
