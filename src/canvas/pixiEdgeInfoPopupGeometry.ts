import type { CanvasPoint } from './canvasAdapterApi';

export function getPixiPopupAnchor(clickPoint: CanvasPoint): CanvasPoint | null {
  if (!Number.isFinite(clickPoint.x) || !Number.isFinite(clickPoint.y)) return null;
  return { x: clickPoint.x + 14, y: clickPoint.y + 14 };
}

export function getPixiPopupEdgeIds(renderedEdgeId: string) {
  return {
    edgeId: renderedEdgeId.startsWith('proxy-')
      ? renderedEdgeId.slice('proxy-'.length)
      : renderedEdgeId,
    geometryEdgeId: renderedEdgeId,
  };
}
