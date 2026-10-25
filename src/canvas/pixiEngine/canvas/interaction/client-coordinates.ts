export interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export function clientPointToCanvas(
  clientX: number,
  clientY: number,
  bounds: ClientRectLike,
  screenWidth: number,
  screenHeight: number,
): CanvasPoint | null {
  if (bounds.width <= 0 || bounds.height <= 0 || screenWidth <= 0 || screenHeight <= 0) return null;
  return {
    x: (clientX - bounds.left) * (screenWidth / bounds.width),
    y: (clientY - bounds.top) * (screenHeight / bounds.height),
  };
}
