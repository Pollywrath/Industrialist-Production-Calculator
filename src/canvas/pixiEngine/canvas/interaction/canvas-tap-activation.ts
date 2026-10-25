export const CANVAS_TAP_SLOP_CSS_PX = 8;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PendingTapActivation {
  readonly start: Point;
  readonly activate: () => void;
}

export function createCanvasTapActivation() {
  let pending: PendingTapActivation | null = null;

  return {
    begin(start: Point, activate: () => void) {
      pending = { start: { x: start.x, y: start.y }, activate };
    },
    cancel() {
      pending = null;
    },
    activate(point: Point, cssScaleX: number, cssScaleY: number) {
      const current = pending;
      pending = null;
      if (!current) return false;

      const distanceX = (point.x - current.start.x) * cssScaleX;
      const distanceY = (point.y - current.start.y) * cssScaleY;
      if (Math.hypot(distanceX, distanceY) > CANVAS_TAP_SLOP_CSS_PX) return false;

      return current.activate;
    },
  };
}
