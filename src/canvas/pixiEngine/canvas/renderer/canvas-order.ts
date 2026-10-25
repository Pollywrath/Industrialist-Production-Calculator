import { bottommostRenderOrder, topmostRenderOrder, type RenderBand } from './render-order';

export type CanvasOrderScope = 'node' | 'group';

export interface CanvasOrderEntry {
  readonly id: string;
  readonly order: number;
}

interface OrderLane {
  readonly orders: Map<string, number>;
  history: CanvasOrderEntry[];
  nextOrder: number;
}

export class CanvasOrderModel {
  private readonly lanes: Record<CanvasOrderScope, OrderLane> = {
    node: { orders: new Map(), history: [], nextOrder: 0 },
    group: { orders: new Map(), history: [], nextOrder: 0 },
  };

  has(id: string, scope: CanvasOrderScope) {
    return this.lanes[scope].orders.has(id);
  }

  get(id: string, scope: CanvasOrderScope) {
    return this.lanes[scope].orders.get(id) ?? -1;
  }

  get historyEntries() {
    return this.lanes.node.history;
  }

  ensure(id: string, scope: CanvasOrderScope) {
    const lane = this.lanes[scope];
    if (lane.orders.has(id)) return false;
    this.assign(id, lane);
    return true;
  }

  raise(id: string, scope: CanvasOrderScope) {
    const lane = this.lanes[scope];
    if (lane.orders.get(id) === lane.nextOrder - 1) return false;
    this.assign(id, lane);
    return true;
  }

  bringToFront(id: string, scope: CanvasOrderScope) {
    const lane = this.lanes[scope];
    this.assign(id, lane);
    return lane.orders.get(id)!;
  }

  delete(id: string, scope: CanvasOrderScope) {
    return this.lanes[scope].orders.delete(id);
  }

  topmostFirst(ids: readonly string[], scope: CanvasOrderScope, band: RenderBand) {
    return topmostRenderOrder(ids.map((id) => ({ id, order: this.get(id, scope), band }))).map(
      ({ id }) => id,
    );
  }

  bottommostFirst(ids: readonly string[], scope: CanvasOrderScope, band: RenderBand) {
    return bottommostRenderOrder(ids.map((id) => ({ id, order: this.get(id, scope), band }))).map(
      ({ id }) => id,
    );
  }

  private assign(id: string, lane: OrderLane) {
    const order = lane.nextOrder++;
    lane.orders.set(id, order);
    lane.history.push({ id, order });
    if (lane.history.length > lane.orders.size * 2 + 32) this.compactHistory(lane);
  }

  private compactHistory(lane: OrderLane) {
    lane.history = [...lane.orders]
      .sort((left, right) => left[1] - right[1])
      .map(([id, order]) => ({ id, order }));
  }
}
