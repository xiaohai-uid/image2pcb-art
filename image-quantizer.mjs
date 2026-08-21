function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorDistance(a, b) {
  const redMean = (a[0] + b[0]) / 2;
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return ((512 + redMean) * red * red) / 256 + 4 * green * green + ((767 - redMean) * blue * blue) / 256;
}

function addError(work, index, error, weight) {
  const offset = index * 3;
  work[offset] += error[0] * weight;
  work[offset + 1] += error[1] * weight;
  work[offset + 2] += error[2] * weight;
}

function nearestMaterial(color, palette) {
  let closest = palette[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const distance = colorDistance(color, candidate.rgb);
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
      const material = nearestMaterial(color, palette);
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
