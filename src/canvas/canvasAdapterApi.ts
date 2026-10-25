export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasBounds extends CanvasPoint {
  width: number;
  height: number;
}

export interface CanvasPngExportOptions {
  backgroundColor: string;
  padding: number;
  maxDimension: number;
  maxPixels: number;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasViewState {
  center: CanvasPoint;
  zoom: number;
}

export function getViewportCenteredOnGraphPoint(point: CanvasPoint, zoom: number): CanvasViewport {
  return {
    x: -point.x * zoom,
    y: -point.y * zoom,
    zoom,
  };
}

export type CanvasGeometryListener = () => void;
export type CanvasEdgeClickListener = (edgeId: string, point: CanvasPoint) => void;

export interface CanvasAdapterApi {
  readonly canvasType: 'pixi' | 'react-flow';
  screenToGraph(point: CanvasPoint): CanvasPoint;
  getViewport?(): CanvasViewport;
  getViewState?(): CanvasViewState | undefined;
  setViewState?(state: CanvasViewState): void;
  centerOnGraphPoint(point: CanvasPoint, zoom: number, duration?: number): void;
  fitGraph(): void;
  getNodeBounds(nodeId: string, space?: 'graph' | 'screen'): CanvasBounds | null;
  getPortBounds(nodeId: string, portId: string, space?: 'graph' | 'screen'): CanvasBounds | null;
  getPortRowBounds?(
    nodeId: string,
    portId: string,
    space?: 'graph' | 'screen',
  ): CanvasBounds | null;
  getControlBounds?(
    entityId: string,
    controlIdOrAction: string,
    space?: 'graph' | 'screen',
  ): CanvasBounds | null;
  getGroupHeaderBounds?(groupId: string, space?: 'graph' | 'screen'): CanvasBounds | null;
  getEdgeGeometry(
    edgeId: string,
    space?: 'graph' | 'screen',
  ): { points: readonly CanvasPoint[]; bounds: CanvasBounds } | null;
  subscribeViewport?(listener: CanvasGeometryListener): () => void;
  subscribeResize?(listener: CanvasGeometryListener): () => void;
  subscribeScene?(listener: CanvasGeometryListener): () => void;
  subscribeEdgeClick?(listener: CanvasEdgeClickListener): () => void;
  exportCanvasPng?(options: CanvasPngExportOptions): Promise<Blob>;
  selectNodes(nodeIds: readonly string[], primaryNodeId?: string): void;
  selectEdge(edgeId: string): void;
  selectGroup(groupId: string): void;
}

export function hasPixiCanvasPngExporter(
  adapter: CanvasAdapterApi | null,
): adapter is CanvasAdapterApi & {
  exportCanvasPng: NonNullable<CanvasAdapterApi['exportCanvasPng']>;
} {
  return adapter?.canvasType === 'pixi' && typeof adapter.exportCanvasPng === 'function';
}

let activeCanvasAdapter: CanvasAdapterApi | null = null;
const adapterListeners = new Set<CanvasGeometryListener>();
let pendingCanvasViewState: CanvasViewState | null = null;

function notifyAdapterChanged() {
  for (const listener of adapterListeners) listener();
}

export function registerCanvasAdapter(api: CanvasAdapterApi): () => void {
  activeCanvasAdapter = api;
  if (pendingCanvasViewState && api.setViewState) {
    api.setViewState(pendingCanvasViewState);
    pendingCanvasViewState = null;
  }
  notifyAdapterChanged();
  return () => {
    if (activeCanvasAdapter !== api) return;
    activeCanvasAdapter = null;
    notifyAdapterChanged();
  };
}

export function setPendingCanvasViewState(state: CanvasViewState): void {
  pendingCanvasViewState = state;
}

export function getCanvasAdapter(): CanvasAdapterApi | null {
  return activeCanvasAdapter;
}

export function getCanvasNodeCenter(nodeId: string, fallback: CanvasBounds): CanvasPoint {
  const bounds = activeCanvasAdapter?.getNodeBounds(nodeId, 'graph') ?? fallback;
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function subscribeCanvasAdapter(listener: CanvasGeometryListener): () => void {
  adapterListeners.add(listener);
  return () => adapterListeners.delete(listener);
}
