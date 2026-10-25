export const TOUCH_PORT_TARGET_SIZE_CSS_PX = 44;

export interface PortHitTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export function getPortHitRadius(
  pointerType: string,
  rendererPixelsPerCss: number,
  zoom: number,
  visibleHandleSize: number,
) {
  const targetSize = pointerType === 'touch' ? TOUCH_PORT_TARGET_SIZE_CSS_PX : visibleHandleSize;
  return Math.max(visibleHandleSize / 2, (targetSize * rendererPixelsPerCss) / (2 * zoom));
}

export function findNearestPortHit(
  targets: readonly PortHitTarget[],
  point: { readonly x: number; readonly y: number },
  radiusX: number,
  radiusY: number,
  cssPixelsPerRendererPixelX: number,
  cssPixelsPerRendererPixelY: number,
  zoom: number,
) {
  let nearest: PortHitTarget | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const deltaX = point.x - target.x;
    const deltaY = point.y - target.y;
    if (Math.abs(deltaX) > radiusX || Math.abs(deltaY) > radiusY) continue;

    const screenDeltaX = deltaX * zoom * cssPixelsPerRendererPixelX;
    const screenDeltaY = deltaY * zoom * cssPixelsPerRendererPixelY;
    const distance = screenDeltaX * screenDeltaX + screenDeltaY * screenDeltaY;
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }

  return nearest;
}
