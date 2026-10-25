import { compareRenderOrder, topmostRenderOrder, type RenderOrder } from '../renderer/render-order';

export type NavigationDirection = 'left' | 'right' | 'up' | 'down';

export interface NavigableGraphItem extends RenderOrder {
  readonly centerX: number;
  readonly centerY: number;
  readonly type: 'node' | 'group';
}

export function getFirstNavigableItem(items: readonly NavigableGraphItem[]) {
  return topmostRenderOrder(items)[0] ?? null;
}

export function getLastNavigableItem(items: readonly NavigableGraphItem[]) {
  return [...items].sort(compareRenderOrder)[0] ?? null;
}

export function getDirectionalNavigationItem(
  items: readonly NavigableGraphItem[],
  currentId: string | null,
  direction: NavigationDirection,
) {
  const current = items.find((item) => item.id === currentId);
  if (!current) return getFirstNavigableItem(items);
  const candidates = items.flatMap((item) => {
    if (item.id === current.id) return [];
    const dx = item.centerX - current.centerX;
    const dy = item.centerY - current.centerY;
    const primary =
      direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
    if (primary <= 0) return [];
    const perpendicular =
      direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return [{ item, score: primary + perpendicular * 1.5 }];
  });
  candidates.sort(
    (left, right) => left.score - right.score || compareRenderOrder(right.item, left.item),
  );
  return candidates[0]?.item ?? null;
}
