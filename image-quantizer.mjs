function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// sRGB → CIELAB (D65). Perceptually uniform enough for a 6-tone palette;
// CIE76 ΔE is deliberately simple (see ADR 0002 / competitor analysis).
export function srgbToLab(rgb) {
  const [r, g, b] = rgb.map((value) => {
    const channel = clamp(value, 0, 255) / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(a, b) {
  const labA = srgbToLab(a);
  const labB = srgbToLab(b);
  return Math.hypot(labA[0] - labB[0], labA[1] - labB[1], labA[2] - labB[2]);
}

function addError(work, index, error, weight) {
  const offset = index * 3;
  work[offset] += error[0] * weight;
  work[offset + 1] += error[1] * weight;
  work[offset + 2] += error[2] * weight;
}

function nearestMaterial(color, candidates) {
  let closest = candidates[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  const lab = srgbToLab(color);

  for (const candidate of candidates) {
    const target = candidate.lab;
    const distance =
      (lab[0] - target[0]) ** 2 + (lab[1] - target[1]) ** 2 + (lab[2] - target[2]) ** 2;
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}

export function quantizeMaterialGrid({ data, width, height, palette, diffusionStrength = 0.72 }) {
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("quantizeMaterialGrid requires a non-empty pixel buffer and dimensions");
  }
  if (!Array.isArray(palette) || palette.length === 0) {
    throw new Error("quantizeMaterialGrid requires a non-empty palette");
  }

  const candidates = palette.map((material) => ({ material, lab: srgbToLab(material.rgb) }));
  const work = new Float32Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * 4;
    const targetOffset = index * 3;
    work[targetOffset] = data[sourceOffset] ?? 0;
    work[targetOffset + 1] = data[sourceOffset + 1] ?? 0;
    work[targetOffset + 2] = data[sourceOffset + 2] ?? 0;
  }

  const strength = clamp(Number(diffusionStrength) || 0, 0, 1);
  const grid = new Array(width * height);
  let luminanceTotal = 0;

  for (let y = 0; y < height; y += 1) {
    const reverse = y % 2 === 1;
    const start = reverse ? width - 1 : 0;
    const end = reverse ? -1 : width;
    const step = reverse ? -1 : 1;

    for (let x = start; x !== end; x += step) {
      const cellIndex = y * width + x;
      const offset = cellIndex * 3;
      const color = [
        clamp(work[offset], 0, 255),
        clamp(work[offset + 1], 0, 255),
        clamp(work[offset + 2], 0, 255),
      ];
      const { material } = nearestMaterial(color, candidates);
      grid[cellIndex] = material.id;
      luminanceTotal += 0.2126 * material.rgb[0] + 0.7152 * material.rgb[1] + 0.0722 * material.rgb[2];

      const error = [
        color[0] - material.rgb[0],
        color[1] - material.rgb[1],
        color[2] - material.rgb[2],
      ];
      const right = x + step;
      const left = x - step;
      if (right >= 0 && right < width) addError(work, y * width + right, error, (7 / 16) * strength);
      if (y + 1 < height) {
        if (left >= 0 && left < width) addError(work, (y + 1) * width + left, error, (3 / 16) * strength);
        addError(work, (y + 1) * width + x, error, (5 / 16) * strength);
        if (right >= 0 && right < width) addError(work, (y + 1) * width + right, error, (1 / 16) * strength);
      }
    }
  }

  return {
    grid,
    metrics: {
      averageLuminance: luminanceTotal / (width * height),
      uniqueMaterials: new Set(grid).size,
    },
  };
}
