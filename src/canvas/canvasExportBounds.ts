export interface CanvasExportBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CanvasExportFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

export interface CanvasExportTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const MAX_CANVAS_EXPORT_PIXELS = 16_777_216;

export function createCanvasExportTiles(
  width: number,
  height: number,
  maxTileDimension: number,
): CanvasExportTile[] | null {
  if (
    ![width, height, maxTileDimension].every(Number.isSafeInteger) ||
    width <= 0 ||
    height <= 0 ||
    maxTileDimension <= 0
  ) {
    return null;
  }

  const tiles: CanvasExportTile[] = [];
  for (let y = 0; y < height; y += maxTileDimension) {
    const tileHeight = Math.min(maxTileDimension, height - y);
    for (let x = 0; x < width; x += maxTileDimension) {
      tiles.push({
        x,
        y,
        width: Math.min(maxTileDimension, width - x),
        height: tileHeight,
      });
    }
  }
  return tiles;
}

export function unionCanvasExportBounds(
  bounds: readonly (CanvasExportBounds | null | undefined)[],
): CanvasExportBounds | null {
  let result: CanvasExportBounds | null = null;
  for (const item of bounds) {
    if (!item) continue;
    result = result
      ? {
          minX: Math.min(result.minX, item.minX),
          minY: Math.min(result.minY, item.minY),
          maxX: Math.max(result.maxX, item.maxX),
          maxY: Math.max(result.maxY, item.maxY),
        }
      : item;
  }
  return result;
}

export function createCanvasExportFrame(
  bounds: CanvasExportBounds,
  padding: number,
  maxDimension: number,
  maxPixels = MAX_CANVAS_EXPORT_PIXELS,
): CanvasExportFrame | null {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (
    ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, padding, maxDimension, maxPixels].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height <= 0 ||
    padding < 0 ||
    maxDimension <= 0 ||
    maxPixels <= 0 ||
    padding * 2 >= maxDimension
  ) {
    return null;
  }

  const maxResolution = Math.min(
    1,
    (maxDimension - padding * 2) / width,
    (maxDimension - padding * 2) / height,
  );
  const fits = (resolution: number) => {
    const outputWidth = Math.ceil(width * resolution + padding * 2);
    const outputHeight = Math.ceil(height * resolution + padding * 2);
    return (
      outputWidth <= maxDimension &&
      outputHeight <= maxDimension &&
      outputWidth * outputHeight <= maxPixels
    );
  };

  let resolution = maxResolution;
  if (!fits(resolution)) {
    let low = 0;
    let high = maxResolution;
    for (let iteration = 0; iteration < 56; iteration++) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    resolution = low;
  }
  if (!(resolution > 0) || !Number.isFinite(resolution)) return null;

  const graphPadding = padding / resolution;
  const frameX = bounds.minX - graphPadding;
  const frameY = bounds.minY - graphPadding;
  const frameWidth = width + graphPadding * 2;
  const frameHeight = height + graphPadding * 2;
  if (![frameX, frameY, frameWidth, frameHeight].every(Number.isFinite)) return null;
  return {
    x: frameX,
    y: frameY,
    width: frameWidth,
    height: frameHeight,
    resolution,
  };
}
