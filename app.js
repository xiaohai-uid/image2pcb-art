// Cache-bust: bump every ?v= below together with the app.js script tag and the
// styles.css link in index.html, or a stale module/stylesheet keeps serving.
import {
  BLUE_CLASSIC_PROFILE,
  LAYER_DEFINITIONS,
  RENDER_COLORS,
  buildManufacturingPackage,
  buildReviewPackage,
  cellEdgeClearanceMm,
  generatePCBArtProject,
  isCellInsideBoard,
  isSideMaskOpening,
  renderedMaterialColor,
} from "./pcb-core.mjs?v=20260822-4";
import { quantizeMaterialGrid } from "./image-quantizer.mjs?v=20260822-4";

// Physically derived swatch colors come from the core's single source of truth;
// the remaining entries are palette identities calibrated for Blue Classic.
const palette = [
  {
    id: "whiteSilk",
    label: "White silk",
    shortLabel: "WHITE SILK",
    color: "#eeeadd",
    layers: { topCopper: false, bottomCopper: false, silk: true },
    maskIntent: { top: "DEFAULT", bottom: "DEFAULT" },
  },
  {
    id: "haslSilver",
    label: "HASL silver",
    shortLabel: "HASL SILVER",
    color: RENDER_COLORS.hasl,
    layers: { topCopper: true, bottomCopper: false, silk: false },
    maskIntent: { top: "OPEN", bottom: "DEFAULT" },
  },
  {
    id: "blueCopper",
    label: "Blue + copper",
    shortLabel: "BLUE + CU",
    color: "#4e8da5",
    layers: { topCopper: true, bottomCopper: false, silk: false },
    maskIntent: { top: "COVER", bottom: "DEFAULT" },
  },
  {
    id: "blueFr4",
    label: "Blue + FR4",
    shortLabel: "BLUE + FR4",
    color: RENDER_COLORS.blueOverFr4,
    layers: { topCopper: false, bottomCopper: false, silk: false },
    maskIntent: { top: "COVER", bottom: "DEFAULT" },
  },
  {
    id: "fr4",
    label: "Bare FR4",
    shortLabel: "BARE FR4",
    substrateExposed: true,
    color: RENDER_COLORS.bareFr4,
    layers: { topCopper: false, bottomCopper: false, silk: false },
    maskIntent: { top: "OPEN", bottom: "OPEN" },
  },
  {
    id: "deepBlue",
    label: "Deep blue",
    shortLabel: "DEEP BLUE",
    color: "#163c55",
    layers: { topCopper: false, bottomCopper: true, silk: false },
    maskIntent: { top: "COVER", bottom: "COVER" },
  },
];

// The quantizer targets RGB triplets derived from each swatch's hex, so the
// hex value is the only place a color is ever written.
function hexToRgb(hex) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

for (const item of palette) item.rgb = hexToRgb(item.color);

const layerDefinitions = LAYER_DEFINITIONS;

const state = {
  image: null,
  sourceName: "Calibration sample",
  board: { width: 85.6, height: 61, rounded: true, radius: 3 },
  adjustments: { brightness: 0, contrast: 0, detail: 62, smoothing: 28, cropFocus: 50 },
  visibility: { topCopper: true, topMask: true, bottomCopper: true, bottomMask: true, silk: true },
  viewSide: "top",
  grid: null,
  gridSize: { cols: 108, rows: 77 },
  autoFixes: { copperEdgeCells: 0, copperRoundedCornerCells: 0, layerBoardContainmentCells: 0 },
  project: null,
};

const dom = {
  originalCanvas: document.querySelector("#originalCanvas"),
  pcbCanvas: document.querySelector("#pcbCanvas"),
  viewTopButton: document.querySelector("#viewTopButton"),
  viewBottomButton: document.querySelector("#viewBottomButton"),
  paneMetaPcb: document.querySelector("#paneMetaPcb"),
  originalEmptyNote: document.querySelector("#originalEmptyNote"),
  imageInput: document.querySelector("#imageInput"),
  uploadDropzone: document.querySelector("#uploadDropzone"),
  sourceStatus: document.querySelector("#sourceStatus"),
  sourceLabel: document.querySelector("#sourceLabel"),
  widthInput: document.querySelector("#widthInput"),
  heightInput: document.querySelector("#heightInput"),
  radiusInput: document.querySelector("#radiusInput"),
  radiusValue: document.querySelector("#radiusValue"),
  radiusField: document.querySelector("#radiusField"),
  paletteList: document.querySelector("#paletteList"),
  layerToggles: document.querySelector("#layerToggles"),
  checkList: document.querySelector("#checkList"),
  readinessBadge: document.querySelector("#readinessBadge"),
  readinessText: document.querySelector("#readinessText"),
  readinessNote: document.querySelector("#readinessNote"),
  warningText: document.querySelector("#warningText"),
  exportButton: document.querySelector("#exportButton"),
  reviewExportButton: document.querySelector("#reviewExportButton"),
  adjustmentFeedback: document.querySelector("#adjustmentFeedback"),
};

const adjustmentInputs = {
  brightness: document.querySelector("#brightnessInput"),
  contrast: document.querySelector("#contrastInput"),
  detail: document.querySelector("#detailInput"),
  smoothing: document.querySelector("#smoothingInput"),
  cropFocus: document.querySelector("#cropInput"),
};

const adjustmentOutputs = {
  brightness: document.querySelector("#brightnessValue"),
  contrast: document.querySelector("#contrastValue"),
  detail: document.querySelector("#detailValue"),
  smoothing: document.querySelector("#smoothingValue"),
  cropFocus: document.querySelector("#cropValue"),
};

const paletteById = new Map(palette.map((item) => [item.id, item]));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getBoardRect(canvas) {
  const safeWidth = Math.max(1, Number(state.board.width) || 1);
  const safeHeight = Math.max(1, Number(state.board.height) || 1);
  const aspect = safeWidth / safeHeight;
  const maxWidth = canvas.width * 0.93;
  const maxHeight = canvas.height * 0.87;
  let width = maxWidth;
  let height = width / aspect;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }

  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}

function drawFrameBackground(ctx, canvas, color) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBoardOutline(ctx, rect, color = "rgba(223, 226, 209, 0.36)") {
  const radius = state.board.rounded ? (state.board.radius / state.board.width) * rect.width : 0;
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawImageToRect(ctx, image, rect) {
  const sourceAspect = image.width / image.height;
  const targetAspect = rect.width / rect.height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;
  const focus = state.adjustments.cropFocus / 100;

  if (sourceAspect > targetAspect) {
    sourceWidth = image.height * targetAspect;
    sourceX = (image.width - sourceWidth) * focus;
  } else {
    sourceHeight = image.width / targetAspect;
    sourceY = (image.height - sourceHeight) * 0.5;
  }

  const brightness = 100 + state.adjustments.brightness;
  const contrast = 100 + state.adjustments.contrast;
  const blur = state.adjustments.smoothing * 0.018;

  ctx.save();
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) blur(${blur}px)`;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawSampleSource(ctx, rect) {
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, state.board.rounded ? 19 : 0);
  ctx.clip();
  ctx.fillStyle = "#102e40";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const centerX = rect.x + rect.width * 0.52;
  const centerY = rect.y + rect.height * 0.52;
  const base = Math.min(rect.width, rect.height);

  ctx.strokeStyle = "rgba(112, 171, 181, 0.42)";
  ctx.lineWidth = Math.max(2, base * 0.012);
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, base * (0.14 + i * 0.09), base * (0.08 + i * 0.06), -0.26, 0.15, Math.PI * 1.76);
    ctx.stroke();
  }

  ctx.fillStyle = "#3a758d";
  ctx.beginPath();
  ctx.arc(centerX, centerY, base * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b79a6b";
  ctx.beginPath();
  ctx.arc(centerX - base * 0.035, centerY - base * 0.04, base * 0.088, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 38; i += 1) {
    const x = rect.x + ((Math.sin(i * 18.29) + 1) / 2) * rect.width;
    const y = rect.y + ((Math.sin(i * 7.31 + 1.7) + 1) / 2) * rect.height;
    const size = 1 + ((i * 13) % 4);
    ctx.fillStyle = i % 5 === 0 ? "#eeeadd" : "#b7c2c5";
    ctx.fillRect(x, y, size, size);
  }

  ctx.strokeStyle = "rgba(238, 234, 221, 0.67)";
  ctx.lineWidth = Math.max(1, base * 0.004);
  for (let i = 0; i < 5; i += 1) {
    const x = rect.x + rect.width * (0.11 + i * 0.08);
    const y = rect.y + rect.height * (0.78 - i * 0.022);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rect.width * 0.11, y - rect.height * 0.04);
    ctx.lineTo(x + rect.width * 0.18, y - rect.height * 0.04);
    ctx.stroke();
  }

  ctx.restore();
  drawBoardOutline(ctx, rect, "rgba(241, 236, 214, 0.42)");
}

function buildSampleGrid() {
  const cols = state.gridSize.cols;
  const rows = state.gridSize.rows;
  const grid = [];
  const starPoints = [
    [0.16, 0.18], [0.77, 0.14], [0.88, 0.33], [0.19, 0.72], [0.82, 0.79], [0.66, 0.65],
  ];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const nx = x / (cols - 1);
      const ny = y / (rows - 1);
      const dx = (nx - 0.52) * 1.42;
      const dy = (ny - 0.51) * 1.08;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const ellipse = Math.sqrt(((nx - 0.52) / 0.42) ** 2 + ((ny - 0.51) / 0.58) ** 2);
      let id = radial > 0.64 ? "deepBlue" : "blueFr4";

      if (ellipse < 0.28) id = "fr4";
      if (ellipse < 0.18) id = "blueCopper";
      if (ellipse < 0.105) id = "haslSilver";

      const ring = Math.abs(ellipse - 0.37);
      if (ring < 0.026) id = "whiteSilk";
      if (Math.abs(ellipse - 0.5) < 0.022) id = "haslSilver";
      if (Math.abs(ellipse - 0.61) < 0.017) id = "blueCopper";

      for (const [sx, sy] of starPoints) {
        const distance = Math.hypot(nx - sx, ny - sy);
        if (distance < 0.018) id = "whiteSilk";
        else if (distance < 0.034) id = "haslSilver";
      }

      const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      if (hash > 0.987 && radial > 0.22) id = "whiteSilk";
      else if (hash > 0.968 && radial > 0.35) id = "haslSilver";

      if ((x % 17 === 0 && y > rows * 0.17 && y < rows * 0.79) || (y % 21 === 0 && x > cols * 0.17 && x < cols * 0.82)) {
        id = hash > 0.5 ? "blueCopper" : "haslSilver";
      }

      grid.push(id);
    }
  }

  return grid;
}

function createWorkCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function buildImageGrid() {
  const detail = state.adjustments.detail;
  const aspect = clamp(state.board.width / state.board.height || 1, 0.25, 4);
  const cols = Math.round(58 + detail * 0.66);
  const rows = Math.max(32, Math.round(cols / aspect));
  state.gridSize = { cols, rows };

  const workCanvas = createWorkCanvas(cols, rows);
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
  workCtx.imageSmoothingEnabled = state.adjustments.smoothing > 14;
  workCtx.fillStyle = "#0b1c25";
  workCtx.fillRect(0, 0, cols, rows);
  drawImageToRect(workCtx, state.image, { x: 0, y: 0, width: cols, height: rows });
  const imageData = workCtx.getImageData(0, 0, cols, rows).data;
  const quantized = quantizeMaterialGrid({
    data: imageData,
    width: cols,
    height: rows,
    palette,
    diffusionStrength: 0.46,
  });
  const grid = [];
  let copperEdgeCells = 0;
  let copperRoundedCornerCells = 0;
  let layerBoardContainmentCells = 0;

  for (let cellIndex = 0; cellIndex < quantized.grid.length; cellIndex += 1) {
    let closest = paletteById.get(quantized.grid[cellIndex]);
    const edgeClearance = cellEdgeClearanceMm(cellIndex, { cols, rows }, state.board);
    const copperCandidate = closest.layers.topCopper || closest.layers.bottomCopper;
    const needsEdgeFix = copperCandidate && edgeClearance !== null && edgeClearance < BLUE_CLASSIC_PROFILE.rules.minCopperEdgeClearanceMm;
    const needsRoundedCornerFix = copperCandidate && state.board.rounded && !isCellInsideBoard(cellIndex, { cols, rows }, state.board);
    const layerCandidate = copperCandidate || closest.layers.silk
      || isSideMaskOpening(closest, "top", BLUE_CLASSIC_PROFILE.maskDefault)
      || isSideMaskOpening(closest, "bottom", BLUE_CLASSIC_PROFILE.maskDefault);
    const needsBoardFitFix = layerCandidate && !isCellInsideBoard(cellIndex, { cols, rows }, state.board);
    if (needsEdgeFix || needsBoardFitFix) {
      closest = paletteById.get("blueFr4");
      if (needsEdgeFix) copperEdgeCells += 1;
      if (needsRoundedCornerFix) copperRoundedCornerCells += 1;
      if (needsBoardFitFix) layerBoardContainmentCells += 1;
    }

    grid.push(closest.id);
  }

  state.autoFixes = { copperEdgeCells, copperRoundedCornerCells, layerBoardContainmentCells };

  return grid;
}

function drawGrid(ctx, canvas, rect) {
  if (!state.grid) return;
  const { cols, rows } = state.gridSize;
  const cellWidth = rect.width / cols;
  const cellHeight = rect.height / rows;

  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, state.board.rounded ? (state.board.radius / state.board.width) * rect.width : 0);
  ctx.clip();
  ctx.fillStyle = "#102e40";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.imageSmoothingEnabled = false;

  for (let index = 0; index < state.grid.length; index += 1) {
    const col = state.viewSide === "bottom" ? cols - 1 - (index % cols) : index % cols;
    const y = Math.floor(index / cols);
    ctx.fillStyle = renderedMaterialColor({
      material: paletteById.get(state.grid[index]),
      side: state.viewSide,
      visibility: state.visibility,
      profile: BLUE_CLASSIC_PROFILE,
    });
    ctx.fillRect(rect.x + col * cellWidth, rect.y + y * cellHeight, Math.ceil(cellWidth + 0.3), Math.ceil(cellHeight + 0.3));
  }

  ctx.restore();
  drawBoardOutline(ctx, rect);
  drawBoardRegistration(ctx, rect);
}

function drawBoardRegistration(ctx, rect) {
  const color = "rgba(235, 220, 177, 0.55)";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  const points = [
    [rect.x + 17, rect.y + 17],
    [rect.x + rect.width - 17, rect.y + rect.height - 17],
  ];
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderOriginal() {
  const canvas = dom.originalCanvas;
  const ctx = canvas.getContext("2d");
  drawFrameBackground(ctx, canvas, "#0c1b23");
  const rect = getBoardRect(canvas);

  if (state.image) {
    ctx.save();
    roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, state.board.rounded ? (state.board.radius / state.board.width) * rect.width : 0);
    ctx.clip();
    drawImageToRect(ctx, state.image, rect);
    ctx.restore();
    drawBoardOutline(ctx, rect, "rgba(235, 220, 177, 0.34)");
    dom.originalEmptyNote.hidden = true;
  } else {
    drawSampleSource(ctx, rect);
    dom.originalEmptyNote.hidden = true;
  }
}

function renderPcb() {
  const canvas = dom.pcbCanvas;
  const ctx = canvas.getContext("2d");
  drawFrameBackground(ctx, canvas, "#091922");
  const rect = getBoardRect(canvas);
  drawGrid(ctx, canvas, rect);
}

const MATERIAL_HINTS = {
  whiteSilk: "白色丝印——印在蓝色阻焊上的白漆，成品里最亮的颜色",
  haslSilver: "露铜 + 喷锡（HASL）——没有蓝漆覆盖的铜，呈银白色金属光泽",
  blueCopper: "蓝漆下的铜——铜上盖蓝油，比无铜处的蓝稍微亮一点",
  blueFr4: "蓝漆下的玻纤板——经典电路板的蓝色底色",
  fr4: "裸露基材——阻焊开窗且下面没有铜，露出黄色的玻璃纤维",
  deepBlue: "底层铜——深色细节会做到背面板上；正面看它就是普通蓝漆，翻到背面才是深蓝图案",
};

const LAYER_HINTS = {
  topCopper: "顶层线路铜箔（Gerber GTL）",
  topMask: "顶层阻焊开窗（GTS）——关掉它可以模拟看到裸露的铜",
  bottomCopper: "底层线路铜箔（GBL）——实物要翻到背面才可见",
  bottomMask: "底层阻焊开窗（GBS）",
  silk: "顶层丝印（GTO）——白色油漆文字/图形",
};

const CHECK_HINTS = {
  "source-image": "点右上「导入你的图像」上传一张 JPG / PNG / WebP 图片。",
  "board-dimensions": "把成板规格里的宽和高调整到 30–300 mm 之间。",
  "grid-shape": "点「恢复校准样本」重置后再重新上传图片。",
  "layer-alignment": "内部状态异常：刷新页面，或点「恢复校准样本」。",
  "corner-geometry": "把圆角半径调小（不能超过短边的一半），或切换为方角。",
  "minimum-feature": "格子小于 0.25mm 制造极限：降低「细节」滑块、缩小板面内容或增大板子尺寸。",
  "copper-edge-clearance": "铜离板边太近：量化时通常会自动加安全边框；仍失败就降低细节或微调尺寸。",
  "layer-board-containment": "有图案越过板框：已自动换成安全材料；若仍失败请重新载入图片。",
  "geometry-complexity": "格点数超过 24000 上限：降低「细节」滑块，或减小板子尺寸。",
  "profile-contract": "制造配置异常：刷新页面恢复默认 Blue Classic 档案。",
  "gerber-round-trip": "内部 Gerber 自检失败：刷新页面重试；若复现请到 GitHub 提 issue。",
  "board-outline-binding": "板框数据异常：刷新页面，或点「恢复校准样本」。",
  "mask-intent-contract": "材料阻焊声明缺失：刷新页面恢复默认调色板。",
  "layer-semantic-contract": "Gerber 声明与图层契约不一致：刷新页面重试。",
  "cross-layer-semantic-contract": "材料到图层映射不一致：刷新页面重试。",
};

function renderPalette() {
  dom.paletteList.innerHTML = palette
    .map(
      (item) => `
        <div class="palette-swatch" title="${MATERIAL_HINTS[item.id] || item.label}">
          <span class="palette-color" style="background:${item.color}"></span>
          <span>${item.shortLabel}</span>
        </div>
      `,
    )
    .join("");
}

function renderLayerToggles() {
  dom.layerToggles.innerHTML = layerDefinitions
    .map(
      (layer) => `
        <button class="layer-toggle${state.visibility[layer.id] ? " is-visible" : ""}" type="button" data-layer="${layer.id}" aria-pressed="${state.visibility[layer.id]}" title="${LAYER_HINTS[layer.id] || layer.label}">
          ${layer.shortLabel}
        </button>
      `,
    )
    .join("");
}

function evaluateManufacturability(project) {
  const checks = project.report.checks;
  const warnings = [...project.report.warnings];

  if (state.adjustments.detail > 84) warnings.push("高细节会增加图层复杂度，请在 Gerber Viewer 中确认简化结果。");
  if (state.adjustments.smoothing < 10) warnings.push("边缘平滑较低，细碎区域可能需要人工复核。");
  if (project.report.status === "BLOCKED") warnings.unshift("存在硬性制造输入问题，正式 ZIP 导出已禁用。");

  dom.checkList.innerHTML = checks
    .map(
      (check) => `
        <div class="check-item${check.pass ? "" : " is-failed"}">
          <span class="check-icon">${check.pass ? "✓" : "!"}</span>
          <strong>${check.label}</strong>
          <small>${check.detail}</small>
          ${check.pass ? "" : `<small class="check-hint">怎么修：${CHECK_HINTS[check.id] || "请刷新页面后重试。"}</small>`}
        </div>
      `,
    )
    .join("");

  const isReady = project.report.status === "READY";
  dom.readinessBadge.classList.toggle("is-blocked", !isReady);
  dom.readinessText.textContent = isReady ? "READY" : "BLOCKED";
  dom.readinessNote.textContent = isReady ? "可下载内部检查通过的 Gerber 包" : state.image ? "修正硬性检查后再导出" : "上传原图后才可生成制造包";
  dom.exportButton.disabled = !isReady;
  dom.reviewExportButton.disabled = !isReady;
  dom.warningText.textContent = warnings.slice(0, 3).join(" ");
}

function updateOutputs() {
  for (const [key, input] of Object.entries(adjustmentInputs)) {
    state.adjustments[key] = Number(input.value);
    const output = adjustmentOutputs[key];
    if (key === "cropFocus") output.textContent = `${input.value}%`;
    else output.textContent = input.value;
  }
  dom.radiusValue.textContent = Number(dom.radiusInput.value).toFixed(1);
  dom.widthInput.value = Number(state.board.width).toFixed(1);
  dom.heightInput.value = Number(state.board.height).toFixed(1);
  dom.radiusInput.value = state.board.radius;
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function setFeedback(message = "预览已更新") {
  if (!dom.adjustmentFeedback) return;
  const { brightness, contrast, detail, smoothing, cropFocus } = state.adjustments;
  dom.adjustmentFeedback.textContent = `${message} · 网格 ${state.gridSize.cols} × ${state.gridSize.rows} · 亮度 ${formatSigned(brightness)} · 对比度 ${formatSigned(contrast)} · 细节 ${detail} · 平滑 ${smoothing} · 裁剪 ${cropFocus}%`;
}

function rebuildGrid() {
  if (state.image) state.grid = buildImageGrid();
  else {
    state.gridSize = { cols: 108, rows: 77 };
    state.grid = buildSampleGrid();
    state.autoFixes = { copperEdgeCells: 0, copperRoundedCornerCells: 0, layerBoardContainmentCells: 0 };
  }
}

function renderAll() {
  rebuildGrid();
  state.project = generatePCBArtProject({
    grid: state.grid,
    gridSize: state.gridSize,
    board: state.board,
    materials: palette,
    source: {
      fileName: state.sourceName,
      width: state.image?.naturalWidth ?? null,
      height: state.image?.naturalHeight ?? null,
    },
    imagePresent: Boolean(state.image),
    adjustments: state.adjustments,
    autoFixes: state.autoFixes,
    profile: BLUE_CLASSIC_PROFILE,
  });
  renderOriginal();
  renderPcb();
  renderLayerToggles();
  evaluateManufacturability(state.project);
  updateOutputs();
  setFeedback();
  dom.sourceLabel.textContent = state.sourceName;
  dom.sourceStatus.innerHTML = `<span class="status-dot"></span><span>${state.image ? "本地读取 · 未上传服务器" : "当前使用内置校准样本"}</span>`;
  dom.radiusField.style.opacity = state.board.rounded ? "1" : "0.42";
  dom.radiusInput.disabled = !state.board.rounded;
}

function readImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (state.image?.src?.startsWith("blob:")) URL.revokeObjectURL(state.image.src);
    state.image = image;
    state.sourceName = file.name;
    renderAll();
    dom.uploadDropzone.classList.remove("is-dragging");
  };
  image.src = url;
}

function restoreSample() {
  if (state.image?.src?.startsWith("blob:")) URL.revokeObjectURL(state.image.src);
  state.image = null;
  state.sourceName = "Calibration sample";
  dom.imageInput.value = "";
  renderAll();
  setFeedback("已恢复校准样本");
}

function downloadBytes(filename, bytes, type = "application/octet-stream") {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function exportManufacturingPackage() {
  if (dom.exportButton.disabled) return;
  const artifact = buildManufacturingPackage(state.project);
  downloadBytes(artifact.packageName, artifact.bytes, "application/zip");
  dom.exportButton.querySelector("span").textContent = `Manufacturing ZIP · ${artifact.fileCount} Gerbers`;
  dom.exportButton.dataset.packageFiles = String(artifact.fileCount);
  setFeedback("制造 ZIP 已生成");
  window.setTimeout(() => {
    dom.exportButton.querySelector("span").textContent = "Download manufacturing package";
  }, 2600);
}

function exportReviewPackage() {
  if (dom.reviewExportButton.disabled) return;
  const artifact = buildReviewPackage(state.project, {
    previewDataUrls: {
      original: dom.originalCanvas.toDataURL("image/png"),
      pcb: dom.pcbCanvas.toDataURL("image/png"),
      layer: dom.pcbCanvas.toDataURL("image/png"),
    },
  });
  downloadBytes(artifact.packageName, artifact.bytes, "application/zip");
  dom.reviewExportButton.querySelector("span").textContent = `Review ZIP · ${artifact.fileCount} files`;
  dom.reviewExportButton.dataset.packageFiles = String(artifact.fileCount);
  setFeedback("评审 ZIP 已生成");
  window.setTimeout(() => {
    dom.reviewExportButton.querySelector("span").textContent = "Download review bundle";
  }, 2600);
}

function bindEvents() {
  dom.imageInput.addEventListener("change", (event) => readImage(event.target.files?.[0]));
  dom.uploadDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.uploadDropzone.classList.add("is-dragging");
  });
  dom.uploadDropzone.addEventListener("dragleave", () => dom.uploadDropzone.classList.remove("is-dragging"));
  dom.uploadDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.uploadDropzone.classList.remove("is-dragging");
    readImage(event.dataTransfer.files?.[0]);
  });

  for (const [key, input] of Object.entries(adjustmentInputs)) {
    input.addEventListener("input", () => {
      state.adjustments[key] = Number(input.value);
      renderAll();
    });
  }

  dom.widthInput.addEventListener("input", () => {
    state.board.width = Number(dom.widthInput.value) || 0;
    renderAll();
  });
  dom.heightInput.addEventListener("input", () => {
    state.board.height = Number(dom.heightInput.value) || 0;
    renderAll();
  });
  dom.radiusInput.addEventListener("input", () => {
    state.board.radius = Number(dom.radiusInput.value);
    renderAll();
  });

  document.querySelectorAll("[data-corner]").forEach((button) => {
    button.addEventListener("click", () => {
      state.board.rounded = button.dataset.corner === "rounded";
      document.querySelectorAll("[data-corner]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderAll();
      setFeedback(`板角已切换为${state.board.rounded ? "圆角" : "方角"}`);
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-selected", item === button));
      document.querySelector(".preview-stage").dataset.viewMode = button.dataset.view;
      setFeedback(`预览模式：${button.dataset.view === "pcb" ? "PCB only" : "Compare"}`);
    });
  });

  function setViewSide(side) {
    if (state.viewSide === side) return;
    state.viewSide = side;
    dom.viewTopButton.classList.toggle("is-active", side === "top");
    dom.viewBottomButton.classList.toggle("is-active", side === "bottom");
    dom.paneMetaPcb.textContent = side === "top" ? "APPROXIMATION · 正面" : "APPROXIMATION · 背面（水平镜像）";
    renderPcb();
    setFeedback(side === "top" ? "正在查看正面" : "正在查看背面（已水平镜像，与实物翻面一致）");
  }
  dom.viewTopButton.addEventListener("click", () => setViewSide("top"));
  dom.viewBottomButton.addEventListener("click", () => setViewSide("bottom"));

  dom.layerToggles.addEventListener("click", (event) => {
    const button = event.target.closest("[data-layer]");
    if (!button) return;
    const layerId = button.dataset.layer;
    state.visibility[layerId] = !state.visibility[layerId];
    renderPcb();
    renderLayerToggles();
    setFeedback("图层预览已更新");
  });

  dom.exportButton.addEventListener("click", exportManufacturingPackage);
  dom.reviewExportButton.addEventListener("click", exportReviewPackage);
  document.querySelector("#resetButton").addEventListener("click", restoreSample);
}

renderPalette();
bindEvents();
renderAll();
