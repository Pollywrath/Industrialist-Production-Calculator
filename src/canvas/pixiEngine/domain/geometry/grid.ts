export const SNAP_GRID_X = 19;
export const SNAP_GRID_Y = 13;
export const GRID_DOT_SIZE = 1.5;
export const MIN_GRID_TEXTURE_RESOLUTION = 4;

export function getGridTextureResolution(rendererResolution: number, maxZoom: number) {
  if (!Number.isFinite(rendererResolution) || rendererResolution <= 0)
    return MIN_GRID_TEXTURE_RESOLUTION;
  if (!Number.isFinite(maxZoom) || maxZoom <= 0) return MIN_GRID_TEXTURE_RESOLUTION;
  return Math.max(MIN_GRID_TEXTURE_RESOLUTION, Math.ceil(rendererResolution * maxZoom));
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function snapPosition(point: Point): Point {
  return {
    x: Math.round(point.x / SNAP_GRID_X) * SNAP_GRID_X,
    y: Math.round(point.y / SNAP_GRID_Y) * SNAP_GRID_Y,
  };
}
