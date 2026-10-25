export type SelectionMode = 'full' | 'partial';
export interface SelectionBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function getSelectionBox(
  start: { readonly x: number; readonly y: number },
  current: { readonly x: number; readonly y: number },
): SelectionBounds {
  return {
    minX: Math.min(start.x, current.x),
    minY: Math.min(start.y, current.y),
    maxX: Math.max(start.x, current.x),
    maxY: Math.max(start.y, current.y),
  };
}

export function matchesSelectionBox(
  candidate: SelectionBounds,
  selection: SelectionBounds,
  mode: SelectionMode = 'full',
) {
  if (mode === 'full') {
    return (
      candidate.minX >= selection.minX &&
      candidate.minY >= selection.minY &&
      candidate.maxX <= selection.maxX &&
      candidate.maxY <= selection.maxY
    );
  }
  return (
    candidate.minX <= selection.maxX &&
    candidate.maxX >= selection.minX &&
    candidate.minY <= selection.maxY &&
    candidate.maxY >= selection.minY
  );
}
