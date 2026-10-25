export const RENDER_BAND = {
  groupFill: 10,
  edge: 20,
  groupChrome: 30,
  nodeBody: 40,
  nodeContent: 50,
  selectedGroupChrome: 60,
  selection: 70,
  connection: 80,
  edgeEditor: 90,
} as const;

export type RenderBand = (typeof RENDER_BAND)[keyof typeof RENDER_BAND];

export interface RenderOrder {
  readonly band: RenderBand;
  readonly order: number;
  readonly id: string;
}

export function compareRenderOrder(left: RenderOrder, right: RenderOrder) {
  return left.band - right.band || left.order - right.order || left.id.localeCompare(right.id);
}

export function topmostRenderOrder<T extends RenderOrder>(items: readonly T[]) {
  return [...items].sort((left, right) => compareRenderOrder(right, left));
}

export function bottommostRenderOrder<T extends RenderOrder>(items: readonly T[]) {
  return [...items].sort(compareRenderOrder);
}
