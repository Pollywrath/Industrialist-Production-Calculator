import type { Point } from '../renderer/edge-view';
import type { SelectionMode } from './selection-box';

export interface SelectionBoxGesture {
  readonly start: Point;
  readonly current: Point;
  readonly mode: SelectionMode;
}

export function shouldRebuildProjectedPlanForSelection(
  previous: { readonly type: string } | null,
  next: { readonly type: string } | null,
): boolean {
  return next?.type !== 'edge' || previous?.type === 'group';
}

export function createSelectionController() {
  let gesture: SelectionBoxGesture | null = null;

  return {
    begin(start: Point, mode: SelectionMode) {
      gesture = { start: { ...start }, current: { ...start }, mode };
    },
    update(current: Point) {
      if (!gesture) return false;
      gesture = { ...gesture, current: { ...current } };
      return true;
    },
    finish() {
      const finished = gesture;
      gesture = null;
      return finished;
    },
    cancel() {
      const wasActive = gesture !== null;
      gesture = null;
      return wasActive;
    },
    getActive: () => gesture,
    isActive: () => gesture !== null,
  };
}
