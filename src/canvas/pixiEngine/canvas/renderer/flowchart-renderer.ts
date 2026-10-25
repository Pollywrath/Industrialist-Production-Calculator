import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type TextStyleFontWeight,
  Texture,
  TilingSprite,
  WebGPURenderer,
} from 'pixi.js';
import {
  GRID_DOT_SIZE,
  SNAP_GRID_X,
  SNAP_GRID_Y,
  getGridTextureResolution,
} from '../../domain/geometry/grid';
import {
  buildOrthogonalPathPoints,
  buildOrthogonalSegments,
  deleteOrthogonalTurnPair,
  distanceSquaredToSegment,
  getPortPathTangent,
  insertControlPoint,
  insertOrthogonalTurnPair,
  moveOrthogonalSegment,
  normalizeOrthogonalTurns,
  projectPointOntoSegment,
  snapEdgePoint,
  type RouteAnchors,
} from '../../domain/edges/flow/routing';
import {
  NODE_BORDER_WIDTH,
  NODE_HANDLE_SIZE,
  NODE_WIDTH,
  getPortRowBounds as getRecipePortRowBounds,
  getRecipeNodeSize,
  getRecipeNodeSizeForPortCounts,
} from '../../domain/nodes/recipe/geometry';
import {
  createCollapsedGroupNode,
  getGroupBounds,
  getGroupProxyPorts,
  GROUP_HEADER_HEIGHT,
  type GroupBounds,
  type GroupProxyPort,
} from '../../domain/nodes/group/geometry';
import type { EdgeControlPoint, FlowGroup, Viewport } from '../../domain/graph/types';
import type { FlowEdge } from '../../domain/edges/flow/model';
import type { RecipeNode as FlowNode } from '../../domain/nodes/recipe/model';
import { GraphStore, graphStore, type GraphChange } from '../../state/graph-store';
import {
  importGraphDocument as applyGraphDocument,
  serializeGraphDocument,
} from '../../state/graph-document';
import { MAX_ZOOM, ViewportStore, viewportStore } from '../../state/viewport-store';
import {
  getCanvasThemeColors,
  getThemeColorCss,
  parseThemeColorCss,
  THEME_COLOR,
} from '../../theme/theme-colors';
import {
  createEdgeCurve,
  edgeCurveIntersectsBounds,
  getEdgeCurveBounds,
  getEdgeCurvePoints,
  type EdgeCurve,
  type Point,
} from './edge-view';
import { GraphMeshRenderer } from './graph-mesh-renderer';
import {
  createCanvasExportFrame,
  createCanvasExportTiles,
  unionCanvasExportBounds,
} from './canvas-export-bounds';
import { drawCanvasExportTile } from './canvas-export-readback';
import { createNodePalette, type NodeRenderData } from './nodes/recipe';
import {
  COLLAPSED_GROUP_EXPAND_BUTTON,
  isInsideCollapsedGroupExpandButton,
  clearNodeText,
  createNodeView,
  getNodeTextVisibility,
  NODE_VIEW_POOL_LIMIT,
  retainNodeView,
  NODE_TEXT_RESOLUTION_SCALE,
  setNodeDetailLevel,
  updateNodeView,
  type NodeView,
} from './node-view';
import { SpatialIndex, type Bounds } from './spatial-index';
import {
  pickClosestEdge,
  pickClosestRoutePoint,
  pickDeletableTarget,
  pickTopmostNode,
} from './spatial-picking';
import {
  getCameraWorldBounds,
  queryVisibleEdges,
  queryVisibleNodes,
  updateIndexedVisibility,
} from './visibility';
import { createNodeDragInteraction } from '../interaction/node-drag';
import {
  createSelectionController,
  shouldRebuildProjectedPlanForSelection,
} from '../interaction/selection-controller';
import { AutoPanController } from '../interaction/auto-pan';
import { getSelectionBox, matchesSelectionBox } from '../interaction/selection-box';
import {
  getDirectionalNavigationItem,
  getFirstNavigableItem,
  getLastNavigableItem,
  type NavigationDirection,
  type NavigableGraphItem,
} from '../interaction/keyboard-navigation';
import {
  removeNodeOrGroup,
  shouldHandleDeleteTargetBeforeCanvasAction,
  shouldResolveDeleteAtPoint,
} from '../interaction/graph-deletion';
import { discardRoutePreview } from '../interaction/route-preview';
import {
  canConnectEndpoints,
  CONNECTION_SNAP_RADIUS_WORLD,
  findNearestConnectablePort,
  getConnectionPreviewAnchors,
  type ConnectionEndpoint,
  type ConnectionPortCandidate,
} from '../interaction/connection-draft';
import { createViewportInput } from '../interaction/viewport-input';
import { getViewportAfterZoom, getViewportCenteredOnBounds } from '../interaction/viewport-input';
import { createCanvasTapActivation } from '../interaction/canvas-tap-activation';
import {
  findNearestPortHit,
  getPortHitRadius,
  type PortHitTarget,
} from '../interaction/port-hit-testing';
import { createConnectionController } from '../interaction/connection-controller';
import type { CanvasActionHandler } from '../interaction/action-proposal';
import {
  resolveCanvasInteractionConfig,
  type CanvasInteractionConfig,
} from '../interaction/config';
import { VisibleGraphProjection } from '../../graph-view/visible-graph-projection';
import {
  createEmptyProjectedRenderPlan,
  createProjectedControls,
  makeProjectedNodeEntity,
  ProjectedRenderPlan,
  type ProjectedControl,
  type ProjectedEdgeEntity,
  type ProjectedGroupEntity,
  type ProjectedNodeEntity,
} from '../../graph-view/projected-render-plan';
import { clientPointToCanvas } from '../interaction/client-coordinates';
import { CanvasOrderModel } from './canvas-order';
import { bottommostRenderOrder, compareRenderOrder, RENDER_BAND } from './render-order';
import { GroupPresentationController, isExpandedGroupMenuAtPoint } from './group-presentation';
import { getOrderedGroupIncidentEdges, GroupProxyCache } from './group-projection';
import {
  boundsIntersect,
  collectOcclusionRefreshIds,
  containsBounds,
  getOcclusionTransitionBounds,
  NodeOcclusionController,
} from './node-occlusion';
import { runRenderFrame } from './render-frame';
import { createNodeTextRefreshQueue } from './node-text-queue';
import type {
  GraphTypeRegistry,
  GroupMemberGeometry,
  GroupPresentationContext,
  GroupPresentationMode,
  NodePortLayout,
  NodeVisualDescription,
  VisualPaint,
} from '../../domain/graph/type-registry';
import type { GraphEdge, GraphNode } from '../../domain/graph/types';

const VIEW_OVERSCAN = 512;
const NODE_TEXT_REFRESH_BUDGET_MS = 3;
const NODE_TEXT_REFRESH_MAX_PER_FRAME = 1;
const DIRTY_PREVIEW_ENTITY_THRESHOLD = 4096;
const MAX_EDGE_HIT_RADIUS = 64;
const EXPORT_TILE_DIMENSION = 2048;
const gridTextures = new Map<string, Texture>();
const visualColorCache = new Map<string, { readonly color: number; readonly alpha: number }>();
let visualColorContext: CanvasRenderingContext2D | null | undefined;

function resolveVisualColor(paint: VisualPaint) {
  if (typeof paint === 'number') return { color: paint & 0xffffff, alpha: 1 };
  const cached = visualColorCache.get(paint);
  if (cached) return cached;
  const themeToken =
    (THEME_COLOR as Record<string, string>)[paint] ??
    (Object.values(THEME_COLOR).includes(paint as (typeof THEME_COLOR)[keyof typeof THEME_COLOR])
      ? paint
      : undefined);
  const css = themeToken
    ? getThemeColorCss(themeToken as (typeof THEME_COLOR)[keyof typeof THEME_COLOR])
    : paint;
  let parsed: { readonly color: number; readonly alpha: number };
  try {
    parsed = parseThemeColorCss(css);
  } catch {
    if (visualColorContext === undefined) {
      visualColorContext =
        typeof document === 'undefined'
          ? null
          : document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    }
    if (!visualColorContext) throw new Error(`Unsupported graph paint "${paint}".`);
    visualColorContext.clearRect(0, 0, 1, 1);
    visualColorContext.fillStyle = css;
    visualColorContext.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = visualColorContext.getImageData(0, 0, 1, 1).data;
    parsed = { color: (red << 16) | (green << 8) | blue, alpha: alpha / 255 };
  }
  visualColorCache.set(paint, parsed);
  return parsed;
}

function getGridTexture(resolution: number): Texture {
  const color = getThemeColorCss(THEME_COLOR.gridDots);
  const key = `${resolution}:${color}`;
  const cached = gridTextures.get(key);
  if (cached) return cached;

  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = SNAP_GRID_X * resolution;
  gridCanvas.height = SNAP_GRID_Y * resolution;
  const context = gridCanvas.getContext('2d');
  if (!context) throw new Error('Could not create the grid texture.');
  context.scale(resolution, resolution);
  context.fillStyle = color;
  context.beginPath();
  context.arc(SNAP_GRID_X / 2, SNAP_GRID_Y / 2, GRID_DOT_SIZE, 0, Math.PI * 2);
  context.fill();

  const texture = Texture.from({
    resource: gridCanvas,
    resolution,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
    mipmapFilter: 'linear',
  });
  gridTextures.set(key, texture);
  return texture;
}

export type CanvasSelectionTarget =
  | { readonly type: 'node'; readonly id: string }
  | { readonly type: 'edge'; readonly id: string }
  | { readonly type: 'group'; readonly id: string };

type Selection = CanvasSelectionTarget | null;

export interface CanvasSelectionState {
  readonly target: CanvasSelectionTarget;
  readonly nodeIds: readonly string[];
  readonly primaryNodeId: string | null;
}

export interface CanvasGeometryBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasPngExportOptions {
  readonly backgroundColor: string;
  readonly padding: number;
  readonly maxDimension: number;
  readonly maxPixels: number;
}

export type CanvasCoordinateSpace = 'graph' | 'screen';

export function initializeProjectedEdgeBounds<TGroup, TEdge>(
  groups: Iterable<TGroup>,
  edges: Iterable<TEdge>,
  refreshGroupProjection: (group: TGroup) => void,
  updateEdgeBounds: (edge: TEdge) => void,
) {
  for (const group of groups) refreshGroupProjection(group);
  for (const edge of edges) updateEdgeBounds(edge);
}

export interface CanvasProjectedScene {
  readonly version: number;
  readonly viewport: Viewport;
  readonly screenSize: { readonly width: number; readonly height: number };
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly groupIds: readonly string[];
}

export interface CanvasSemanticEvents {
  readonly isDeleteMode?: () => boolean;
  readonly onSelectionChange?: (selection: CanvasSelectionState | null) => void;
  readonly onNodeMove?: (
    nodes: readonly { readonly id: string; readonly x: number; readonly y: number }[],
  ) => void;
  readonly onActionRequest?: CanvasActionHandler;
  readonly canConnectEndpoints?: (first: ConnectionEndpoint, second: ConnectionEndpoint) => boolean;
  readonly onConnectionStart?: (source: {
    readonly nodeId: string;
    readonly portId: string;
  }) => void;
  readonly onConnectionFinish?: (result: {
    readonly status: 'connected' | 'reconnected' | 'invalid' | 'cancelled';
    readonly edgeId?: string;
    readonly reason?: string;
  }) => void;
  readonly onEdgeInteraction?: (edgeId: string, action: 'select' | 'reconnect') => void;
  readonly onEdgeClick?: (edgeId: string, point: Point) => void;
  readonly onGroupInteraction?: (groupId: string, action: string) => void;
  readonly onNodeControl?: (nodeId: string, controlId: string, action: string) => void;
  readonly onPortActivate?: (nodeId: string, portId: string) => void;
  readonly onPortDoubleActivate?: (nodeId: string, portId: string) => void;
}

export interface FlowchartRendererOptions {
  readonly interaction?: CanvasInteractionConfig;
  readonly events?: CanvasSemanticEvents;
  readonly typeRegistry?: GraphTypeRegistry;
  readonly resolveAsset?: (assetId: string) => CanvasImageSource | null;
  readonly resolveGroupPresentationData?: (group: FlowGroup) => unknown;
}

type Position = Point;

type NodeControlHit =
  | { readonly type: 'button'; readonly controlId?: string; readonly action?: string }
  | { readonly type: 'expand-group' }
  | { readonly type: 'port'; readonly portId: string }
  | { readonly type: 'io'; readonly portId: string };

const GROUP_HEADER_DRAG_THRESHOLD_CSS_PX = 4;

export interface RendererDiagnostics {
  readonly totalGraphNodes: number;
  readonly totalGraphEdges: number;
  readonly cameraVisibleNodes: number;
  readonly cameraVisibleEdges: number;
  readonly renderedNodeGeometries: number;
  readonly renderedEdgeGeometries: number;
  readonly overscanActiveNodes: number;
  readonly overscanActiveEdges: number;
  readonly offscreenNodes: number;
  readonly offscreenEdges: number;
  readonly activeNodes: number;
  readonly activeEdges: number;
  readonly indexedNodes: number;
  readonly indexedEdges: number;
  readonly renderedFrames: number;
  readonly rendererCpuSampleCount: number;
  readonly viewportSyncSampleCount: number;
  readonly graphUpdateSampleCount: number;
  readonly panSyncSampleCount: number;
  readonly zoomSyncSampleCount: number;
  readonly pickingSampleCount: number;
  readonly dragSampleCount: number;
  readonly renderScheduled: boolean;
  readonly p95RenderWorkMs: number;
  readonly p50RendererCpuMs: number;
  readonly p95RendererCpuMs: number;
  readonly p50ViewportSyncMs: number;
  readonly p95ViewportSyncMs: number;
  readonly p50PanSyncMs: number;
  readonly p95PanSyncMs: number;
  readonly p50ZoomSyncMs: number;
  readonly p95ZoomSyncMs: number;
  readonly p95VisibilityQueryMs: number;
  readonly p95ProjectedSceneMs: number;
  readonly p95VisibleMeshMs: number;
  readonly p95NodeTextLifecycleMs: number;
  readonly p95GroupPresentationMs: number;
  readonly p95VisibleSyncMs: number;
  readonly p50PickingMs: number;
  readonly p95PickingMs: number;
  readonly p50DragWorkMs: number;
  readonly p95DragWorkMs: number;
  readonly p95DragIndexMs: number;
  readonly p95DragNodeMeshMs: number;
  readonly p95DragEdgesMs: number;
  readonly p95DragVisibilityMs: number;
  readonly p95DragTextMs: number;
  readonly occlusionSampleCount: number;
  readonly p95OcclusionMs: number;
  readonly p95OcclusionCandidates: number;
  readonly nodePoolSize: number;
  readonly nodePoolLimit: number;
  readonly lastGraphCommitMs: number;
  readonly measuredRefreshIntervalMs: number;
  readonly frameIntervalsMs: readonly number[];
  readonly samples: {
    readonly renderMs: readonly number[];
    readonly rendererCpuMs: readonly number[];
    readonly viewportSyncMs: readonly number[];
    readonly graphUpdateMs: readonly number[];
    readonly panSyncMs: readonly number[];
    readonly zoomSyncMs: readonly number[];
    readonly visibilityQueryMs: readonly number[];
    readonly projectedSceneMs: readonly number[];
    readonly visibleMeshMs: readonly number[];
    readonly nodeTextLifecycleMs: readonly number[];
    readonly groupPresentationMs: readonly number[];
    readonly pickingMs: readonly number[];
    readonly dragMs: readonly number[];
    readonly dragIndexMs: readonly number[];
    readonly dragNodeMeshMs: readonly number[];
    readonly dragEdgesMs: readonly number[];
    readonly dragVisibilityMs: readonly number[];
    readonly dragTextMs: readonly number[];
    readonly occlusionMs: readonly number[];
    readonly occlusionCandidateCounts: readonly number[];
  };
  readonly missedFrameRate: number;
  readonly selectionType: 'node' | 'edge' | 'group' | null;
  readonly selectionId: string | null;
}

export interface FlowchartRendererHandle {
  destroy(): void;
  getDiagnostics(): RendererDiagnostics;
  resetPerformanceSamples(): void;
  setRefreshIntervalEstimate(intervalMs: number): void;
  fitGraph(): void;
  fitSelection(): void;
  centerOnSelection(): void;
  getSelection(): CanvasSelectionState | null;
  selectNodes(nodeIds: readonly string[], primaryNodeId?: string): void;
  selectEdge(edgeId: string): void;
  selectGroup(groupId: string): void;
  clearSelection(): void;
  zoomIn(): void;
  zoomOut(): void;
  setViewportLocked(locked: boolean): void;
  isViewportLocked(): boolean;
  addRecipeNode(): string;
  addGraphNode<TNode extends GraphNode>(node: TNode): string;
  updateGraphNode<TNode extends GraphNode = GraphNode>(
    id: string,
    update: (node: TNode) => TNode,
  ): boolean;
  addGraphEdge<TEdge extends GraphEdge>(
    edge: Omit<TEdge, 'id' | 'settings'> & {
      readonly id?: string;
      readonly settings?: TEdge['settings'];
    },
  ): string;
  updateGraphEdge<TEdge extends GraphEdge = GraphEdge>(
    id: string,
    update: (edge: TEdge) => TEdge,
  ): boolean;
  groupSelectedNodes(): string | null;
  exportGraphDocument(): string;
  importGraphDocument(input: string | unknown): void;
  graphToScreen(point: Point): Point;
  screenToGraph(point: Point): Point;
  getNodeBounds(nodeId: string, space?: CanvasCoordinateSpace): CanvasGeometryBounds | null;
  getPortBounds(
    nodeId: string,
    portId: string,
    space?: CanvasCoordinateSpace,
  ): CanvasGeometryBounds | null;
  getPortRowBounds(
    nodeId: string,
    portId: string,
    space?: CanvasCoordinateSpace,
  ): CanvasGeometryBounds | null;
  getControlBounds(
    entityId: string,
    controlIdOrAction: string,
    space?: CanvasCoordinateSpace,
  ): CanvasGeometryBounds | null;
  getGroupHeaderBounds(groupId: string, space?: CanvasCoordinateSpace): CanvasGeometryBounds | null;
  getEdgeGeometry(
    edgeId: string,
    space?: CanvasCoordinateSpace,
  ): { readonly points: readonly Point[]; readonly bounds: CanvasGeometryBounds } | null;
  exportCanvasPng(options: CanvasPngExportOptions): Promise<Blob>;
  getProjectedScene(): CanvasProjectedScene;
  subscribeViewport(listener: (viewport: Viewport) => void): () => void;
  subscribeResize(
    listener: (size: { readonly width: number; readonly height: number }) => void,
  ): () => void;
  subscribeScene(listener: (scene: CanvasProjectedScene) => void): () => void;
  refreshGroupPresentation(groupId?: string): void;
}

function recordDuration(samples: number[], duration: number) {
  samples.push(duration);
  if (samples.length > 180) samples.shift();
}

function percentile(samples: readonly number[], percent: number) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)];
}

function withIncludedIds(current: ReadonlySet<string>, ids: Iterable<string>) {
  let updated: Set<string> | null = null;
  for (const id of ids) {
    if (current.has(id) || updated?.has(id)) continue;
    updated ??= new Set(current);
    updated.add(id);
  }
  return updated ?? current;
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

export function createFlowchartRenderer(
  app: Application,
  host: HTMLElement,
  graph: GraphStore = graphStore,
  camera: ViewportStore = viewportStore,
  nodeBodyStrategy: 'batch' | 'per-node-container' = 'batch',
  announce: (message: string) => void = () => {},
  options: FlowchartRendererOptions = {},
): FlowchartRendererHandle {
  const interaction = resolveCanvasInteractionConfig(options.interaction);
  const semanticEvents = options.events ?? {};
  const resolveAsset = options.resolveAsset;
  const resolveGroupPresentationData = options.resolveGroupPresentationData;
  const typeRegistry = options.typeRegistry ?? graph.typeRegistry;
  if (typeRegistry !== graph.typeRegistry) {
    throw new Error('The renderer and GraphStore must use the same graph type registry instance.');
  }
  function getLocalNodeBounds(node: GraphNode) {
    const group = graph.getGroup(node.id);
    const groupVisual = group?.collapsed ? groupVisualCache.get(node.id) : undefined;
    if (groupVisual) return groupVisual.bounds;
    const definition = typeRegistry.nodes[node.type];
    return definition?.getBounds(node) ?? { x: 0, y: 0, ...getRecipeNodeSize(node as FlowNode) };
  }

  function nodeBounds(node: FlowNode, position: Position = node): Bounds {
    const size = getLocalNodeBounds(node);
    return {
      minX: position.x + size.x,
      minY: position.y + size.y,
      maxX: position.x + size.x + size.width,
      maxY: position.y + size.y + size.height,
    };
  }
  app.canvas.tabIndex = 0;
  app.canvas.setAttribute('role', 'application');
  app.canvas.setAttribute(
    'aria-label',
    'Graph canvas. Use arrow keys to navigate visible nodes and groups. Press Enter to expand or collapse a selected group.',
  );
  const themeColors = getCanvasThemeColors();
  const gridTextureResolution = getGridTextureResolution(app.renderer.resolution, MAX_ZOOM);
  const gridTexture = getGridTexture(gridTextureResolution);
  const grid = new TilingSprite({
    texture: gridTexture,
    width: app.screen.width,
    height: app.screen.height,
  });
  const world = new Container({ isRenderGroup: true });
  const autoPan = new AutoPanController(camera, () => ({
    width: app.screen.width,
    height: app.screen.height,
  }));
  function setCanvasCursor(cursor: string) {
    world.cursor = cursor || 'default';
    app.canvas.style.cursor = cursor;
    host.style.cursor = cursor;
  }

  const edgeLayer = new Container();
  const groupLayer = new Container();
  const groupChromeLayer = new Container();
  const nodeLayer = new Container();
  const nodeContentLayer = new Container();
  const groupFrontLayer = new Container();
  const nodeSelectionLayer = new Container();
  const connectionLayer = new Container();
  const connectionMarker = new Graphics();
  const selectionBoxGraphics = new Graphics();
  const edgeEditorLayer = new Container();
  const edgeEditorGraphics = new Graphics();
  const nodePalette = createNodePalette();
  const meshRenderer = new GraphMeshRenderer(
    edgeLayer,
    nodeLayer,
    nodePalette.texture,
    nodeSelectionLayer,
    nodeBodyStrategy,
    (paint) => nodePalette.indexOf(paint),
  );
  selectionBoxGraphics.eventMode = 'none';
  nodeSelectionLayer.addChild(selectionBoxGraphics);
  const nodeSpatial = new SpatialIndex<string>(512);
  const edgeSpatial = new SpatialIndex<string>(512);
  const groupSpatial = new SpatialIndex<string>(512);
  const canvasOrder = new CanvasOrderModel();
  const nodeViews = new Map<string, NodeView>();
  const nodePool: NodeView[] = [];
  const registeredNodeTexts = new WeakMap<NodeView, Text[]>();
  const registeredNodeAssets = new WeakMap<NodeView, Sprite[]>();
  const nodeVisualByView = new WeakMap<NodeView, NodeVisualDescription | undefined>();
  const occlusionDurations: number[] = [];
  const occlusionCandidateCounts: number[] = [];
  const portAnchors = new Map<string, Map<string, Point>>();
  const previewPositions = new Map<string, Position>();
  const edgeCurveCache = new Map<string, EdgeCurve | null>();
  const edgeRoutePreviews = new Map<
    string,
    {
      readonly controlPoints?: FlowEdge['controlPoints'];
      readonly orthogonalTurns?: FlowEdge['orthogonalTurns'];
    }
  >();
  const nodeMoveRoutePreviews = new Map<
    string,
    {
      readonly controlPoints?: FlowEdge['controlPoints'];
      readonly orthogonalTurns?: FlowEdge['orthogonalTurns'];
    }
  >();
  const edgeOrder = new Map<string, number>();
  const edgeGroupIdsByEdgeId = new Map<string, readonly string[]>();
  const proxyTopologyDirtyGroupIds = new Set<string>();
  const visibleGraph = new VisibleGraphProjection();
  const groupProxyCache = new GroupProxyCache<readonly GroupProxyPort[]>();
  const groupBoundsCache = new Map<string, GroupBounds>();
  const groupPresentationData = new Map<string, unknown>();
  const groupVisualCache = new Map<string, NodeVisualDescription | null>();
  const groupProxyPortLayouts = new Map<string, ReadonlyMap<string, NodePortLayout>>();
  const groupPresentation = new GroupPresentationController({
    fillLayer: groupLayer,
    chromeLayer: groupChromeLayer,
    selectedLayer: groupFrontLayer,
    themeColors,
    textResolution: Math.max(1, app.renderer.resolution * 2),
    order: canvasOrder,
    getGroup: (id) => graph.getGroup(id),
    getBounds: (id) => groupBoundsCache.get(id),
    getVisual: (id) => groupVisualCache.get(id) ?? undefined,
    queryGroups: (bounds) => groupSpatial.query(bounds),
    resolveAsset,
  });
  const nodeOcclusion = new NodeOcclusionController();
  const overscanNodeIds = new Set<string>();
  const overscanEdgeIds = new Set<string>();
  let cameraVisibleNodeIds: Set<string> = new Set<string>();
  let cameraVisibleEdgeIds: Set<string> = new Set<string>();
  let projectedRenderPlan = createEmptyProjectedRenderPlan();
  let nodeContentOrderDirty = false;

  world.eventMode = 'static';
  world.hitArea = new Rectangle(-100000, -100000, 200000, 200000);
  connectionLayer.eventMode = 'none';
  connectionLayer.interactiveChildren = false;
  connectionLayer.addChild(connectionMarker);
  edgeEditorLayer.eventMode = 'none';
  edgeEditorLayer.interactiveChildren = false;
  edgeEditorLayer.addChild(edgeEditorGraphics);
  groupLayer.eventMode = 'none';
  groupLayer.interactiveChildren = false;
  groupChromeLayer.eventMode = 'none';
  groupChromeLayer.interactiveChildren = false;
  nodeContentLayer.eventMode = 'none';
  nodeContentLayer.interactiveChildren = false;
  groupFrontLayer.eventMode = 'none';
  groupFrontLayer.interactiveChildren = false;
  nodeSelectionLayer.eventMode = 'none';
  nodeSelectionLayer.interactiveChildren = false;
  const painterLayers = bottommostRenderOrder([
    { id: 'group-fills', order: 0, band: RENDER_BAND.groupFill, layer: groupLayer },
    { id: 'edges', order: 0, band: RENDER_BAND.edge, layer: edgeLayer },
    { id: 'group-chrome', order: 0, band: RENDER_BAND.groupChrome, layer: groupChromeLayer },
    { id: 'node-bodies', order: 0, band: RENDER_BAND.nodeBody, layer: nodeLayer },
    { id: 'node-content', order: 0, band: RENDER_BAND.nodeContent, layer: nodeContentLayer },
    {
      id: 'selected-group-chrome',
      order: 0,
      band: RENDER_BAND.selectedGroupChrome,
      layer: groupFrontLayer,
    },
    { id: 'selection', order: 0, band: RENDER_BAND.selection, layer: nodeSelectionLayer },
    { id: 'connection', order: 0, band: RENDER_BAND.connection, layer: connectionLayer },
    { id: 'edge-editor', order: 0, band: RENDER_BAND.edgeEditor, layer: edgeEditorLayer },
  ]).map(({ layer }) => layer);
  world.addChild(...painterLayers);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.addChild(grid, world);

  let selection: Selection = null;
  const selectedNodeIds = new Set<string>();
  let primarySelectedNodeId: string | null = null;
  let sceneVersion = 0;
  const viewportListeners = new Set<(viewport: Viewport) => void>();
  const resizeListeners = new Set<
    (size: { readonly width: number; readonly height: number }) => void
  >();
  const sceneListeners = new Set<(scene: CanvasProjectedScene) => void>();
  const lastKnownNodePositions = new Map<string, Point>();

  function getCanvasCssSize() {
    const rect = app.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function resizeRendererToHost() {
    const rect = host.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) return;
    if (app.screen.width !== width || app.screen.height !== height)
      app.renderer.resize(width, height);
  }

  function getProjectedScene(): CanvasProjectedScene {
    return {
      version: sceneVersion,
      viewport: { ...camera.getState() },
      screenSize: getCanvasCssSize(),
      nodeIds: projectedRenderPlan.nodes.map((entity) => entity.id),
      edgeIds: projectedRenderPlan.edges.map((entity) => entity.id),
      groupIds: projectedRenderPlan.groups.map((entity) => entity.id),
    };
  }

  function notifyProjectedSceneChanged(projectedPlanIsCurrent = false) {
    if (!projectedPlanIsCurrent) rebuildProjectedRenderPlan(getCameraBounds());
    sceneVersion++;
    if (sceneListeners.size === 0) return;
    const scene = getProjectedScene();
    for (const listener of sceneListeners) listener(scene);
  }
  let viewportPanning = false;
  let viewportLocked = false;
  let hoveredNodeId: string | null = null;
  let hoveredNodeControl: NodeControlHit | null = null;
  const connectionController = createConnectionController(
    graph,
    semanticEvents.onActionRequest,
    semanticEvents.canConnectEndpoints,
  );
  const canvasTapActivation = createCanvasTapActivation();
  let canvasTapActivationTimer: number | null = null;
  const selectionController = createSelectionController();
  let pendingGroupHeaderGesture: {
    readonly groupId: string;
    readonly memberIds: readonly string[];
    readonly startGlobal: Point;
    readonly startWorld: Point;
  } | null = null;
  let activeEdgeRouteDrag: {
    readonly edgeId: string;
    readonly key: 'controlPoints' | 'orthogonalTurns';
    readonly pointId?: string;
    readonly segmentIndex?: number;
    readonly basePoints: NonNullable<FlowEdge['controlPoints']>;
    points: NonNullable<FlowEdge['controlPoints']>;
    didMove: boolean;
  } | null = null;
  let hoveredOrthogonalSegment: number | null = null;
  let hoveredOrthogonalHandle: Point | null = null;
  let lastPointerScreenPosition: Position | null = null;
  let lastPointerEvent: FederatedPointerEvent | null = null;
  let renderRequest: number | null = null;
  let renderingFrame = false;
  let pendingViewportSync = false;
  let pendingPanSync = false;
  let pendingZoomSync = false;
  let pendingViewport: Viewport | null = null;
  const pendingNodePreviews = new Map<string, Position | null>();
  let lastViewportInput = camera.getState();
  let renderedFrames = 0;
  let previousRenderAt = 0;
  let measuredRefreshIntervalMs = 1000 / 60;
  let disposed = false;
  let nextEdgeOrder = 0;
  let lastDetailLevel: string | null = null;
  const nodeTextRefreshQueue = createNodeTextRefreshQueue();
  let exportingCanvasPng = false;
  let lastCameraBounds: Bounds | null = null;
  let lastOverscanBounds: Bounds | null = null;
  const renderDurations: number[] = [];
  const rendererCpuDurations: number[] = [];
  const viewportSyncDurations: number[] = [];
  const graphUpdateDurations: number[] = [];
  const pickingDurations: number[] = [];
  const dragDurations: number[] = [];
  const dragIndexDurations: number[] = [];
  const dragNodeMeshDurations: number[] = [];
  const dragEdgeDurations: number[] = [];
  const dragVisibilityDurations: number[] = [];
  const dragTextDurations: number[] = [];
  const panSyncDurations: number[] = [];
  const zoomSyncDurations: number[] = [];
  const visibilityQueryDurations: number[] = [];
  const projectedSceneDurations: number[] = [];
  const visibleMeshDurations: number[] = [];
  const nodeTextLifecycleDurations: number[] = [];
  const groupPresentationDurations: number[] = [];
  const frameIntervals: number[] = [];

  function compareNodePaintOrder(leftId: string, rightId: string) {
    return compareRenderOrder(
      { id: leftId, order: canvasOrder.get(leftId, 'node'), band: RENDER_BAND.nodeBody },
      { id: rightId, order: canvasOrder.get(rightId, 'node'), band: RENDER_BAND.nodeBody },
    );
  }

  function invalidate() {
    if (disposed || renderingFrame || renderRequest !== null) return;
    renderRequest = requestAnimationFrame(() => {
      renderRequest = null;
      if (disposed) return;
      renderingFrame = true;
      let shouldContinue = false;
      runRenderFrame(
        () => {
          const startedAt = performance.now();
          if (previousRenderAt > 0) recordDuration(frameIntervals, startedAt - previousRenderAt);
          previousRenderAt = startedAt;

          if (pendingNodePreviews.size > 0) {
            const previews = new Map(pendingNodePreviews);
            pendingNodePreviews.clear();
            applyNodePreviews(previews);
          }

          if (pendingViewportSync) {
            pendingViewportSync = false;
            const viewport = pendingViewport;
            pendingViewport = null;
            if (viewport) applyViewportTransform(viewport);
            const measurePan = pendingPanSync;
            const measureZoom = pendingZoomSync;
            pendingPanSync = false;
            pendingZoomSync = false;
            const syncStartedAt = performance.now();
            meshRenderer.batchUpdates(() => syncVisibleViews());
            const syncDuration = performance.now() - syncStartedAt;
            if (measurePan) recordDuration(panSyncDurations, syncDuration);
            if (measureZoom) recordDuration(zoomSyncDurations, syncDuration);
            if (lastPointerEvent) {
              if (selectionController.isActive()) {
                selectionController.update(world.toLocal(lastPointerEvent.global));
                drawSelectionBox();
              } else if (nodeDrag.getActiveNodeIds().length > 0) {
                nodeDrag.move(lastPointerEvent);
              } else if (connectionController.isActive()) {
                updateConnectionGesture(world.toLocal(lastPointerEvent.global));
              }
            }
          }

          const nodeTextRefreshPending = nodeTextRefreshQueue.process(
            (id) => {
              if (getDisplayNode(id)) updateNodeText(id);
              else releaseNodeView(id);
            },
            NODE_TEXT_REFRESH_BUDGET_MS,
            () => performance.now(),
            NODE_TEXT_REFRESH_MAX_PER_FRAME,
          );

          meshRenderer.updateAnimation(startedAt / 1000);
          syncNodeContentOrder();
          drawEdgeEditor();
          app.render();
          meshRenderer.markRendered();
          const renderWorkMs = performance.now() - startedAt;
          recordDuration(renderDurations, renderWorkMs);
          recordDuration(rendererCpuDurations, renderWorkMs);
          renderedFrames++;

          shouldContinue =
            pendingNodePreviews.size > 0 ||
            pendingViewportSync ||
            nodeTextRefreshPending ||
            meshRenderer.hasAnimatedEdges;
        },
        () => {
          renderingFrame = false;
        },
      );
      if (shouldContinue) invalidate();
    });
  }

  function getCameraBounds(margin = 0) {
    return getCameraWorldBounds(app.screen.width, app.screen.height, camera.getState(), margin);
  }

  function getFitBounds(selectionOnly: boolean): Bounds | null {
    let result: Bounds | null = null;
    const include = (bounds: Bounds | null | undefined) => {
      if (bounds) result = result ? unionBounds(result, bounds) : bounds;
    };
    if (selectionOnly) {
      for (const id of selectedNodeIds) {
        const node = getDisplayNode(id);
        if (node) include(nodeBounds(node, getDisplayPosition(id, node)));
      }
      if (selection?.type === 'group') {
        const group = graph.getGroup(selection.id);
        if (group) {
          const proxy = group.collapsed ? visibleGraph.getProxyNode(group.id) : undefined;
          if (proxy) include(nodeBounds(proxy, getDisplayPosition(group.id, proxy)));
          else {
            const bounds = getGroupBounds(
              group,
              graph.getNode,
              previewPositions,
              getLocalNodeBounds,
            );
            if (bounds)
              include({
                minX: bounds.x,
                minY: bounds.y,
                maxX: bounds.x + bounds.width,
                maxY: bounds.y + bounds.height,
              });
          }
        }
      } else if (selection?.type === 'edge') {
        const edge = graph.getEdge(selection.id);
        const curve = edge && getEdgeCurve(edge);
        if (curve) include(getEdgeCurveBounds(curve));
      }
      return result;
    }
    const hiddenNodeIds = new Set<string>();
    for (const group of graph.getGroups()) {
      if (!group.collapsed) continue;
      for (const id of group.memberNodeIds) hiddenNodeIds.add(id);
      const proxy = visibleGraph.getProxyNode(group.id);
      if (proxy) include(nodeBounds(proxy, getDisplayPosition(group.id, proxy)));
      else {
        const bounds = getGroupBounds(group, graph.getNode, previewPositions, getLocalNodeBounds);
        if (bounds)
          include({
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.width,
            maxY: bounds.y + bounds.height,
          });
      }
    }
    for (const node of graph.getNodes()) {
      if (hiddenNodeIds.has(node.id)) continue;
      include(nodeBounds(node, getDisplayPosition(node.id, node)));
    }
    return result;
  }

  function getGraphContentBounds(): Bounds | null {
    const bounds: Bounds[] = [];
    const nodeBounds = getFitBounds(false);
    if (nodeBounds) bounds.push(nodeBounds);

    for (const group of graph.getGroups()) {
      if (group.collapsed) continue;
      const groupBounds = getGroupBounds(
        group,
        graph.getNode,
        previewPositions,
        getLocalNodeBounds,
      );
      if (groupBounds) {
        bounds.push({
          minX: groupBounds.x,
          minY: groupBounds.y,
          maxX: groupBounds.x + groupBounds.width,
          maxY: groupBounds.y + groupBounds.height,
        });
      }
    }

    for (const edge of graph.getEdges()) {
      const curve = getEdgeCurve(edge);
      if (curve) bounds.push(getEdgeCurveBounds(curve));
    }

    return unionCanvasExportBounds(bounds);
  }

  function fitView(selectionOnly: boolean) {
    if (viewportLocked) return;
    const bounds = getFitBounds(selectionOnly);
    if (!bounds) {
      if (selectionOnly) return;
      camera.setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const padding = 72;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const zoom = Math.min(
      MAX_ZOOM,
      (app.screen.width - padding * 2) / width,
      (app.screen.height - padding * 2) / height,
    );
    camera.setViewport({
      x: -((bounds.minX + bounds.maxX) / 2) * zoom,
      y: -((bounds.minY + bounds.maxY) / 2) * zoom,
      zoom,
    });
  }

  function centerSelection() {
    if (viewportLocked) return;
    const bounds = getFitBounds(true);
    if (!bounds) return;
    camera.setViewport(getViewportCenteredOnBounds(camera.getState(), bounds));
  }

  function selectNodes(nodeIds: readonly string[], primaryNodeId = nodeIds.at(-1)) {
    const uniqueIds = [...new Set(nodeIds)];
    for (const id of uniqueIds) {
      if (!graph.getNode(id)) throw new Error(`Cannot select missing node "${id}".`);
      if (!getDisplayNode(id))
        throw new Error(`Cannot select hidden node "${id}"; expand its group first.`);
    }
    if (primaryNodeId !== undefined && !uniqueIds.includes(primaryNodeId)) {
      throw new Error('The primary node must be included in the selected node IDs.');
    }
    const target =
      primaryNodeId === undefined ? null : { type: 'node' as const, id: primaryNodeId };
    setNodeSelection(uniqueIds, primaryNodeId ?? null, target);
  }

  function selectEdge(edgeId: string) {
    if (!graph.getEdge(edgeId)) throw new Error(`Cannot select missing edge "${edgeId}".`);
    setSelection({ type: 'edge', id: edgeId });
  }

  function selectGroup(groupId: string) {
    if (!graph.getGroup(groupId)) throw new Error(`Cannot select missing group "${groupId}".`);
    setSelection({ type: 'group', id: groupId });
  }

  function zoomBy(factor: number) {
    if (viewportLocked) return;
    const viewport = camera.getState();
    camera.setViewport(
      getViewportAfterZoom(
        viewport,
        app.screen.width / 2,
        app.screen.height / 2,
        app.screen.width,
        app.screen.height,
        viewport.zoom * factor,
      ),
    );
  }

  function addRecipeNode() {
    const viewport = camera.getState();
    const center = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom };
    const size = getRecipeNodeSizeForPortCounts(1, 1);
    const id = graph.addNode({ x: center.x - size.width / 2, y: center.y - size.height / 2 });
    setSelection({ type: 'node', id });
    return id;
  }

  function groupSelectedNodes() {
    const id = graph.createGroup([...selectedNodeIds]);
    if (id) setSelection({ type: 'group', id });
    return id;
  }

  function updateAutoPan(
    pointer: { readonly x: number; readonly y: number } | null = lastPointerScreenPosition,
  ) {
    const active =
      !viewportLocked &&
      (selectionController.isActive() ||
        connectionController.isActive() ||
        nodeDrag.getActiveNodeIds().length > 0);
    autoPan.setActive(active);
    autoPan.setPointer(active ? pointer : null);
  }

  function drawSelectionBox() {
    selectionBoxGraphics.clear();
    const gesture = selectionController.getActive();
    if (!gesture) return;
    const box = getSelectionBox(gesture.start, gesture.current);
    selectionBoxGraphics
      .rect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
      .fill({ color: themeColors.selected, alpha: 0.14 })
      .stroke({ color: themeColors.selected, width: 1.5 / camera.getState().zoom, alpha: 0.9 });
  }

  function finishSelectionBox() {
    const gesture = selectionController.finish();
    if (!gesture) return;
    const box = getSelectionBox(gesture.start, gesture.current);
    selectionBoxGraphics.clear();
    const candidates = nodeSpatial
      .query(box)
      .filter((id) => {
        const node = getDisplayNode(id);
        return (
          node &&
          matchesSelectionBox(nodeBounds(node, getDisplayPosition(id, node)), box, gesture.mode)
        );
      })
      .sort(compareNodePaintOrder);
    const visibleNodes = candidates.filter((id) => graph.getNode(id));
    const collapsedGroups = candidates.filter((id) => graph.getGroup(id)?.collapsed);
    if (visibleNodes.length > 0) {
      const primary = visibleNodes.at(-1)!;
      setNodeSelection(visibleNodes, primary, { type: 'node', id: primary });
    } else if (collapsedGroups.length === 1) {
      setSelection({ type: 'group', id: collapsedGroups[0] });
    } else {
      setSelection(null);
    }
    updateAutoPan(null);
    invalidate();
  }

  function cancelSelectionBox() {
    if (!selectionController.cancel()) return;
    selectionBoxGraphics.clear();
    updateAutoPan(null);
    invalidate();
  }

  function updateGridSize() {
    grid.width = app.screen.width;
    grid.height = app.screen.height;
  }

  function cacheNodePorts(node: FlowNode, overrides?: ReadonlyMap<string, NodePortLayout>) {
    const anchors = new Map<string, Point>();
    const definition = typeRegistry.nodes[node.type];
    for (const port of node.ports) {
      const anchor = overrides?.get(port.id) ?? definition?.getPortLayout(node, port.id);
      if (anchor) anchors.set(port.id, { x: anchor.x, y: anchor.y });
    }
    portAnchors.set(node.id, anchors);
  }

  function getNodeVisual(node: FlowNode) {
    if (visibleGraph.isCollapsedGroup(node.id)) return groupVisualCache.get(node.id) ?? undefined;
    return node.type === 'recipe' ? undefined : typeRegistry.nodes[node.type]?.describe(node);
  }

  function resolveVisualTextColor(color: string) {
    const themeToken =
      (THEME_COLOR as Record<string, string>)[color] ??
      (Object.values(THEME_COLOR).includes(color as (typeof THEME_COLOR)[keyof typeof THEME_COLOR])
        ? color
        : undefined);
    if (!themeToken) return color;
    try {
      return getThemeColorCss(themeToken as (typeof THEME_COLOR)[keyof typeof THEME_COLOR]);
    } catch {
      return color;
    }
  }

  function getNodePortPositions(node: FlowNode) {
    const definition = typeRegistry.nodes[node.type];
    const positions = new Map<string, Point>();
    for (const port of node.ports) {
      const layout =
        groupProxyPortLayouts.get(node.id)?.get(port.id) ??
        definition?.getPortLayout(node, port.id);
      if (layout) positions.set(port.id, { x: layout.x, y: layout.y });
    }
    return positions;
  }

  function getNodePlanControls(
    node: FlowNode,
    visual: NodeVisualDescription | undefined,
    collapsedGroup: boolean,
  ): readonly ProjectedControl[] {
    const description = visual ?? typeRegistry.nodes[node.type]?.describe(node);
    const controls = createProjectedControls(description);
    if (!collapsedGroup) return controls;
    const visibleControls = controls.filter((control) => control.action !== 'node-menu');
    if (visibleControls.some((control) => control.action === 'group-expand'))
      return visibleControls;
    return [
      ...visibleControls,
      {
        id: 'group-expand',
        label: 'Expand group',
        action: 'group-expand',
        bounds: COLLAPSED_GROUP_EXPAND_BUTTON,
      },
    ];
  }

  function createProjectedNodeEntity(id: string): ProjectedNodeEntity | null {
    const node = getDisplayNode(id);
    if (!node) return null;
    const position = getDisplayPosition(id, node);
    const bounds = nodeBounds(node, position);
    const visual = getNodeVisual(node);
    const fallback = visual ?? typeRegistry.nodes[node.type]?.describe(node);
    const collapsedGroup = visibleGraph.isCollapsedGroup(id);
    return makeProjectedNodeEntity({
      id,
      kind: collapsedGroup ? 'collapsed-group' : 'node',
      node,
      position,
      bounds: {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      },
      visual,
      hitShapes: fallback?.hitShapes ?? [],
      controls: getNodePlanControls(node, visual, collapsedGroup),
      order: canvasOrder.get(id, 'node'),
    });
  }

  function createProjectedGroupEntity(id: string): ProjectedGroupEntity | null {
    const group = graph.getGroup(id);
    const bounds = !group?.collapsed ? groupBoundsCache.get(id) : undefined;
    if (!group || !bounds) return null;
    const visual = groupVisualCache.get(id) ?? undefined;
    const controls = visual
      ? createProjectedControls(visual)
      : [
          {
            id: 'group-menu',
            label: 'Group actions',
            action: 'group-menu',
            bounds: { x: bounds.width - 34, y: 9, width: 24, height: 24 },
          },
        ];
    return {
      id,
      kind: 'group',
      group,
      bounds,
      visual,
      hitShapes: visual?.hitShapes ?? [{ x: 0, y: 0, width: bounds.width, height: bounds.height }],
      controls,
      order: canvasOrder.get(id, 'group'),
      band: RENDER_BAND.groupChrome,
      fillBand: RENDER_BAND.groupFill,
      selectedBand: RENDER_BAND.selectedGroupChrome,
    };
  }

  function createProjectedEdgeEntity(id: string): ProjectedEdgeEntity | null {
    const edge = graph.getEdge(id);
    const curve = edge && getEdgeCurve(edge);
    if (!edge || !curve) return null;
    const edgeBounds = getEdgeCurveBounds(curve);
    return {
      id,
      kind: 'edge',
      edge,
      curve,
      points: getEdgeCurvePoints(curve),
      bounds: {
        x: edgeBounds.minX,
        y: edgeBounds.minY,
        width: edgeBounds.maxX - edgeBounds.minX,
        height: edgeBounds.maxY - edgeBounds.minY,
      },
      order: edgeOrder.get(id) ?? -1,
      band: RENDER_BAND.edge,
    };
  }

  function rebuildProjectedRenderPlan(cameraBounds: Bounds) {
    const nodes = [...cameraVisibleNodeIds].flatMap((id) => {
      const entity = createProjectedNodeEntity(id);
      return entity ? [entity] : [];
    });
    const groups = groupSpatial.query(cameraBounds).flatMap((id) => {
      const entity = createProjectedGroupEntity(id);
      return entity ? [entity] : [];
    });
    const edges = [...cameraVisibleEdgeIds].flatMap((id) => {
      const entity = createProjectedEdgeEntity(id);
      return entity ? [entity] : [];
    });
    projectedRenderPlan = new ProjectedRenderPlan({ nodes, groups, edges });
  }

  function createNodeRenderData(node: FlowNode, position: Point, order: number): NodeRenderData {
    return {
      node,
      position,
      order,
      visual: getNodeVisual(node),
      portPositions: getNodePortPositions(node),
    };
  }

  function createNodeRenderDataById(id: string): NodeRenderData | null {
    const node = getDisplayNode(id);
    return node
      ? createNodeRenderData(node, getDisplayPosition(id, node), canvasOrder.get(id, 'node'))
      : null;
  }

  function createEdgeRenderDataById(
    id: string,
  ): { readonly edge: FlowEdge; readonly curve: EdgeCurve } | null {
    const edge = graph.getEdge(id);
    const curve = edge && getEdgeCurve(edge);
    return edge && curve ? { edge: getRenderableEdge(edge), curve } : null;
  }

  function getGroupMembers(group: FlowGroup): GroupMemberGeometry[] {
    return group.memberNodeIds.flatMap((id) => {
      const node = graph.getNode(id);
      if (!node) return [];
      const position = previewPositions.get(id) ?? node;
      const local = getLocalNodeBounds(node);
      return [
        {
          node,
          position: { x: position.x, y: position.y },
          bounds: {
            x: position.x + local.x,
            y: position.y + local.y,
            width: local.width,
            height: local.height,
          },
        },
      ];
    });
  }

  function getGroupPresentationContext(
    group: FlowGroup,
    bounds: GroupBounds,
    proxyPorts: readonly GroupProxyPort[],
  ): GroupPresentationContext {
    return {
      worldBounds: bounds,
      localBounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      members: getGroupMembers(group),
      proxyPorts,
      presentationData: groupPresentationData.get(group.id),
    };
  }

  function getGroupWorldBounds(group: FlowGroup): GroupBounds | null {
    const presentationData = groupPresentationData.get(group.id);
    const definition = typeRegistry.groups.group;
    let bounds: GroupBounds | null;
    if (definition.getBounds) {
      bounds = definition.getBounds(group, getGroupMembers(group), presentationData);
    } else {
      bounds = getGroupBounds(group, graph.getNode, previewPositions, getLocalNodeBounds);
    }
    if (
      bounds &&
      (!Number.isFinite(bounds.x) ||
        !Number.isFinite(bounds.y) ||
        !Number.isFinite(bounds.width) ||
        !Number.isFinite(bounds.height) ||
        bounds.width <= 0 ||
        bounds.height <= 0)
    ) {
      throw new Error(
        `Group "${group.id}" presentation bounds must be finite and have positive size.`,
      );
    }
    return bounds;
  }

  function describeGroup(
    group: FlowGroup,
    mode: GroupPresentationMode,
    bounds: GroupBounds,
    proxyPorts: readonly GroupProxyPort[],
  ) {
    const description = typeRegistry.groups.group.describe?.(
      group,
      mode,
      getGroupPresentationContext(group, bounds, proxyPorts),
    );
    if (!description) return undefined;
    const local = description.bounds;
    if (
      !Number.isFinite(local.x) ||
      !Number.isFinite(local.y) ||
      !Number.isFinite(local.width) ||
      !Number.isFinite(local.height) ||
      local.width <= 0 ||
      local.height <= 0 ||
      local.width !== bounds.width ||
      local.height !== bounds.height
    ) {
      throw new Error(`Group "${group.id}" ${mode} visual bounds must match its projected size.`);
    }
    return description;
  }

  function getGroupProxyLayouts(
    group: FlowGroup,
    bounds: GroupBounds,
    proxyPorts: readonly GroupProxyPort[],
  ) {
    const layout = new Map<string, NodePortLayout>();
    const definition = typeRegistry.groups.group;
    if (!definition.getProxyPortLayout) return layout;
    const context = getGroupPresentationContext(group, bounds, proxyPorts);
    proxyPorts.forEach((proxyPort, index) => {
      const position = definition.getProxyPortLayout!(
        group,
        proxyPort,
        index,
        proxyPorts.length,
        context,
      );
      if (!position) return;
      if (
        ![
          position.x,
          position.y,
          position.bounds.x,
          position.bounds.y,
          position.bounds.width,
          position.bounds.height,
        ].every(Number.isFinite) ||
        position.bounds.width <= 0 ||
        position.bounds.height <= 0
      ) {
        throw new Error(
          `Group "${group.id}" proxy-port layout must be finite and have positive hit bounds.`,
        );
      }
      layout.set(proxyPort.proxyPortId, position);
    });
    return layout;
  }

  function getDisplayNode(id: string): FlowNode | undefined {
    return visibleGraph.getDisplayNode(id, graph.getNode);
  }

  function getDisplayPosition(id: string, node: FlowNode) {
    return previewPositions.get(id) ?? node;
  }

  function getEndpointAnchor(nodeId: string, portId: string): Point | null {
    const endpoint = visibleGraph.getVisibleEndpoint(nodeId, portId);
    const node = visibleGraph.getDisplayNode(endpoint.nodeId, graph.getNode);
    const anchor = portAnchors.get(endpoint.nodeId)?.get(endpoint.portId);
    if (!node || !anchor) return null;
    const position = getDisplayPosition(endpoint.nodeId, node);
    return { x: position.x + anchor.x, y: position.y + anchor.y };
  }

  function refreshGroupProjection(groupId: string, includeBoundaryEdges = true): Set<string> {
    const affectedEdges = new Set<string>();
    const previous = graph.getGroup(groupId);
    const oldGroup = groupByRenderId.get(groupId);
    const proxyTopologyChanged = proxyTopologyDirtyGroupIds.has(groupId);
    const clearProxies = () => {
      visibleGraph.clearCollapsedGroup(groupId);
      groupProxyCache.invalidate(groupId);
      proxyTopologyDirtyGroupIds.delete(groupId);
    };
    if (!previous) {
      clearProxies();
      groupSpatial.remove(groupId);
      if (canvasOrder.delete(groupId, 'group')) groupPresentation.markOrderDirty();
      groupBoundsCache.delete(groupId);
      groupPresentationData.delete(groupId);
      groupVisualCache.delete(groupId);
      groupProxyPortLayouts.delete(groupId);
      visibleGraph.removeGroup(groupId, oldGroup?.memberNodeIds);
      portAnchors.delete(groupId);
      nodeSpatial.remove(groupId);
      for (const nodeId of oldGroup?.memberNodeIds ?? []) {
        const node = graph.getNode(nodeId);
        if (node)
          nodeSpatial.update(nodeId, nodeBounds(node, getDisplayPosition(nodeId, node)), nodeId);
        for (const edge of graph.getIncidentEdges(nodeId)) affectedEdges.add(edge.id);
      }
      groupByRenderId.delete(groupId);
      return affectedEdges;
    }
    groupByRenderId.set(groupId, previous);
    if (!groupPresentationData.has(groupId)) {
      groupPresentationData.set(groupId, resolveGroupPresentationData?.(previous));
    }
    if (canvasOrder.ensure(groupId, 'group')) groupPresentation.markOrderDirty();
    if (includeBoundaryEdges && previous.collapsed !== oldGroup?.collapsed) {
      for (const nodeId of previous.memberNodeIds) {
        for (const edge of graph.getIncidentEdges(nodeId)) affectedEdges.add(edge.id);
      }
    } else if (includeBoundaryEdges && previous.collapsed && proxyTopologyChanged) {
      const members = new Set(previous.memberNodeIds);
      for (const edge of getOrderedGroupIncidentEdges(
        previous,
        graph.getIncidentEdges,
        edgeOrder,
      )) {
        if (members.has(edge.sourceNodeId) !== members.has(edge.targetNodeId))
          affectedEdges.add(edge.id);
      }
    }
    const bounds = getGroupWorldBounds(previous);
    if (!bounds) {
      clearProxies();
      groupBoundsCache.delete(groupId);
      groupVisualCache.delete(groupId);
      groupProxyPortLayouts.delete(groupId);
      groupSpatial.remove(groupId);
      portAnchors.delete(groupId);
      nodeSpatial.remove(groupId);
      for (const nodeId of previous.memberNodeIds) {
        const node = graph.getNode(nodeId);
        if (node)
          nodeSpatial.update(nodeId, nodeBounds(node, getDisplayPosition(nodeId, node)), nodeId);
        for (const edge of graph.getIncidentEdges(nodeId)) affectedEdges.add(edge.id);
      }
      return affectedEdges;
    }
    groupBoundsCache.set(groupId, bounds);
    groupSpatial.update(
      groupId,
      {
        minX: bounds.x,
        minY: bounds.y,
        maxX: bounds.x + bounds.width,
        maxY: bounds.y + bounds.height,
      },
      groupId,
    );
    if (previous.collapsed) {
      let proxyPorts = groupProxyCache.get(groupId);
      if (!proxyPorts || proxyTopologyDirtyGroupIds.has(groupId)) {
        clearProxies();
        const boundaryEdges = getOrderedGroupIncidentEdges(
          previous,
          graph.getIncidentEdges,
          edgeOrder,
        );
        proxyPorts = getGroupProxyPorts(previous, graph.getNode, boundaryEdges);
        groupProxyCache.set(groupId, proxyPorts);
        proxyTopologyDirtyGroupIds.delete(groupId);
      }
      const proxyNode = createCollapsedGroupNode(previous, bounds, proxyPorts);
      const visual = describeGroup(previous, 'collapsed', bounds, proxyPorts);
      groupVisualCache.set(groupId, visual ?? null);
      const localBounds = visual?.bounds;
      const positionedProxy = localBounds
        ? { ...proxyNode, x: bounds.x - localBounds.x, y: bounds.y - localBounds.y }
        : proxyNode;
      const portLayouts = getGroupProxyLayouts(previous, bounds, proxyPorts);
      groupProxyPortLayouts.set(groupId, portLayouts);
      visibleGraph.setCollapsedGroup(groupId, previous.memberNodeIds, positionedProxy, proxyPorts);
      cacheNodePorts(positionedProxy, portLayouts);
      canvasOrder.ensure(groupId, 'node');
      nodeSpatial.update(groupId, nodeBounds(positionedProxy), groupId);
      for (const nodeId of previous.memberNodeIds) nodeSpatial.remove(nodeId);
    } else {
      groupVisualCache.set(groupId, describeGroup(previous, 'expanded', bounds, []) ?? null);
      groupProxyPortLayouts.delete(groupId);
      if (groupProxyCache.get(groupId)) clearProxies();
      else visibleGraph.clearCollapsedGroup(groupId, previous.memberNodeIds);
      portAnchors.delete(groupId);
      nodeSpatial.remove(groupId);
      for (const nodeId of previous.memberNodeIds) {
        const node = graph.getNode(nodeId);
        if (node)
          nodeSpatial.update(nodeId, nodeBounds(node, getDisplayPosition(nodeId, node)), nodeId);
      }
    }
    return affectedEdges;
  }

  const groupByRenderId = new Map<string, FlowGroup>();

  function syncGroupViews(cameraBounds: Bounds) {
    groupPresentation.sync(
      cameraBounds,
      selection?.type === 'group' ? selection.id : null,
      projectedRenderPlan.groups.map((entity) => entity.id),
    );
  }

  function groupHeaderAtPoint(point: Point) {
    const hit = groupAtPoint(point);
    return hit && point.y <= hit.bounds.y + GROUP_HEADER_HEIGHT ? hit : null;
  }

  function groupAtPoint(point: Point) {
    const entity = projectedRenderPlan.groupAtPoint(point);
    const group = entity && graph.getGroup(entity.id);
    return entity && group ? { group, bounds: entity.bounds } : null;
  }

  function selectedGroupHeaderOverlayAtPoint(point: Point) {
    return groupPresentation.selectedHeaderOverlayAtPoint(
      point,
      selection?.type === 'group' ? selection.id : null,
    );
  }

  function activateGroupControl(hit: {
    readonly group: FlowGroup;
    readonly bounds: GroupBounds;
    readonly control: ProjectedControl;
  }) {
    if (interaction.selection) setSelection({ type: 'group', id: hit.group.id });
    if (hit.control.action === 'group-menu') {
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-control',
        entityId: hit.group.id,
        controlId: hit.control.id,
        action: hit.control.action,
      });
      if (decision && decision.status !== 'ignored') return;
      semanticEvents.onGroupInteraction?.(hit.group.id, hit.control.action);
      return;
    }
    if (!interaction.graphEditing && !interaction.groupActions) return;
    if (hit.control.action === 'group-collapse') {
      const decision = semanticEvents.onActionRequest?.({
        type: 'set-group-collapsed',
        groupId: hit.group.id,
        collapsed: true,
      });
      if (!decision || decision.status === 'ignored') graph.setGroupCollapsed(hit.group.id, true);
      else if (decision.status === 'committed' || decision.status === 'unchanged')
        semanticEvents.onGroupInteraction?.(hit.group.id, 'collapse');
    } else if (hit.control.action === 'group-expand') {
      const decision = semanticEvents.onActionRequest?.({
        type: 'set-group-collapsed',
        groupId: hit.group.id,
        collapsed: false,
      });
      if (!decision || decision.status === 'ignored') graph.setGroupCollapsed(hit.group.id, false);
      else if (decision.status === 'committed' || decision.status === 'unchanged')
        semanticEvents.onGroupInteraction?.(hit.group.id, 'expand');
    } else {
      semanticEvents.onGroupInteraction?.(hit.group.id, hit.control.action);
    }
  }

  function getProjectedGroupControl(point: Point, groupId?: string) {
    const selectedGroupId = selection?.type === 'group' ? selection.id : undefined;
    const hit = projectedRenderPlan.controlAtPoint(point, selectedGroupId);
    if (!hit || hit.entity.kind !== 'group' || (groupId && hit.entity.id !== groupId)) return null;
    const group = graph.getGroup(hit.entity.id);
    return group ? { group, bounds: hit.entity.bounds, control: hit.control } : null;
  }

  function getWorldPort(edge: FlowEdge, source: boolean): Point | null {
    const nodeId = source ? edge.sourceNodeId : edge.targetNodeId;
    const portId = source ? edge.sourcePortId : edge.targetPortId;
    return getEndpointAnchor(nodeId, portId);
  }

  function getRenderableEdge(edge: FlowEdge): FlowEdge {
    if (edge.type === 'flow') return edge;
    const source = getWorldPort(edge, true);
    const target = getWorldPort(edge, false);
    if (!source || !target) return edge;
    const visual = typeRegistry.edges[edge.type]?.describe(edge, source, target);
    if (!visual) return edge;
    const color = resolveVisualColor(visual.color);
    return {
      ...edge,
      settings: {
        ...edge.settings,
        routingStyle: 'straight',
        lineStyle: visual.pattern ?? 'solid',
        animationStyle: visual.animation ?? 'none',
        lineWidth: visual.width,
        rendererColor: color.color,
        rendererAlpha: color.alpha,
      },
    } as FlowEdge;
  }

  function getEdgeHitRadius(edge: FlowEdge) {
    if (edge.type === 'flow') return 6;
    const source = getWorldPort(edge, true);
    const target = getWorldPort(edge, false);
    if (!source || !target) return 6;
    const hitWidth = typeRegistry.edges[edge.type]?.describe(edge, source, target).hitWidth;
    return Number.isFinite(hitWidth) && hitWidth! > 0
      ? Math.min(MAX_EDGE_HIT_RADIUS, hitWidth! / 2)
      : 6;
  }

  function getEdgeEndpointTangent(edge: FlowEdge, source: boolean): Point {
    const nodeId = source ? edge.sourceNodeId : edge.targetNodeId;
    const portId = source ? edge.sourcePortId : edge.targetPortId;
    const port = graph.getNode(nodeId)?.ports.find((item) => item.id === portId);
    if (!port) return { x: 1, y: 0 };
    return getPortPathTangent(port.direction, source ? 'source' : 'target');
  }

  function getEdgeRouteAnchors(edge: FlowEdge): RouteAnchors | null {
    const source = getWorldPort(edge, true);
    const target = getWorldPort(edge, false);
    if (!source || !target) return null;
    return {
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
    };
  }

  function getEdgeCurve(edge: FlowEdge): EdgeCurve | null {
    if (edgeCurveCache.has(edge.id)) return edgeCurveCache.get(edge.id) ?? null;
    const sourceGroup = graph.getGroupForNode(edge.sourceNodeId);
    const targetGroup = graph.getGroupForNode(edge.targetNodeId);
    if (sourceGroup?.collapsed && targetGroup?.id === sourceGroup.id) {
      edgeCurveCache.set(edge.id, null);
      return null;
    }
    const start = getWorldPort(edge, true);
    const tip = getWorldPort(edge, false);
    const preview = edgeRoutePreviews.get(edge.id) ?? nodeMoveRoutePreviews.get(edge.id);
    let curve: EdgeCurve | null = null;
    if (start && tip) {
      if (edge.type !== 'flow') {
        const visual = typeRegistry.edges[edge.type]?.describe(edge, start, tip);
        const points = visual?.points.length ? visual.points : [start, tip];
        curve = {
          start: points[0],
          control1: points[0],
          control2: points.at(-1)!,
          tip: points.at(-1)!,
          pathStyle: 'straight',
          points,
        };
      } else {
        curve = createEdgeCurve(
          start,
          tip,
          edge.settings.routingStyle,
          preview?.controlPoints ?? edge.controlPoints,
          preview?.orthogonalTurns ?? edge.orthogonalTurns,
          {
            source: getEdgeEndpointTangent(edge, true),
            target: getEdgeEndpointTangent(edge, false),
          },
        );
      }
    }
    edgeCurveCache.set(edge.id, curve);
    return curve;
  }

  function drawEdgeEditor() {
    edgeEditorGraphics.clear();
    if (selection?.type !== 'edge') return;
    const edge = graph.getEdge(selection.id);
    if (!edge) return;
    const style = edge.settings.routingStyle;
    if (style === 'orthogonal') {
      const anchors = getEdgeRouteAnchors(edge);
      if (!anchors) return;
      const turns = normalizeOrthogonalTurns(
        edgeRoutePreviews.get(edge.id)?.orthogonalTurns ?? edge.orthogonalTurns,
        anchors,
      );
      const pathPoints = buildOrthogonalPathPoints(anchors, turns);
      const segments = buildOrthogonalSegments(pathPoints);
      for (const turn of turns) {
        edgeEditorGraphics
          .circle(turn.x, turn.y, 4)
          .fill(themeColors.editor)
          .stroke({ color: themeColors.canvasBackground, width: 1 });
      }
      if (hoveredOrthogonalSegment !== null && hoveredOrthogonalHandle) {
        const segment = segments.find((item) => item.index === hoveredOrthogonalSegment);
        if (segment?.editable) {
          const width = segment.orientation === 'horizontal' ? 18 : 8;
          const height = segment.orientation === 'horizontal' ? 8 : 18;
          edgeEditorGraphics
            .roundRect(
              hoveredOrthogonalHandle.x - width / 2,
              hoveredOrthogonalHandle.y - height / 2,
              width,
              height,
              4,
            )
            .fill(themeColors.editor)
            .stroke({ color: themeColors.canvasBackground, width: 1 });
        }
      }
      return;
    }

    const points = edgeRoutePreviews.get(edge.id)?.controlPoints ?? edge.controlPoints ?? [];
    for (const point of points) {
      edgeEditorGraphics
        .circle(point.x, point.y, 4)
        .fill(themeColors.editor)
        .stroke({ color: themeColors.canvasBackground, width: 1 });
    }
  }

  function refreshEditedEdge(edgeId: string) {
    const edge = graph.getEdge(edgeId);
    if (!edge) return;
    const curve = updateEdgeBounds(edge);
    const cameraBounds = getCameraBounds();
    const overscanBounds = getCameraBounds(VIEW_OVERSCAN);
    const edgeIsVisible = !!curve && edgeCurveIntersectsBounds(curve, cameraBounds);
    const edgeWasVisible = cameraVisibleEdgeIds.has(edgeId);
    if (edgeIsVisible !== edgeWasVisible) {
      const visible = new Set(cameraVisibleEdgeIds);
      if (edgeIsVisible) visible.add(edgeId);
      else visible.delete(edgeId);
      cameraVisibleEdgeIds = visible;
    }
    const edgeBounds = curve ? getEdgeCurveBounds(curve) : null;
    const edgeIsOverscanActive = !!edgeBounds && boundsIntersect(edgeBounds, overscanBounds);
    const edgeWasOverscanActive = overscanEdgeIds.has(edgeId);
    if (edgeIsOverscanActive !== edgeWasOverscanActive) {
      if (edgeIsOverscanActive) overscanEdgeIds.add(edgeId);
      else overscanEdgeIds.delete(edgeId);
    }
    if (edgeIsVisible !== edgeWasVisible) {
      if (edgeIsVisible && curve) meshRenderer.addVisibleEdge(getRenderableEdge(edge), curve);
      else meshRenderer.removeVisibleEdge(edgeId);
    } else if (edgeIsVisible && curve) {
      meshRenderer.updateEdges([{ edge: getRenderableEdge(edge), curve }]);
    }
    invalidate();
  }

  function updateEdgeBounds(edge: FlowEdge) {
    edgeCurveCache.delete(edge.id);
    const curve = getEdgeCurve(edge);
    if (curve) edgeSpatial.update(edge.id, getEdgeCurveBounds(curve), edge.id);
    else edgeSpatial.remove(edge.id);
    return curve;
  }

  function textVisibilityKey(visibility: ReturnType<typeof getNodeTextVisibility>) {
    return `${Number(visibility.title)}${Number(visibility.summary)}${Number(visibility.ports)}`;
  }

  function syncNodeContentOrder() {
    if (!nodeContentOrderDirty) return;
    const ordered = bottommostRenderOrder(
      [...nodeViews.keys()].map((id) => ({
        id,
        order: canvasOrder.get(id, 'node'),
        band: RENDER_BAND.nodeContent,
      })),
    );
    ordered.forEach(({ id }, index) => {
      const view = nodeViews.get(id);
      if (view) nodeContentLayer.setChildIndex(view.container, index);
    });
    nodeContentOrderDirty = false;
  }

  function updateNodeText(id: string, refreshOverlap = false) {
    const node = getDisplayNode(id);
    if (!node) return;
    const highlighted = selectedNodeIds.has(id) || hoveredNodeId === id;
    const visibility = getNodeTextVisibility(
      camera.getState().zoom,
      highlighted,
      exportingCanvasPng,
    );
    const visibilityKey = textVisibilityKey(visibility);
    const isCollapsedGroup = visibleGraph.isCollapsedGroup(id);
    const visual = getNodeVisual(node);
    const hasCustomExpandControl = !!visual?.controls.some(
      (control) => control.action === 'group-expand',
    );
    const needsTextView =
      cameraVisibleNodeIds.has(id) &&
      (isCollapsedGroup || visibility.title || visibility.summary || visibility.ports);
    let view = nodeViews.get(id);
    if (!needsTextView) {
      if (view) releaseNodeView(id);
      return;
    }
    if (!meshRenderer.isNodeGroupRepresentative(id)) {
      if (view) releaseNodeView(id);
      return;
    }
    if (!view) {
      view = nodePool.pop();
      const textResolution = app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE;
      const viewNode = node.type === 'recipe' ? node : ({ ...node, data: {} } as FlowNode);
      if (view) {
        registeredNodeTexts.delete(view);
        updateNodeView(view, viewNode, isCollapsedGroup, textResolution, !hasCustomExpandControl);
      } else
        view = createNodeView(viewNode, isCollapsedGroup, textResolution, !hasCustomExpandControl);
      view.container.visible = true;
      nodeViews.set(id, view);
      nodeContentLayer.addChild(view.container);
      nodeContentOrderDirty = true;
    }
    const previousVisibilityKey = nodeOcclusion.getVisibilityKey(id);
    const viewCreated = previousVisibilityKey === undefined;
    const position = previewPositions.get(id) ?? node;
    view.container.position.set(position.x, position.y);
    const visibilityChanged = previousVisibilityKey !== visibilityKey;
    if (viewCreated || visibilityChanged || refreshOverlap) {
      setNodeDetailLevel(
        view,
        camera.getState().zoom,
        highlighted,
        true,
        app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE,
        exportingCanvasPng,
      );
      nodeOcclusion.setVisibilityKey(id, visibilityKey);
    }

    const visualChanged = !nodeVisualByView.has(view) || nodeVisualByView.get(view) !== visual;
    if (visualChanged) {
      const previousAssets = registeredNodeAssets.get(view) ?? [];
      for (const sprite of previousAssets) {
        view.textContainer.removeChild(sprite);
        sprite.destroy({ texture: false, textureSource: false });
      }
      const assets: Sprite[] = [];
      for (const asset of visual?.assets ?? []) {
        const source = resolveAsset?.(asset.asset);
        if (!source) continue;
        const sprite = new Sprite(Texture.from(source));
        const width = asset.bounds.width;
        const height = asset.bounds.height;
        const fit = asset.fit ?? 'contain';
        const scaleX = width / Math.max(1, sprite.texture.width);
        const scaleY = height / Math.max(1, sprite.texture.height);
        const scale =
          fit === 'contain'
            ? Math.min(scaleX, scaleY)
            : fit === 'cover'
              ? Math.max(scaleX, scaleY)
              : undefined;
        if (scale === undefined) {
          sprite.width = width;
          sprite.height = height;
        } else {
          sprite.scale.set(scale);
          sprite.position.set(
            asset.bounds.x + (width - sprite.width) / 2,
            asset.bounds.y + (height - sprite.height) / 2,
          );
        }
        if (fit === 'stretch') sprite.position.set(asset.bounds.x, asset.bounds.y);
        assets.push(sprite);
      }
      if (assets.length > 0) view.textContainer.addChild(...assets);
      registeredNodeAssets.set(view, assets);
      const previousCustomTexts = registeredNodeTexts.get(view) ?? [];
      for (const text of previousCustomTexts) {
        view.textContainer.removeChild(text);
        text.destroy();
      }
      const customTexts: Text[] = [];
      if (visual) {
        for (const item of visual.texts) {
          const text = new Text({
            text: item.text,
            style: {
              fill:
                typeof item.color === 'number'
                  ? item.color
                  : parseThemeColorCss(resolveVisualTextColor(item.color)).color,
              fontFamily: item.fontFamily ?? 'system-ui, sans-serif',
              fontSize: item.fontSize,
              fontWeight: String(item.fontWeight ?? '400') as TextStyleFontWeight,
              wordWrap: item.width !== undefined,
              wordWrapWidth: item.width,
            },
            anchor: {
              x: item.align === 'center' ? 0.5 : item.align === 'right' ? 1 : 0,
              y: item.verticalAlign === 'middle' ? 0.5 : item.verticalAlign === 'bottom' ? 1 : 0,
            },
            resolution: app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE,
          });
          text.position.set(item.x, item.y);
          customTexts.push(text);
        }
        view.textContainer.addChild(...customTexts);
      }
      registeredNodeTexts.set(view, customTexts);
      nodeVisualByView.set(view, visual);
    }
    if (visual) {
      if (view.title) view.title.visible = false;
      for (const text of view.summary ?? []) text.visible = false;
      if (view.machineName) view.machineName.visible = false;
      if (view.machineCount) view.machineCount.visible = false;
      for (const text of view.portLabels) text.visible = false;
    }

    const order = canvasOrder.get(id, 'node');
    const textSignature =
      visual?.texts
        .map((text) => `${text.id}:${text.text}:${text.x}:${text.y}:${text.width}:${text.height}`)
        .join('|') ?? '';
    const occlusionKey = `${position.x}:${position.y}:${order}:${visibilityKey}:${textSignature}`;
    if (
      !viewCreated &&
      !visibilityChanged &&
      !refreshOverlap &&
      nodeOcclusion.getOcclusionKey(id) === occlusionKey
    )
      return;

    const occlusionStartedAt = performance.now();
    const labels = view.textContainer.children.filter(
      (child): child is Text => child instanceof Text && child.visible,
    );
    if (exportingCanvasPng) {
      for (const label of view.textContainer.children) label.visible = true;
      view.textContainer.mask = null;
      view.controlContainer.mask = null;
      nodeOcclusion.setOcclusionKey(id, occlusionKey);
      return;
    }
    const labelBounds = labels.map(
      (label): Bounds => ({
        minX: label.x - label.width * label.anchor.x,
        minY: label.y - label.height * label.anchor.y,
        maxX: label.x + label.width * (1 - label.anchor.x),
        maxY: label.y + label.height * (1 - label.anchor.y),
      }),
    );
    const controlBounds: Bounds | undefined = view.expandButton?.visible
      ? {
          minX: COLLAPSED_GROUP_EXPAND_BUTTON.x,
          minY: COLLAPSED_GROUP_EXPAND_BUTTON.y,
          maxX: COLLAPSED_GROUP_EXPAND_BUTTON.x + COLLAPSED_GROUP_EXPAND_BUTTON.width,
          maxY: COLLAPSED_GROUP_EXPAND_BUTTON.y + COLLAPSED_GROUP_EXPAND_BUTTON.height,
        }
      : undefined;
    const getOcclusionCandidate = (candidateId: string) => {
      const projected = projectedRenderPlan.getNode(candidateId);
      const candidateNode = getDisplayNode(candidateId);
      if (!candidateNode) return null;
      return {
        id: candidateId,
        order: projected?.order ?? canvasOrder.get(candidateId, 'node'),
        bounds: projected
          ? {
              minX: projected.bounds.x,
              minY: projected.bounds.y,
              maxX: projected.bounds.x + projected.bounds.width,
              maxY: projected.bounds.y + projected.bounds.height,
            }
          : nodeBounds(candidateNode, getDisplayPosition(candidateId, candidateNode)),
      };
    };
    const layout = nodeOcclusion.calculate({
      id,
      position,
      order,
      labels: labelBounds,
      control: controlBounds,
      history: canvasOrder.historyEntries,
      getCurrentOrder: (candidateId) => canvasOrder.get(candidateId, 'node'),
      hasDisplayNode: (candidateId) => !!getDisplayNode(candidateId),
      getCandidate: getOcclusionCandidate,
      queryCandidates: (bounds) =>
        nodeSpatial
          .query(bounds)
          .map(getOcclusionCandidate)
          .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate),
    });
    labels.forEach((label, index) => {
      if (!layout.labelFragments[index]) label.visible = false;
    });
    const visibleLabelFragments = layout.labelFragments.filter(
      (fragments): fragments is readonly Bounds[] => fragments !== null,
    );

    if (layout.needsTextMask) {
      const mask = view.overlapMask ?? new Graphics();
      mask.clear();
      for (const fragments of visibleLabelFragments) {
        for (const fragment of fragments) {
          mask
            .rect(
              fragment.minX,
              fragment.minY,
              fragment.maxX - fragment.minX,
              fragment.maxY - fragment.minY,
            )
            .fill(themeColors.white);
        }
      }
      if (!mask.parent) view.textContainer.addChild(mask);
      view.overlapMask = mask;
      view.textContainer.mask = mask;
    } else if (view.overlapMask) {
      view.textContainer.mask = null;
      view.textContainer.removeChild(view.overlapMask);
      view.overlapMask.destroy();
      view.overlapMask = null;
    }

    if (controlBounds) {
      const controlFragments = layout.controlFragments ?? [];
      const needsControlMask =
        controlFragments.length !== 1 || !containsBounds(controlFragments[0], controlBounds);
      if (needsControlMask) {
        const mask = view.controlMask ?? new Graphics();
        mask.clear();
        for (const fragment of controlFragments) {
          mask
            .rect(
              fragment.minX,
              fragment.minY,
              fragment.maxX - fragment.minX,
              fragment.maxY - fragment.minY,
            )
            .fill(themeColors.white);
        }
        if (!mask.parent) view.controlContainer.addChild(mask);
        view.controlMask = mask;
        view.controlContainer.mask = mask;
      } else if (view.controlMask) {
        view.controlContainer.mask = null;
        view.controlContainer.removeChild(view.controlMask);
        view.controlMask.destroy();
        view.controlMask = null;
      }
    } else if (view.controlMask) {
      view.controlContainer.mask = null;
      view.controlContainer.removeChild(view.controlMask);
      view.controlMask.destroy();
      view.controlMask = null;
    }
    nodeOcclusion.setOcclusionKey(id, occlusionKey);
    recordDuration(occlusionDurations, performance.now() - occlusionStartedAt);
    recordDuration(occlusionCandidateCounts, layout.candidateCount);
  }

  function enqueueNodeTextRefresh(ids: Iterable<string>, prioritizeViewport = false) {
    const uniqueIds = [...new Set(ids)];
    if (prioritizeViewport) {
      const viewport = camera.getState();
      const center = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom };
      uniqueIds.sort((leftId, rightId) => {
        const leftNode = getDisplayNode(leftId);
        const rightNode = getDisplayNode(rightId);
        if (!leftNode) return rightNode ? 1 : 0;
        if (!rightNode) return -1;
        const leftPosition = getDisplayPosition(leftId, leftNode);
        const rightPosition = getDisplayPosition(rightId, rightNode);
        const leftDistance = (leftPosition.x - center.x) ** 2 + (leftPosition.y - center.y) ** 2;
        const rightDistance = (rightPosition.x - center.x) ** 2 + (rightPosition.y - center.y) ** 2;
        return leftDistance - rightDistance;
      });
    }
    nodeTextRefreshQueue.enqueue(uniqueIds);
  }

  function refreshNodeTextOverlaps(
    bounds: Bounds | readonly Bounds[],
    include: readonly string[] = [],
  ) {
    const areas = Array.isArray(bounds) ? bounds : [bounds];
    const ids = collectOcclusionRefreshIds(areas, (area) => nodeSpatial.query(area), include);
    for (const id of ids) {
      if (cameraVisibleNodeIds.has(id)) updateNodeText(id, true);
    }
  }

  function releaseNodeView(id: string) {
    const view = nodeViews.get(id);
    if (!view) return;
    nodeViews.delete(id);
    nodeContentLayer.removeChild(view.container);
    nodeContentOrderDirty = true;
    view.container.visible = false;
    view.container.renderable = false;
    clearNodeText(view);
    registeredNodeTexts.delete(view);
    registeredNodeAssets.delete(view);
    nodeVisualByView.delete(view);
    nodeOcclusion.forget(id);
    retainNodeView(nodePool, view);
  }

  function activateNode(node: FlowNode) {
    updateNodeText(node.id);
  }

  function syncMeshVisibility(
    forceGeometry: boolean,
    previousVisibleNodeIds: ReadonlySet<string>,
    visibleNodeIds: ReadonlySet<string>,
    previousVisibleEdgeIds: ReadonlySet<string>,
    visibleEdgeIds: ReadonlySet<string>,
  ) {
    if (
      !forceGeometry &&
      previousVisibleNodeIds === visibleNodeIds &&
      previousVisibleEdgeIds === visibleEdgeIds
    )
      return;
    if (forceGeometry) {
      const nodeRenderData = [...visibleNodeIds]
        .flatMap((id) => {
          const data = createNodeRenderDataById(id);
          return data ? [data] : [];
        })
        .sort((left, right) => left.order - right.order);
      const visibleEdges: FlowEdge[] = [];
      const visibleCurves = new Map<string, EdgeCurve>();
      const edgeRenderData = [...visibleEdgeIds]
        .flatMap((id) => {
          const data = createEdgeRenderDataById(id);
          return data ? [data] : [];
        })
        .sort(
          (left, right) =>
            (edgeOrder.get(left.edge.id) ?? -1) - (edgeOrder.get(right.edge.id) ?? -1),
        );
      for (const { edge, curve } of edgeRenderData) {
        visibleEdges.push(edge);
        visibleCurves.set(edge.id, curve);
      }
      meshRenderer.sync(nodeRenderData, visibleEdges, visibleCurves, true);
      return;
    }

    const removedNodeIds = [...previousVisibleNodeIds].filter((id) => !visibleNodeIds.has(id));
    const addedNodes = [...visibleNodeIds]
      .filter((id) => !previousVisibleNodeIds.has(id))
      .flatMap((id) => {
        const data = createNodeRenderDataById(id);
        return data ? [data] : [];
      })
      .sort((left, right) => left.order - right.order);
    const removedEdgeIds = [...previousVisibleEdgeIds].filter((id) => !visibleEdgeIds.has(id));
    const addedEdges = [...visibleEdgeIds]
      .filter((id) => !previousVisibleEdgeIds.has(id))
      .flatMap((id) => {
        const data = createEdgeRenderDataById(id);
        return data ? [data] : [];
      })
      .sort(
        (left, right) => (edgeOrder.get(left.edge.id) ?? -1) - (edgeOrder.get(right.edge.id) ?? -1),
      );
    meshRenderer.removeVisibleNodes(removedNodeIds);
    meshRenderer.removeVisibleEdges(removedEdgeIds);
    meshRenderer.addVisibleNodes(addedNodes);
    meshRenderer.addVisibleEdges(addedEdges);
  }

  function syncVisibleViews(forceGeometry = false, boundsOverride?: Bounds, publishScene = true) {
    if (disposed) return;
    const startedAt = performance.now();
    const cameraBounds = boundsOverride ?? getCameraBounds();
    const overscanBounds = boundsOverride ?? getCameraBounds(VIEW_OVERSCAN);
    const canIncrementallyUpdate =
      !forceGeometry && lastCameraBounds !== null && lastOverscanBounds !== null;
    const allNodesVisible = containsBounds(cameraBounds, nodeSpatial.getBounds());
    const allNodesOverscanActive = containsBounds(overscanBounds, nodeSpatial.getBounds());
    const visibleNodeIds =
      allNodesVisible && cameraVisibleNodeIds.size === nodeSpatial.size
        ? cameraVisibleNodeIds
        : canIncrementallyUpdate
          ? updateIndexedVisibility(
              nodeSpatial,
              cameraVisibleNodeIds,
              lastCameraBounds!,
              cameraBounds,
              (id, bounds) => {
                const node = getDisplayNode(id);
                return (
                  !!node && boundsIntersect(nodeBounds(node, getDisplayPosition(id, node)), bounds)
                );
              },
            )
          : queryVisibleNodes(nodeSpatial, cameraBounds);
    const queriedOverscanNodeIds =
      allNodesOverscanActive && overscanNodeIds.size === nodeSpatial.size
        ? overscanNodeIds
        : canIncrementallyUpdate
          ? updateIndexedVisibility(
              nodeSpatial,
              overscanNodeIds,
              lastOverscanBounds!,
              overscanBounds,
              (id, bounds) => {
                const node = getDisplayNode(id);
                return (
                  !!node && boundsIntersect(nodeBounds(node, getDisplayPosition(id, node)), bounds)
                );
              },
            )
          : queryVisibleNodes(nodeSpatial, overscanBounds);
    const activeDragIds = nodeDrag.getActiveNodeIds();
    const nextOverscanNodeIds = withIncludedIds(queriedOverscanNodeIds, activeDragIds);
    const visibleNodesChanged = cameraVisibleNodeIds !== visibleNodeIds;
    const overscanNodesChanged = overscanNodeIds !== nextOverscanNodeIds;
    const detailZoom = camera.getState().zoom;
    const detailLevel = textVisibilityKey(
      getNodeTextVisibility(detailZoom, false, exportingCanvasPng),
    );
    const detailLevelChanged = detailLevel !== lastDetailLevel;
    const previousVisibleNodeIds = cameraVisibleNodeIds;

    const allEdgesVisible = containsBounds(cameraBounds, edgeSpatial.getBounds());
    const allEdgesOverscanActive = containsBounds(overscanBounds, edgeSpatial.getBounds());
    const visibleEdgeIds =
      allEdgesVisible && cameraVisibleEdgeIds.size === edgeSpatial.size
        ? cameraVisibleEdgeIds
        : canIncrementallyUpdate
          ? updateIndexedVisibility(
              edgeSpatial,
              cameraVisibleEdgeIds,
              lastCameraBounds!,
              cameraBounds,
              (id, bounds) => {
                const edge = graph.getEdge(id);
                const curve = edge && getEdgeCurve(edge);
                return !!curve && edgeCurveIntersectsBounds(curve, bounds);
              },
            )
          : queryVisibleEdges(edgeSpatial, cameraBounds, (id) => {
              const edge = graph.getEdge(id);
              return edge ? getEdgeCurve(edge) : null;
            });
    const previousVisibleEdgeIds = cameraVisibleEdgeIds;
    const queriedOverscanEdgeIds =
      allEdgesOverscanActive && overscanEdgeIds.size === edgeSpatial.size
        ? overscanEdgeIds
        : canIncrementallyUpdate
          ? updateIndexedVisibility(
              edgeSpatial,
              overscanEdgeIds,
              lastOverscanBounds!,
              overscanBounds,
              (id, bounds) => {
                const edge = graph.getEdge(id);
                const curve = edge && getEdgeCurve(edge);
                return !!curve && boundsIntersect(getEdgeCurveBounds(curve), bounds);
              },
            )
          : new Set(edgeSpatial.query(overscanBounds));
    const nextOverscanEdgeIds = withIncludedIds(
      queriedOverscanEdgeIds,
      activeDragIds.flatMap((id) => graph.getIncidentEdges(id).map((edge) => edge.id)),
    );
    const overscanEdgesChanged = overscanEdgeIds !== nextOverscanEdgeIds;
    recordDuration(visibilityQueryDurations, performance.now() - startedAt);

    cameraVisibleNodeIds = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds);
    cameraVisibleEdgeIds = visibleEdgeIds instanceof Set ? visibleEdgeIds : new Set(visibleEdgeIds);
    const projectedSceneStartedAt = performance.now();
    rebuildProjectedRenderPlan(cameraBounds);
    recordDuration(projectedSceneDurations, performance.now() - projectedSceneStartedAt);
    const visibleMeshStartedAt = performance.now();
    syncMeshVisibility(
      forceGeometry,
      previousVisibleNodeIds,
      visibleNodeIds,
      previousVisibleEdgeIds,
      visibleEdgeIds,
    );
    recordDuration(visibleMeshDurations, performance.now() - visibleMeshStartedAt);
    const nodeTextLifecycleStartedAt = performance.now();
    if (overscanNodesChanged) {
      for (const id of overscanNodeIds) if (!nextOverscanNodeIds.has(id)) releaseNodeView(id);
      overscanNodeIds.clear();
      for (const id of nextOverscanNodeIds) overscanNodeIds.add(id);
    }
    if (detailLevelChanged) {
      const visibleIds = [...cameraVisibleNodeIds];
      if (exportingCanvasPng) {
        nodeTextRefreshQueue.clear();
        for (const id of visibleIds) updateNodeText(id);
      } else {
        enqueueNodeTextRefresh([...visibleIds, ...nodeViews.keys()], true);
      }
      lastDetailLevel = detailLevel;
    } else if (visibleNodesChanged) {
      enqueueNodeTextRefresh([
        ...[...previousVisibleNodeIds].filter((id) => !visibleNodeIds.has(id)),
        ...[...visibleNodeIds].filter((id) => !previousVisibleNodeIds.has(id)),
      ]);
    }
    if (overscanEdgesChanged) {
      overscanEdgeIds.clear();
      for (const id of nextOverscanEdgeIds) overscanEdgeIds.add(id);
    }
    recordDuration(nodeTextLifecycleDurations, performance.now() - nodeTextLifecycleStartedAt);

    const groupPresentationStartedAt = performance.now();
    syncGroupViews(cameraBounds);
    syncNodeContentOrder();
    recordDuration(groupPresentationDurations, performance.now() - groupPresentationStartedAt);

    lastCameraBounds = cameraBounds;
    lastOverscanBounds = overscanBounds;
    const syncWorkMs = performance.now() - startedAt;
    recordDuration(viewportSyncDurations, syncWorkMs);
    if (publishScene) notifyProjectedSceneChanged(true);
  }

  function syncVisibleViewsForPreview(
    changedNodeIds: ReadonlySet<string>,
    changedGroupIds: ReadonlySet<string>,
    changedEdgeIds: ReadonlySet<string>,
  ) {
    if (disposed || pendingViewportSync || !lastCameraBounds || !lastOverscanBounds) return false;
    const startedAt = performance.now();
    const cameraBounds = lastCameraBounds;
    const overscanBounds = lastOverscanBounds;
    const addedVisibleNodeIds: string[] = [];
    const removedVisibleNodeIds: string[] = [];
    const addedVisibleEdgeIds: string[] = [];
    const removedVisibleEdgeIds: string[] = [];
    const nodeUpdates = new Map<string, ProjectedNodeEntity | null>();
    const groupUpdates = new Map<string, ProjectedGroupEntity | null>();
    const edgeUpdates = new Map<string, ProjectedEdgeEntity | null>();
    const activeDragIds = nodeDrag.getActiveNodeIds();
    const activeDragIdSet = new Set(activeDragIds);
    const activeDragEdgeIds = new Set(
      activeDragIds.flatMap((id) => graph.getIncidentEdges(id).map((edge) => edge.id)),
    );
    const overscanNodeCandidates = new Set([...changedNodeIds, ...activeDragIds]);
    const overscanEdgeCandidates = new Set([...changedEdgeIds, ...activeDragEdgeIds]);
    const cameraMembershipChangedNodeIds: string[] = [];

    for (const id of changedNodeIds) {
      const node = getDisplayNode(id);
      const position = node ? getDisplayPosition(id, node) : null;
      const visible =
        !!node && !!position && boundsIntersect(nodeBounds(node, position), cameraBounds);
      const wasVisible = cameraVisibleNodeIds.has(id);
      if (visible && !wasVisible) {
        cameraVisibleNodeIds.add(id);
        cameraMembershipChangedNodeIds.push(id);
        addedVisibleNodeIds.push(id);
      } else if (!visible && wasVisible) {
        cameraVisibleNodeIds.delete(id);
        cameraMembershipChangedNodeIds.push(id);
        removedVisibleNodeIds.push(id);
      }
      nodeUpdates.set(id, visible ? createProjectedNodeEntity(id) : null);
    }

    for (const id of changedGroupIds) {
      const group = graph.getGroup(id);
      const bounds = group && !group.collapsed ? groupBoundsCache.get(id) : undefined;
      const visible =
        !!bounds &&
        boundsIntersect(cameraBounds, {
          minX: bounds.x,
          minY: bounds.y,
          maxX: bounds.x + bounds.width,
          maxY: bounds.y + bounds.height,
        });
      if (visible || projectedRenderPlan.getGroup(id)) {
        groupUpdates.set(id, visible ? createProjectedGroupEntity(id) : null);
      }
    }

    for (const id of changedEdgeIds) {
      const edge = graph.getEdge(id);
      const curve = edge && getEdgeCurve(edge);
      const visible = !!curve && edgeCurveIntersectsBounds(curve, cameraBounds);
      const wasVisible = cameraVisibleEdgeIds.has(id);
      if (visible && !wasVisible) {
        cameraVisibleEdgeIds.add(id);
        addedVisibleEdgeIds.push(id);
      } else if (!visible && wasVisible) {
        cameraVisibleEdgeIds.delete(id);
        removedVisibleEdgeIds.push(id);
      }
      edgeUpdates.set(id, visible ? createProjectedEdgeEntity(id) : null);
    }

    for (const id of overscanNodeCandidates) {
      const node = getDisplayNode(id);
      const position = node ? getDisplayPosition(id, node) : null;
      const inOverscan =
        !!node && !!position && boundsIntersect(nodeBounds(node, position), overscanBounds);
      const shouldBeOverscan = inOverscan || activeDragIdSet.has(id);
      const wasOverscan = overscanNodeIds.has(id);
      if (shouldBeOverscan && !wasOverscan) {
        overscanNodeIds.add(id);
        if (node) activateNode(node);
      } else if (!shouldBeOverscan && wasOverscan) {
        overscanNodeIds.delete(id);
        releaseNodeView(id);
      }
    }

    for (const id of overscanEdgeCandidates) {
      const edge = graph.getEdge(id);
      const curve = edge && getEdgeCurve(edge);
      const inOverscan = !!curve && boundsIntersect(getEdgeCurveBounds(curve), overscanBounds);
      const shouldBeOverscan = inOverscan || activeDragEdgeIds.has(id);
      const wasOverscan = overscanEdgeIds.has(id);
      if (shouldBeOverscan && !wasOverscan) {
        overscanEdgeIds.add(id);
      } else if (!shouldBeOverscan && wasOverscan) {
        overscanEdgeIds.delete(id);
      }
    }

    projectedRenderPlan.applyUpdates({
      nodes: nodeUpdates,
      groups: groupUpdates,
      edges: edgeUpdates,
    });
    meshRenderer.removeVisibleNodes(removedVisibleNodeIds);
    meshRenderer.removeVisibleEdges(removedVisibleEdgeIds);
    meshRenderer.addVisibleNodes(
      addedVisibleNodeIds
        .flatMap((id) => {
          const data = createNodeRenderDataById(id);
          return data ? [data] : [];
        })
        .sort((left, right) => left.order - right.order),
    );
    meshRenderer.addVisibleEdges(
      addedVisibleEdgeIds
        .flatMap((id) => {
          const data = createEdgeRenderDataById(id);
          return data ? [data] : [];
        })
        .sort(
          (left, right) =>
            (edgeOrder.get(left.edge.id) ?? -1) - (edgeOrder.get(right.edge.id) ?? -1),
        ),
    );
    for (const id of cameraMembershipChangedNodeIds) updateNodeText(id);
    syncGroupViews(cameraBounds);
    syncNodeContentOrder();
    const syncWorkMs = performance.now() - startedAt;
    recordDuration(viewportSyncDurations, syncWorkMs);
    notifyProjectedSceneChanged(true);
    return true;
  }

  function applyViewportTransform(viewport: Viewport) {
    world.position.set(app.screen.width / 2 + viewport.x, app.screen.height / 2 + viewport.y);
    world.scale.set(viewport.zoom);
    grid.tileScale.set(viewport.zoom);
    grid.tilePosition.set(
      app.screen.width / 2 + viewport.x - (SNAP_GRID_X / 2) * viewport.zoom,
      app.screen.height / 2 + viewport.y - (SNAP_GRID_Y / 2) * viewport.zoom,
    );
  }

  function graphToScreen(point: Point): Point {
    const viewport = camera.getState();
    const size = getCanvasCssSize();
    return {
      x:
        size.width / 2 +
        ((viewport.x + point.x * viewport.zoom) * size.width) / Math.max(1, app.screen.width),
      y:
        size.height / 2 +
        ((viewport.y + point.y * viewport.zoom) * size.height) / Math.max(1, app.screen.height),
    };
  }

  function screenToGraph(point: Point): Point {
    const viewport = camera.getState();
    const size = getCanvasCssSize();
    const screenX = (point.x * app.screen.width) / Math.max(1, size.width);
    const screenY = (point.y * app.screen.height) / Math.max(1, size.height);
    return {
      x: (screenX - app.screen.width / 2 - viewport.x) / viewport.zoom,
      y: (screenY - app.screen.height / 2 - viewport.y) / viewport.zoom,
    };
  }

  function convertGraphBounds(
    bounds: CanvasGeometryBounds,
    space: CanvasCoordinateSpace,
  ): CanvasGeometryBounds {
    if (space === 'graph') return bounds;
    const topLeft = graphToScreen({ x: bounds.x, y: bounds.y });
    const bottomRight = graphToScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  function getNodeBounds(nodeId: string, space: CanvasCoordinateSpace = 'graph') {
    const group = graph.getGroup(nodeId);
    if (group && !group.collapsed) {
      const bounds = projectedRenderPlan.getGroup(nodeId)?.bounds ?? groupBoundsCache.get(nodeId);
      return bounds ? convertGraphBounds(bounds, space) : null;
    }
    const projected = projectedRenderPlan.getNode(nodeId);
    if (projected) return convertGraphBounds(projected.bounds, space);
    const node = getDisplayNode(nodeId);
    if (!node) return null;
    const bounds = nodeBounds(node, getDisplayPosition(nodeId, node));
    return convertGraphBounds(
      {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      },
      space,
    );
  }

  function getPortBounds(nodeId: string, portId: string, space: CanvasCoordinateSpace = 'graph') {
    const endpoint = visibleGraph.getVisibleEndpoint(nodeId, portId);
    const projected = projectedRenderPlan.getNode(endpoint.nodeId);
    const node = (projected?.node as FlowNode | undefined) ?? getDisplayNode(endpoint.nodeId);
    const anchor = portAnchors.get(endpoint.nodeId)?.get(endpoint.portId);
    const port = node?.ports.find((item) => item.id === endpoint.portId);
    if (!node || !anchor || !port) return null;
    const position = projected?.position ?? getDisplayPosition(endpoint.nodeId, node);
    const size = NODE_HANDLE_SIZE;
    const centerX =
      position.x + anchor.x + (port.direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH);
    const centerY = position.y + anchor.y;
    return convertGraphBounds(
      { x: centerX - size / 2, y: centerY - size / 2, width: size, height: size },
      space,
    );
  }

  function getPortRowBounds(
    nodeId: string,
    portId: string,
    space: CanvasCoordinateSpace = 'graph',
  ) {
    const endpoint = visibleGraph.getVisibleEndpoint(nodeId, portId);
    const projected = projectedRenderPlan.getNode(endpoint.nodeId);
    const node = (projected?.node as FlowNode | undefined) ?? getDisplayNode(endpoint.nodeId);
    const row = node && getRecipePortRowBounds(node, endpoint.portId);
    if (!node || !row) return null;
    const position = projected?.position ?? getDisplayPosition(endpoint.nodeId, node);
    return convertGraphBounds(
      {
        x: position.x + row.x,
        y: position.y + row.y,
        width: row.width,
        height: row.height,
      },
      space,
    );
  }

  function getControlBounds(
    entityId: string,
    controlIdOrAction: string,
    space: CanvasCoordinateSpace = 'graph',
  ) {
    const node = projectedRenderPlan.getNode(entityId);
    const group = projectedRenderPlan.getGroup(entityId);
    const entity = node ?? group;
    if (!entity) return null;
    const control = entity.controls.find(
      (item) => item.id === controlIdOrAction || item.action === controlIdOrAction,
    );
    if (!control) return null;
    const origin = node?.position ?? { x: group?.bounds.x ?? 0, y: group?.bounds.y ?? 0 };
    return convertGraphBounds(
      {
        x: origin.x + control.bounds.x,
        y: origin.y + control.bounds.y,
        width: control.bounds.width,
        height: control.bounds.height,
      },
      space,
    );
  }

  function getGroupHeaderBounds(groupId: string, space: CanvasCoordinateSpace = 'graph') {
    const group = graph.getGroup(groupId);
    const entity = projectedRenderPlan.getGroup(groupId);
    if (!group || group.collapsed || !entity) return null;
    return convertGraphBounds(
      {
        x: entity.bounds.x,
        y: entity.bounds.y,
        width: entity.bounds.width,
        height: GROUP_HEADER_HEIGHT,
      },
      space,
    );
  }

  function getEdgeGeometry(edgeId: string, space: CanvasCoordinateSpace = 'graph') {
    const projected = projectedRenderPlan.getEdge(edgeId);
    const edge = (projected?.edge as FlowEdge | undefined) ?? graph.getEdge(edgeId);
    const curve = projected?.curve ?? (edge && getEdgeCurve(edge));
    if (!curve) return null;
    const points = getEdgeCurvePoints(curve).map((point) =>
      space === 'graph' ? point : graphToScreen(point),
    );
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      points,
      bounds: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
    };
  }

  function queueViewportSync(viewport: Viewport, measureInput = true) {
    if (measureInput) {
      if (viewport.x !== lastViewportInput.x || viewport.y !== lastViewportInput.y)
        pendingPanSync = true;
      if (viewport.zoom !== lastViewportInput.zoom) pendingZoomSync = true;
      lastViewportInput = viewport;
    }
    pendingViewport = viewport;
    pendingViewportSync = true;
    invalidate();
  }

  function findNodeAtPoint(point: Point): string | null {
    const startedAt = performance.now();
    const bestId = pickTopmostNode(
      nodeSpatial,
      point,
      (id) => canvasOrder.get(id, 'node'),
      (id, worldPoint) => {
        const node = getDisplayNode(id);
        if (!node) return false;
        const projected = projectedRenderPlan.getNode(id);
        const position = projected?.position ?? getDisplayPosition(id, node);
        const hitShapes = projected?.hitShapes;
        if (!hitShapes?.length) {
          const bounds = projected?.bounds
            ? {
                minX: projected.bounds.x,
                minY: projected.bounds.y,
                maxX: projected.bounds.x + projected.bounds.width,
                maxY: projected.bounds.y + projected.bounds.height,
              }
            : nodeBounds(node, position);
          return (
            worldPoint.x >= bounds.minX &&
            worldPoint.x <= bounds.maxX &&
            worldPoint.y >= bounds.minY &&
            worldPoint.y <= bounds.maxY
          );
        }
        const x = worldPoint.x - position.x;
        const y = worldPoint.y - position.y;
        return hitShapes.some(
          (bounds) =>
            x >= bounds.x &&
            x <= bounds.x + bounds.width &&
            y >= bounds.y &&
            y <= bounds.y + bounds.height,
        );
      },
    );
    recordDuration(pickingDurations, performance.now() - startedAt);
    return bestId;
  }

  function getNodeControlAtPoint(
    node: FlowNode,
    point: Point,
    pointerType = 'mouse',
  ): NodeControlHit | null {
    const projected = projectedRenderPlan.getNode(node.id);
    const position = projected?.position ?? getDisplayPosition(node.id, node);
    const localX = point.x - position.x;
    const localY = point.y - position.y;
    const { zoom } = camera.getState();
    const collapsedGroup = visibleGraph.isCollapsedGroup(node.id);
    const controlHit = projectedRenderPlan.controlAtPoint(
      point,
      selection?.type === 'group' ? selection.id : undefined,
    );
    const visualControls =
      projected?.controls ??
      createProjectedControls(getNodeVisual(node) ?? typeRegistry.nodes[node.type]?.describe(node));
    for (const control of visualControls) {
      if (controlHit?.entity.id !== node.id || controlHit.control.id !== control.id) continue;
      if (collapsedGroup && control.action === 'node-menu') continue;
      const bounds = control.bounds;
      if (
        localX >= bounds.x &&
        localX <= bounds.x + bounds.width &&
        localY >= bounds.y &&
        localY <= bounds.y + bounds.height
      ) {
        if (collapsedGroup && control.action === 'group-expand') return { type: 'expand-group' };
        return { type: 'button', controlId: control.id, action: control.action };
      }
    }

    if (
      collapsedGroup &&
      !visualControls.some((control) => control.action === 'group-expand') &&
      controlHit?.entity.id === node.id &&
      isInsideCollapsedGroupExpandButton(localX, localY)
    ) {
      return { type: 'expand-group' };
    }

    if (
      node.type === 'recipe' &&
      !collapsedGroup &&
      !visualControls.some((control) => control.action === 'node-menu')
    ) {
      const buttonHalfSize = 12 / zoom;
      const buttonCenterX = NODE_WIDTH - 22;
      const buttonCenterY = 22;
      if (
        localX >= buttonCenterX - buttonHalfSize &&
        localX <= buttonCenterX + buttonHalfSize &&
        localY >= buttonCenterY - buttonHalfSize &&
        localY <= buttonCenterY + buttonHalfSize
      )
        return { type: 'button' };
    }

    const canvasRect = app.canvas.getBoundingClientRect();
    const cssPixelsPerRendererPixelX =
      app.screen.width > 0 ? canvasRect.width / app.screen.width : 1;
    const cssPixelsPerRendererPixelY =
      app.screen.height > 0 ? canvasRect.height / app.screen.height : cssPixelsPerRendererPixelX;
    const rendererPixelsPerCssX = canvasRect.width > 0 ? app.screen.width / canvasRect.width : 1;
    const rendererPixelsPerCssY =
      canvasRect.height > 0 ? app.screen.height / canvasRect.height : rendererPixelsPerCssX;
    const handleRadiusX = getPortHitRadius(
      pointerType,
      rendererPixelsPerCssX,
      zoom,
      NODE_HANDLE_SIZE,
    );
    const handleRadiusY = getPortHitRadius(
      pointerType,
      rendererPixelsPerCssY,
      zoom,
      NODE_HANDLE_SIZE,
    );

    const getPortRowHit = () => {
      for (const port of node.ports) {
        const row = getRecipePortRowBounds(node, port.id);
        if (!row) continue;
        if (
          localX >= row.x &&
          localX <= row.x + row.width &&
          localY >= row.y &&
          localY <= row.y + row.height
        ) {
          return { type: 'io' as const, portId: port.id };
        }
      }
      return null;
    };

    if (pointerType === 'touch') {
      const rowHit = getPortRowHit();
      if (rowHit) return rowHit;
    }

    const portTargets: PortHitTarget[] = [];
    for (const port of node.ports) {
      const anchor = portAnchors.get(node.id)?.get(port.id);
      const handleCenterX =
        anchor && anchor.x + (port.direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH);
      if (anchor && handleCenterX !== undefined)
        portTargets.push({ id: port.id, x: handleCenterX, y: anchor.y });
    }
    if (pointerType !== 'touch') {
      const portHit = portTargets.find(
        (target) =>
          Math.abs(localX - target.x) <= handleRadiusX &&
          Math.abs(localY - target.y) <= handleRadiusY,
      );
      if (portHit) return { type: 'port', portId: portHit.id };
      return getPortRowHit();
    }

    const portHit = findNearestPortHit(
      portTargets,
      { x: localX, y: localY },
      handleRadiusX,
      handleRadiusY,
      cssPixelsPerRendererPixelX,
      cssPixelsPerRendererPixelY,
      zoom,
    );
    if (portHit) return { type: 'port', portId: portHit.id };

    return getPortRowHit();
  }

  function resolveConnectionEndpoint(node: FlowNode, portId: string): ConnectionEndpoint | null {
    const displayPort = node.ports.find((port) => port.id === portId);
    if (!displayPort) return null;
    const proxy = visibleGraph.getProxyPort(portId);
    const nodeId = proxy?.memberNodeId ?? node.id;
    const resolvedPortId = proxy?.memberPortId ?? portId;
    const actualNode = graph.getNode(nodeId);
    const actualPort = actualNode?.ports.find((port) => port.id === resolvedPortId);
    if (!actualPort) return null;
    return {
      nodeId,
      portId: resolvedPortId,
      direction: displayPort.direction,
      kind: actualPort.kind ?? 'item',
    };
  }

  function findConnectablePortAtPoint(
    source: ConnectionEndpoint,
    point: Point,
  ): ConnectionPortCandidate | null {
    const candidates: ConnectionPortCandidate[] = [];
    for (const id of nodeSpatial.query({
      minX: point.x - CONNECTION_SNAP_RADIUS_WORLD,
      minY: point.y - CONNECTION_SNAP_RADIUS_WORLD,
      maxX: point.x + CONNECTION_SNAP_RADIUS_WORLD,
      maxY: point.y + CONNECTION_SNAP_RADIUS_WORLD,
    })) {
      const node = getDisplayNode(id);
      if (!node) continue;
      for (const port of node.ports) {
        const endpoint = resolveConnectionEndpoint(node, port.id);
        const anchor = endpoint && getEndpointAnchor(endpoint.nodeId, endpoint.portId);
        if (!endpoint || !anchor) continue;
        candidates.push({
          endpoint,
          anchor,
          hitAnchor: {
            x: anchor.x + (port.direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH),
            y: anchor.y,
          },
          renderOrder: canvasOrder.get(id, 'node'),
        });
      }
    }
    return findNearestConnectablePort(
      source,
      candidates,
      point,
      CONNECTION_SNAP_RADIUS_WORLD,
      semanticEvents.canConnectEndpoints,
    );
  }

  function endpointsCanConnect(first: ConnectionEndpoint, second: ConnectionEndpoint) {
    return (
      semanticEvents.canConnectEndpoints?.(first, second) ?? canConnectEndpoints(first, second)
    );
  }

  function refreshConnectionMarker() {
    connectionMarker.clear();
    const gesture = connectionController.getActive();
    if (!gesture) {
      const source = connectionController.getPendingClick();
      const anchor = source && getEndpointAnchor(source.nodeId, source.portId);
      if (anchor)
        connectionMarker
          .circle(anchor.x, anchor.y, 9)
          .stroke({ color: themeColors.editor, width: 2, alpha: 0.95 });
      return;
    }
    const sourceAnchor = getEndpointAnchor(gesture.source.nodeId, gesture.source.portId);
    if (!sourceAnchor) return;
    const targetAnchor =
      gesture.target && endpointsCanConnect(gesture.source, gesture.target)
        ? getEndpointAnchor(gesture.target.nodeId, gesture.target.portId)
        : null;
    const target =
      gesture.target && targetAnchor
        ? { endpoint: gesture.target, anchor: targetAnchor, renderOrder: 0 }
        : null;
    const anchors = getConnectionPreviewAnchors(
      gesture.source,
      sourceAnchor,
      gesture.current,
      target,
      semanticEvents.canConnectEndpoints,
    );
    const curve = createEdgeCurve(anchors.start, anchors.tip, graph.getRoutingStyle());
    const points = getEdgeCurvePoints(curve);
    if (points.length < 2) return;
    connectionMarker.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) connectionMarker.lineTo(point.x, point.y);
    connectionMarker.stroke({ color: themeColors.edge, width: 3, alpha: 0.95 });
  }

  function startConnection(node: FlowNode, portId: string, pointer: Point) {
    if (!interaction.connection) return;
    const source = resolveConnectionEndpoint(node, portId);
    if (!source) return;
    const outcome = connectionController.start(source, pointer);
    if (outcome.status === 'connected') {
      connectionMarker.clear();
      setSelection({ type: 'edge', id: outcome.edgeId });
      semanticEvents.onConnectionFinish?.({ status: 'connected', edgeId: outcome.edgeId });
      setCanvasCursor('');
      invalidate();
      return;
    } else if (outcome.status === 'invalid') {
      connectionMarker.clear();
      semanticEvents.onConnectionFinish?.({ status: 'invalid', reason: outcome.reason });
      setCanvasCursor('');
      invalidate();
      return;
    }
    semanticEvents.onConnectionStart?.(source);
    if (graph.getNode(node.id)) setSelection({ type: 'node', id: node.id });
    else if (graph.getGroup(node.id)) setSelection({ type: 'group', id: node.id });
    refreshConnectionMarker();
    setCanvasCursor('crosshair');
    invalidate();
  }

  function startEdgeReconnect(edge: FlowEdge, side: 'source' | 'target', pointer: Point) {
    if (!interaction.reconnection) return false;
    const decision = semanticEvents.onActionRequest?.({
      type: 'start-reconnect',
      edgeId: edge.id,
      side,
    });
    if (decision && decision.status !== 'ignored') return false;
    const fixedNodeId = side === 'source' ? edge.targetNodeId : edge.sourceNodeId;
    const fixedPortId = side === 'source' ? edge.targetPortId : edge.sourcePortId;
    const fixedNode = graph.getNode(fixedNodeId);
    const fixedEndpoint = fixedNode && resolveConnectionEndpoint(fixedNode, fixedPortId);
    if (!fixedEndpoint) return false;
    semanticEvents.onEdgeInteraction?.(edge.id, 'reconnect');
    semanticEvents.onConnectionStart?.(fixedEndpoint);
    connectionController.startReconnect(edge.id, side, fixedEndpoint, pointer);
    refreshConnectionMarker();
    setCanvasCursor('crosshair');
    invalidate();
    return true;
  }

  function updateConnectionGesture(point: Point) {
    const gesture = connectionController.getActive();
    if (!gesture) return;
    const hit = findConnectablePortAtPoint(gesture.source, point);
    connectionController.update(point, hit?.endpoint ?? null, camera.getState().zoom);
    setCanvasCursor('crosshair');
    refreshConnectionMarker();
    invalidate();
  }

  function cancelConnection() {
    const hadActiveGesture = connectionController.cancel();
    if (!hadActiveGesture) return;
    connectionMarker.clear();
    setCanvasCursor('');
    if (hadActiveGesture) semanticEvents.onConnectionFinish?.({ status: 'cancelled' });
    invalidate();
  }

  function finishConnection(event: FederatedPointerEvent, outside = false) {
    const gesture = connectionController.getActive();
    if (!gesture) return;
    const isOutside =
      outside ||
      event.global.x < 0 ||
      event.global.y < 0 ||
      event.global.x > app.screen.width ||
      event.global.y > app.screen.height;
    const point = world.toLocal(event.global);
    const hit = isOutside ? null : findConnectablePortAtPoint(gesture.source, point);
    const result = connectionController.finish(
      hit?.endpoint ?? null,
      interaction.clickToConnect,
      isOutside,
    );
    host.title = '';
    if (
      result.status === 'connected' ||
      result.status === 'reconnected' ||
      result.status === 'unchanged'
    ) {
      setSelection({ type: 'edge', id: result.edgeId });
      semanticEvents.onConnectionFinish?.({
        status: result.status === 'connected' ? 'connected' : 'reconnected',
        edgeId: result.edgeId,
      });
    } else if (result.status === 'invalid' || result.status === 'cancelled') {
      semanticEvents.onConnectionFinish?.({ status: result.status, reason: result.reason });
    }
    refreshConnectionMarker();
    setCanvasCursor(connectionController.getPendingClick() ? 'crosshair' : '');
    invalidate();
  }

  function selectEdgeAtPointer(event: FederatedPointerEvent) {
    if (!interaction.selection) return false;
    const startedAt = performance.now();
    const point = world.toLocal(event.global);
    const bestId = pickClosestEdge(
      edgeSpatial,
      point,
      getEdgeHitRadius,
      (id) => (projectedRenderPlan.getEdge(id)?.edge as FlowEdge | undefined) ?? graph.getEdge(id),
      (edge) => projectedRenderPlan.getEdge(edge.id)?.curve ?? getEdgeCurve(edge),
      (id) => projectedRenderPlan.getEdge(id)?.order ?? edgeOrder.get(id) ?? -1,
      MAX_EDGE_HIT_RADIUS,
    );
    if (bestId) {
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: { type: 'edge', edgeId: bestId, altKey: event.altKey },
      });
      if (decision && decision.status !== 'ignored') {
        recordDuration(pickingDurations, performance.now() - startedAt);
        return true;
      }
      setSelection({ type: 'edge', id: bestId });
      semanticEvents.onEdgeClick?.(bestId, graphToScreen(point));
    }
    recordDuration(pickingDurations, performance.now() - startedAt);
    return bestId !== null;
  }

  function selectInternalGroupEdgeAtPointer(event: FederatedPointerEvent, groupId: string) {
    const startedAt = performance.now();
    const point = world.toLocal(event.global);
    const bestId = pickClosestEdge(
      edgeSpatial,
      point,
      getEdgeHitRadius,
      (id) => {
        const edge =
          (projectedRenderPlan.getEdge(id)?.edge as FlowEdge | undefined) ?? graph.getEdge(id);
        return edge &&
          graph.getGroupIdForNode(edge.sourceNodeId) === groupId &&
          graph.getGroupIdForNode(edge.targetNodeId) === groupId
          ? edge
          : undefined;
      },
      (edge) => projectedRenderPlan.getEdge(edge.id)?.curve ?? getEdgeCurve(edge),
      (id) => projectedRenderPlan.getEdge(id)?.order ?? edgeOrder.get(id) ?? -1,
      MAX_EDGE_HIT_RADIUS,
    );
    if (bestId) {
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: { type: 'edge', edgeId: bestId, altKey: event.altKey },
      });
      if (decision && decision.status !== 'ignored') {
        recordDuration(pickingDurations, performance.now() - startedAt);
        return true;
      }
      setSelection({ type: 'edge', id: bestId });
      semanticEvents.onEdgeClick?.(bestId, graphToScreen(point));
    }
    recordDuration(pickingDurations, performance.now() - startedAt);
    return bestId !== null;
  }

  function nearestEditableOrthogonalSegment(edge: FlowEdge, point: Point) {
    const anchors = getEdgeRouteAnchors(edge);
    if (!anchors) return null;
    const turns = normalizeOrthogonalTurns(
      edgeRoutePreviews.get(edge.id)?.orthogonalTurns ?? edge.orthogonalTurns,
      anchors,
    );
    const segments = buildOrthogonalSegments(buildOrthogonalPathPoints(anchors, turns));
    let best: ReturnType<typeof buildOrthogonalSegments>[number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const segment of segments) {
      if (!segment.editable) continue;
      const distance = distanceSquaredToSegment(point, segment.start, segment.end);
      const hitRadius =
        segment.start.x === segment.end.x && segment.start.y === segment.end.y ? 9 : 7;
      if (distance <= hitRadius * hitRadius && distance < bestDistance) {
        best = segment;
        bestDistance = distance;
      }
    }
    if (!best) return null;
    return {
      segment: best,
      point: projectPointOntoSegment(point, best.start, best.end),
    };
  }

  function beginEdgeRouteDrag(
    edge: FlowEdge,
    key: 'controlPoints' | 'orthogonalTurns',
    pointId: string | undefined,
    segmentIndex: number | undefined,
  ) {
    const anchors = key === 'orthogonalTurns' ? getEdgeRouteAnchors(edge) : null;
    const sourcePoints =
      key === 'controlPoints'
        ? (edge.controlPoints ?? [])
        : anchors
          ? normalizeOrthogonalTurns(edge.orthogonalTurns, anchors)
          : [];
    if (pointId && !sourcePoints.some((point) => point.id === pointId)) return false;
    if (segmentIndex !== undefined && !anchors) return false;
    activeEdgeRouteDrag = {
      edgeId: edge.id,
      key,
      ...(pointId === undefined ? {} : { pointId }),
      ...(segmentIndex === undefined ? {} : { segmentIndex }),
      basePoints: sourcePoints.map((point) => ({ ...point })),
      points: sourcePoints.map((point) => ({ ...point })),
      didMove: false,
    };
    return true;
  }

  function updateEdgeRouteDrag(event: FederatedPointerEvent) {
    const startedAt = performance.now();
    const drag = activeEdgeRouteDrag;
    if (!drag) return;
    const edge = graph.getEdge(drag.edgeId);
    if (!edge) return;
    const pointer = world.toLocal(event.global);
    let nextPoints: FlowEdge['controlPoints'] | null = null;
    if (drag.pointId) {
      const snapped = snapEdgePoint(pointer);
      nextPoints = drag.basePoints.map((point) =>
        point.id === drag.pointId ? { ...point, x: snapped.x, y: snapped.y } : point,
      );
    } else if (drag.segmentIndex !== undefined) {
      const anchors = getEdgeRouteAnchors(edge);
      if (!anchors) return;
      nextPoints = moveOrthogonalSegment(drag.basePoints, drag.segmentIndex, pointer, anchors);
    }
    if (!nextPoints || nextPoints.length !== drag.points.length) return;
    if (
      nextPoints.every((point, index) => {
        const previous = drag.points[index];
        return point.id === previous.id && point.x === previous.x && point.y === previous.y;
      })
    )
      return;

    drag.points = nextPoints;
    drag.didMove = true;
    edgeRoutePreviews.set(edge.id, {
      ...(drag.key === 'controlPoints'
        ? { controlPoints: nextPoints }
        : { orthogonalTurns: nextPoints }),
    });
    if (drag.segmentIndex !== undefined) {
      const anchors = getEdgeRouteAnchors(edge);
      if (anchors) {
        const path = buildOrthogonalPathPoints(anchors, nextPoints);
        const segment = buildOrthogonalSegments(path).find(
          (item) => item.index === drag.segmentIndex,
        );
        if (segment) {
          hoveredOrthogonalSegment = segment.index;
          hoveredOrthogonalHandle = projectPointOntoSegment(pointer, segment.start, segment.end);
        }
      }
    }
    refreshEditedEdge(edge.id);
    recordDuration(dragDurations, performance.now() - startedAt);
    notifyProjectedSceneChanged();
  }

  function finishEdgeRouteDrag() {
    const drag = activeEdgeRouteDrag;
    if (!drag) return;
    activeEdgeRouteDrag = null;
    const edge = graph.getEdge(drag.edgeId);
    edgeRoutePreviews.delete(drag.edgeId);
    if (drag.didMove && edge && semanticEvents.onActionRequest) {
      semanticEvents.onActionRequest({
        type: 'set-edge-route',
        edgeId: drag.edgeId,
        key: drag.key,
        points: drag.points.map(({ x, y }) => ({ x, y })),
      });
    } else if (drag.didMove && edge) {
      graph.setEdgeRoutePoints(drag.edgeId, drag.key, drag.points);
    }
    refreshEditedEdge(drag.edgeId);
    invalidate();
  }

  function updateEdgeEditorHover(point: Point | null) {
    if (activeEdgeRouteDrag) return false;
    const previousIndex = hoveredOrthogonalSegment;
    const previousPoint = hoveredOrthogonalHandle;
    hoveredOrthogonalSegment = null;
    hoveredOrthogonalHandle = null;
    if (point && selection?.type === 'edge') {
      const edge = graph.getEdge(selection.id);
      if (edge && edge.settings.routingStyle === 'orthogonal') {
        const nearest = nearestEditableOrthogonalSegment(edge, point);
        if (nearest) {
          hoveredOrthogonalSegment = nearest.segment.index;
          hoveredOrthogonalHandle = nearest.point;
        }
      }
    }
    const changed =
      previousIndex !== hoveredOrthogonalSegment ||
      previousPoint?.x !== hoveredOrthogonalHandle?.x ||
      previousPoint?.y !== hoveredOrthogonalHandle?.y;
    if (changed) invalidate();
    return hoveredOrthogonalSegment !== null;
  }

  function beginEdgeEditorPointer(point: Point, event: FederatedPointerEvent) {
    if (
      (!interaction.graphEditing && !interaction.reconnection && !interaction.routeEditing) ||
      event.button !== 0 ||
      selection?.type !== 'edge'
    )
      return false;
    const edge = graph.getEdge(selection.id);
    if (!edge) return false;
    const anchors = getEdgeRouteAnchors(edge);
    if (anchors) {
      const radius = 12 / camera.getState().zoom;
      if (
        interaction.reconnection &&
        Math.hypot(point.x - anchors.sourceX, point.y - anchors.sourceY) <= radius
      ) {
        return startEdgeReconnect(edge, 'source', point);
      }
      if (
        interaction.reconnection &&
        Math.hypot(point.x - anchors.targetX, point.y - anchors.targetY) <= radius
      ) {
        return startEdgeReconnect(edge, 'target', point);
      }
    }
    if (findNodeAtPoint(point)) return false;
    if (!interaction.graphEditing && !interaction.routeEditing) return false;
    if (edge.settings.routingStyle === 'orthogonal') {
      const nearest = nearestEditableOrthogonalSegment(edge, point);
      if (!nearest) return false;
      return beginEdgeRouteDrag(edge, 'orthogonalTurns', undefined, nearest.segment.index);
    }
    const nearest = pickClosestRoutePoint(edge.controlPoints ?? [], point, 6);
    return nearest ? beginEdgeRouteDrag(edge, 'controlPoints', nearest.id, undefined) : false;
  }

  function deleteAtPoint(point: Point, altKey: boolean) {
    const deleteMode = semanticEvents.isDeleteMode?.() ?? false;
    if (!shouldResolveDeleteAtPoint(interaction.graphEditing, altKey, deleteMode)) {
      return false;
    }
    const selectedEdge = selection?.type === 'edge' ? graph.getEdge(selection.id) : undefined;
    const target = pickDeletableTarget(
      point,
      selectedEdge,
      selectedEdge?.settings.routingStyle ?? graph.getRoutingStyle(),
      nodeSpatial,
      edgeSpatial,
      (id) => canvasOrder.get(id, 'node'),
      graph.getEdge,
      getEdgeCurve,
      (id) => edgeOrder.get(id) ?? -1,
    );
    if (!target || !shouldHandleDeleteTargetBeforeCanvasAction(target, altKey, deleteMode)) {
      if (target) return false;
      const group = groupAtPoint(point);
      if (!group) return false;
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: { type: 'group', groupId: group.group.id, altKey },
      });
      if (decision && decision.status !== 'ignored') return true;
      if (!interaction.graphEditing || !altKey) return false;
      removeNodeOrGroup(graph, group.group.id);
      setSelection(null);
      invalidate();
      return true;
    }
    if (target.type === 'control-point' || target.type === 'turn-point') {
      const edge = graph.getEdge(target.edgeId);
      if (!edge) return false;
      const key = target.type === 'control-point' ? 'controlPoints' : 'orthogonalTurns';
      let routePoints: readonly EdgeControlPoint[];
      if (target.type === 'control-point') {
        routePoints = (edge.controlPoints ?? []).filter((item) => item.id !== target.pointId);
      } else {
        const anchors = getEdgeRouteAnchors(edge);
        if (!anchors) return false;
        const turns = deleteOrthogonalTurnPair(edge.orthogonalTurns, target.pointId, anchors);
        if (!turns) return false;
        routePoints = turns;
      }
      const decision = semanticEvents.onActionRequest?.({
        type: 'delete-edge-route-point',
        edgeId: edge.id,
        key,
        pointId: target.pointId,
        points: routePoints.map(({ x, y }) => ({ x, y })),
        altKey,
      });
      if (decision && decision.status !== 'ignored') return true;
      if (!interaction.graphEditing || !altKey) return false;
      graph.setEdgeRoutePoints(edge.id, key, routePoints);
    } else if (target.type === 'node') {
      const group = graph.getGroup(target.id);
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: group
          ? { type: 'group', groupId: group.id, altKey }
          : { type: 'node', nodeId: target.id, phase: 'down', altKey },
      });
      if (decision && decision.status !== 'ignored') return true;
      if (!interaction.graphEditing || !altKey) return false;
      removeNodeOrGroup(graph, target.id);
      setSelection(null);
    } else if (target.type === 'edge') {
      const decision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: { type: 'edge', edgeId: target.id, altKey },
      });
      if (decision && decision.status !== 'ignored') return true;
      if (!interaction.graphEditing || !altKey) return false;
      graph.removeEdge(target.id);
      setSelection(null);
    }
    invalidate();
    return true;
  }

  function beginNodeDrag(nodeId: string, event: FederatedPointerEvent) {
    const node = getDisplayNode(nodeId);
    if (!node) return;
    if (!interaction.nodeDragging) {
      if (interaction.selection)
        setSelection({ type: graph.getGroup(nodeId) ? 'group' : 'node', id: nodeId });
      event.stopPropagation();
      return;
    }
    const group = graph.getGroup(nodeId);
    if (group?.collapsed) {
      if (interaction.selection) setSelection({ type: 'group', id: nodeId });
      semanticEvents.onGroupInteraction?.(nodeId, 'drag');
      const firstMember = group.memberNodeIds.find((id) => graph.getNode(id));
      if (firstMember) nodeDrag.start(firstMember, event, group.memberNodeIds, group.id);
      updateAutoPan(event.global);
      event.stopPropagation();
      return;
    }
    if (interaction.selection && interaction.multiSelection && (event.ctrlKey || event.metaKey)) {
      toggleNodeSelection(nodeId);
      event.stopPropagation();
      return;
    }
    if (interaction.selection && !selectedNodeIds.has(nodeId))
      setSelection({ type: 'node', id: nodeId });
    else if (primarySelectedNodeId !== nodeId) {
      if (interaction.selection)
        setNodeSelection([...selectedNodeIds], nodeId, { type: 'node', id: nodeId });
    }
    nodeDrag.start(nodeId, event, selectedNodeIds.has(nodeId) ? [...selectedNodeIds] : [nodeId]);
    updateAutoPan(event.global);
    event.stopPropagation();
  }

  function cssDistance(from: Point, to: Point) {
    const rect = app.canvas.getBoundingClientRect();
    if (rect.width <= 0 || app.screen.width <= 0) return Number.POSITIVE_INFINITY;
    const scale = rect.width / app.screen.width;
    return Math.hypot((to.x - from.x) * scale, (to.y - from.y) * scale);
  }

  function startPendingGroupDrag(event: FederatedPointerEvent) {
    const pending = pendingGroupHeaderGesture;
    if (!interaction.nodeDragging) {
      pendingGroupHeaderGesture = null;
      return false;
    }
    if (
      !pending ||
      cssDistance(pending.startGlobal, event.global) < GROUP_HEADER_DRAG_THRESHOLD_CSS_PX
    )
      return false;
    pendingGroupHeaderGesture = null;
    const firstMember = pending.memberIds.find((id) => graph.getNode(id));
    if (!firstMember) return true;
    semanticEvents.onGroupInteraction?.(pending.groupId, 'drag');
    nodeDrag.startAt(firstMember, pending.startWorld, pending.memberIds, pending.groupId);
    nodeDrag.move(event);
    updateAutoPan(event.global);
    return true;
  }

  function beginGroupHeaderGesture(
    group: FlowGroup,
    bounds: GroupBounds,
    point: Point,
    event: FederatedPointerEvent,
  ) {
    const decision = semanticEvents.onActionRequest?.({
      type: 'activate-canvas-target',
      target: { type: 'group', groupId: group.id, altKey: event.altKey },
    });
    if (decision && decision.status !== 'ignored') {
      event.stopPropagation();
      return;
    }
    if (interaction.selection) setSelection({ type: 'group', id: group.id });
    if (interaction.nodeDragging && !isExpandedGroupMenuAtPoint(bounds, point)) {
      pendingGroupHeaderGesture = {
        groupId: group.id,
        memberIds: group.memberNodeIds,
        startGlobal: { x: event.global.x, y: event.global.y },
        startWorld: { x: point.x, y: point.y },
      };
    }
    event.stopPropagation();
  }

  function deferCanvasTapActivation(event: FederatedPointerEvent, activate: () => void) {
    canvasTapActivation.begin(event.global, activate);
    event.stopPropagation();
  }

  function activateNodeControl(nodeId: string, controlId: string, action: string) {
    const decision = semanticEvents.onActionRequest?.({
      type: 'activate-control',
      entityId: nodeId,
      controlId,
      action,
    });
    if (decision && decision.status !== 'ignored') return;
    semanticEvents.onNodeControl?.(nodeId, controlId, action);
  }

  function handleBackgroundPointerDown(event: FederatedPointerEvent) {
    canvasTapActivation.cancel();
    const point = world.toLocal(event.global);
    if (event.button === 0) {
      if (deleteAtPoint(point, event.altKey)) {
        event.stopPropagation();
        return true;
      }
    }
    if (beginEdgeEditorPointer(point, event)) {
      setCanvasCursor('grabbing');
      event.stopPropagation();
      return true;
    }
    const selectedGroupControl =
      (interaction.graphEditing || interaction.groupActions) &&
      event.button === 0 &&
      selection?.type === 'group'
        ? getProjectedGroupControl(point, selection.id)
        : null;
    if (selectedGroupControl) {
      if (selectedGroupControl.control.action === 'group-menu') {
        deferCanvasTapActivation(event, () => activateGroupControl(selectedGroupControl));
      } else {
        activateGroupControl(selectedGroupControl);
      }
      event.stopPropagation();
      return true;
    }
    const selectedHeaderOverlay =
      (interaction.graphEditing || interaction.groupActions) && event.button === 0
        ? selectedGroupHeaderOverlayAtPoint(point)
        : null;
    if (selectedHeaderOverlay) {
      const control = getProjectedGroupControl(point, selectedHeaderOverlay.group.id);
      if (control?.control.action === 'group-menu') {
        deferCanvasTapActivation(event, () => activateGroupControl(control));
      } else if (control) activateGroupControl(control);
      else
        beginGroupHeaderGesture(
          selectedHeaderOverlay.group,
          selectedHeaderOverlay.bounds,
          point,
          event,
        );
      return true;
    }
    const nodeId = findNodeAtPoint(point);
    const groupHeader = event.button === 0 ? groupHeaderAtPoint(point) : null;
    if (nodeId) {
      const node = getDisplayNode(nodeId);
      const control = node ? getNodeControlAtPoint(node, point, event.pointerType) : null;
      if (control) {
        if (!interaction.graphEditing) {
          if (control.type === 'expand-group' && interaction.groupActions) {
            const decision = semanticEvents.onActionRequest?.({
              type: 'set-group-collapsed',
              groupId: nodeId,
              collapsed: false,
            });
            if (!decision || decision.status === 'ignored') graph.setGroupCollapsed(nodeId, false);
            if (interaction.selection) setSelection({ type: 'group', id: nodeId });
            event.stopPropagation();
            return true;
          }
          if (control.type === 'port' && node && event.button === 0 && interaction.connection) {
            const endpoint = resolveConnectionEndpoint(node, control.portId);
            const modeDecision = endpoint
              ? semanticEvents.onActionRequest?.({
                  type: 'activate-canvas-target',
                  target: {
                    type: 'port',
                    nodeId: endpoint.nodeId,
                    portId: endpoint.portId,
                    phase: 'handle',
                    altKey: event.altKey,
                  },
                })
              : undefined;
            if (modeDecision && modeDecision.status !== 'ignored') {
              event.stopPropagation();
              return true;
            }
            startConnection(node, control.portId, point);
          } else if (control.type === 'io' && node && event.button === 0) {
            const endpoint = resolveConnectionEndpoint(node, control.portId);
            if (endpoint)
              deferCanvasTapActivation(event, () =>
                semanticEvents.onPortActivate?.(endpoint.nodeId, endpoint.portId),
              );
          } else if (
            control.type === 'button' &&
            control.controlId &&
            control.action &&
            node &&
            event.button === 0
          ) {
            const controlId = control.controlId;
            const action = control.action;
            if (action === 'node-menu') {
              deferCanvasTapActivation(event, () =>
                activateNodeControl(node.id, controlId, action),
              );
            } else {
              activateNodeControl(node.id, controlId, action);
            }
          }
          if (interaction.selection) {
            setSelection({ type: graph.getGroup(nodeId) ? 'group' : 'node', id: nodeId });
          }
          event.stopPropagation();
          return true;
        }
        if (control.type === 'port' && node && event.button === 0 && interaction.connection)
          startConnection(node, control.portId, point);
        if (control.type === 'io' && node && event.button === 0)
          deferCanvasTapActivation(event, () =>
            semanticEvents.onPortActivate?.(node.id, control.portId),
          );
        if (control.type === 'expand-group' && graph.getGroup(nodeId)?.collapsed) {
          const decision = semanticEvents.onActionRequest?.({
            type: 'set-group-collapsed',
            groupId: nodeId,
            collapsed: false,
          });
          if (!decision || decision.status === 'ignored') graph.setGroupCollapsed(nodeId, false);
          if (interaction.selection) setSelection({ type: 'group', id: nodeId });
        }
        if (control.type === 'button' && control.controlId && control.action && node) {
          const controlId = control.controlId;
          const action = control.action;
          if (action === 'node-menu') {
            deferCanvasTapActivation(event, () => activateNodeControl(node.id, controlId, action));
          } else {
            activateNodeControl(node.id, controlId, action);
          }
        }
        if (control.type !== 'port') setCanvasCursor('pointer');
        event.stopPropagation();
        return true;
      }
      const nodeGroup = graph.getGroup(nodeId);
      const isGroup = nodeGroup?.id === nodeId;
      const modeDecision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: isGroup
          ? { type: 'group', groupId: nodeId, altKey: event.altKey }
          : { type: 'node', nodeId, phase: 'down', altKey: event.altKey },
      });
      if (modeDecision && modeDecision.status !== 'ignored') {
        event.stopPropagation();
        return true;
      }
      beginNodeDrag(nodeId, event);
      return true;
    }
    if (groupHeader) {
      const control = getProjectedGroupControl(point, groupHeader.group.id);
      if (control?.control.action === 'group-menu') {
        deferCanvasTapActivation(event, () => activateGroupControl(control));
        event.stopPropagation();
        return true;
      }
      if (control) {
        activateGroupControl(control);
        event.stopPropagation();
        return true;
      }
      beginGroupHeaderGesture(groupHeader.group, groupHeader.bounds, point, event);
      return true;
    }
    if (selectEdgeAtPointer(event)) {
      event.stopPropagation();
      return true;
    }
    const groupHit = groupAtPoint(point);
    if (groupHit && event.button === 0) {
      const modeDecision = semanticEvents.onActionRequest?.({
        type: 'activate-canvas-target',
        target: { type: 'group', groupId: groupHit.group.id, altKey: event.altKey },
      });
      if (modeDecision && modeDecision.status !== 'ignored') {
        event.stopPropagation();
        return true;
      }
      const control = getProjectedGroupControl(point, groupHit.group.id);
      if (control && (interaction.graphEditing || interaction.groupActions)) {
        activateGroupControl(control);
        event.stopPropagation();
        return true;
      }
      if (selectInternalGroupEdgeAtPointer(event, groupHit.group.id)) {
        event.stopPropagation();
        return true;
      }
      if (interaction.selection) setSelection({ type: 'group', id: groupHit.group.id });
      if (!interaction.nodeDragging) {
        event.stopPropagation();
        return true;
      }
      const firstMember = groupHit.group.memberNodeIds.find((id) => graph.getNode(id));
      if (firstMember)
        nodeDrag.start(firstMember, event, groupHit.group.memberNodeIds, groupHit.group.id);
      event.stopPropagation();
      return true;
    }
    if (interaction.selection && interaction.boxSelection && event.button === 0 && event.shiftKey) {
      selectionController.begin(point, event.altKey ? 'partial' : 'full');
      setSelection(null);
      drawSelectionBox();
      updateAutoPan(event.global);
      event.stopPropagation();
      invalidate();
      return true;
    }
    if (connectionController.getPendingClick()) cancelConnection();
    if (interaction.selection) setSelection(null);
    return false;
  }

  function screenPointFromClient(clientX: number, clientY: number): Point | null {
    const bounds = app.canvas.getBoundingClientRect();
    return clientPointToCanvas(clientX, clientY, bounds, app.screen.width, app.screen.height);
  }

  function handleCanvasClick(event: MouseEvent) {
    if (event.button !== 0) return;
    const point = screenPointFromClient(event.clientX, event.clientY);
    const bounds = app.canvas.getBoundingClientRect();
    if (!point || app.screen.width <= 0 || app.screen.height <= 0) {
      canvasTapActivation.cancel();
      return;
    }
    const activate = canvasTapActivation.activate(
      point,
      bounds.width / app.screen.width,
      bounds.height / app.screen.height,
    );
    if (!activate) return;

    event.stopPropagation();
    if (canvasTapActivationTimer !== null) window.clearTimeout(canvasTapActivationTimer);
    canvasTapActivationTimer = window.setTimeout(() => {
      canvasTapActivationTimer = null;
      activate();
    }, 0);
  }

  function clearPendingCanvasTap() {
    canvasTapActivation.cancel();
  }

  function handleCanvasDoubleClick(event: MouseEvent) {
    if (event.button === 0) {
      const screenPoint = screenPointFromClient(event.clientX, event.clientY);
      const point = screenPoint ? world.toLocal(screenPoint) : null;
      const nodeId = point ? findNodeAtPoint(point) : null;
      const node = nodeId ? getDisplayNode(nodeId) : null;
      const control = node && point ? getNodeControlAtPoint(node, point) : null;
      if (node && control?.type === 'port') {
        const endpoint = resolveConnectionEndpoint(node, control.portId);
        if (endpoint) {
          cancelConnection();
          const decision = semanticEvents.onActionRequest?.({
            type: 'activate-canvas-target',
            target: {
              type: 'port',
              nodeId: endpoint.nodeId,
              portId: endpoint.portId,
              phase: 'double',
            },
          });
          if (decision && decision.status !== 'ignored') {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          semanticEvents.onPortDoubleActivate?.(endpoint.nodeId, endpoint.portId);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (
      (!interaction.graphEditing && !interaction.routeEditing) ||
      event.button !== 0 ||
      selection?.type !== 'edge'
    )
      return;
    const screenPoint = screenPointFromClient(event.clientX, event.clientY);
    if (!screenPoint) return;
    const point = world.toLocal(screenPoint);
    const edge = graph.getEdge(selection.id);
    if (!edge || findNodeAtPoint(point)) return;
    const anchors = getEdgeRouteAnchors(edge);
    if (!anchors) return;
    const routingStyle = edge.settings.routingStyle;
    const edgeControlPoints =
      routingStyle === 'orthogonal'
        ? normalizeOrthogonalTurns(edge.orthogonalTurns, anchors)
        : (edge.controlPoints ?? []);
    if (pickClosestRoutePoint(edgeControlPoints, point, 6)) return;
    const bestEdge = pickClosestEdge(
      edgeSpatial,
      point,
      getEdgeHitRadius,
      (id) => (projectedRenderPlan.getEdge(id)?.edge as FlowEdge | undefined) ?? graph.getEdge(id),
      (edge) => projectedRenderPlan.getEdge(edge.id)?.curve ?? getEdgeCurve(edge),
      (id) => projectedRenderPlan.getEdge(id)?.order ?? edgeOrder.get(id) ?? -1,
      MAX_EDGE_HIT_RADIUS,
    );
    if (bestEdge !== edge.id) return;
    const snapped = snapEdgePoint(point);
    const bezierCurve = routingStyle === 'bezier' ? getEdgeCurve(edge) : null;
    if (routingStyle === 'orthogonal') {
      const turns = insertOrthogonalTurnPair(
        edge.orthogonalTurns,
        point,
        anchors,
        graph.createEdgePoint,
      );
      if (semanticEvents.onActionRequest) {
        semanticEvents.onActionRequest({
          type: 'set-edge-route',
          edgeId: edge.id,
          key: 'orthogonalTurns',
          points: turns.map(({ x, y }) => ({ x, y })),
        });
      } else graph.setEdgeRoutePoints(edge.id, 'orthogonalTurns', turns);
    } else {
      const points = insertControlPoint(
        edge.controlPoints ?? [],
        { x: anchors.sourceX, y: anchors.sourceY },
        { x: anchors.targetX, y: anchors.targetY },
        snapped,
        routingStyle,
        graph.createEdgePoint,
        {
          source: getEdgeEndpointTangent(edge, true),
          target: getEdgeEndpointTangent(edge, false),
        },
        bezierCurve ? getEdgeCurvePoints(bezierCurve) : undefined,
      );
      if (semanticEvents.onActionRequest) {
        semanticEvents.onActionRequest({
          type: 'set-edge-route',
          edgeId: edge.id,
          key: 'controlPoints',
          points: points.map(({ x, y }) => ({ x, y })),
        });
      } else graph.setEdgeRoutePoints(edge.id, 'controlPoints', points);
    }
    event.preventDefault();
  }

  function applyNodePreviews(previews: ReadonlyMap<string, Position | null>) {
    const startedAt = performance.now();
    meshRenderer.batchUpdates(() => {
      const affectedGroups = new Set<string>();
      const oldCollapsedGroupBounds = new Map<string, Bounds>();
      const changedBounds: Bounds[] = [];
      const affectedEdges = new Set<string>();
      const changedDisplayIds = new Set<string>();
      let stageStartedAt = performance.now();
      for (const [id, position] of previews) {
        const node = graph.getNode(id);
        const oldPosition = node ? (previewPositions.get(id) ?? node) : null;
        if (position) previewPositions.set(id, position);
        else previewPositions.delete(id);
        const groupId = graph.getGroupIdForNode(id);
        if (groupId) {
          affectedGroups.add(groupId);
          const collapsedProxy = visibleGraph.getProxyNode(groupId);
          if (collapsedProxy && !oldCollapsedGroupBounds.has(groupId)) {
            oldCollapsedGroupBounds.set(
              groupId,
              nodeBounds(collapsedProxy, getDisplayPosition(groupId, collapsedProxy)),
            );
          }
        }
        if (node) {
          const previous = nodeViews.get(id);
          const displayNode = getDisplayNode(id);
          if (displayNode) {
            const nextPosition = getDisplayPosition(id, displayNode);
            nodeSpatial.update(id, nodeBounds(displayNode, nextPosition), id);
            if (previous) previous.container.position.set(nextPosition.x, nextPosition.y);
            meshRenderer.updateNode(
              displayNode,
              nextPosition,
              getNodeVisual(displayNode),
              getNodePortPositions(displayNode),
            );
            changedDisplayIds.add(id);
            if (oldPosition) changedBounds.push(nodeBounds(displayNode, oldPosition));
            changedBounds.push(nodeBounds(displayNode, nextPosition));
          }
          for (const edge of graph.getIncidentEdges(id)) affectedEdges.add(edge.id);
        }
      }
      recordDuration(dragIndexDurations, performance.now() - stageStartedAt);

      stageStartedAt = performance.now();
      for (const groupId of affectedGroups) {
        const oldProxyBounds = oldCollapsedGroupBounds.get(groupId) ?? null;
        const edgeIds = refreshGroupProjection(groupId);
        for (const id of edgeIds) affectedEdges.add(id);
        const collapsedProxy = visibleGraph.getProxyNode(groupId);
        const nextProxyBounds = collapsedProxy
          ? nodeBounds(collapsedProxy, getDisplayPosition(groupId, collapsedProxy))
          : null;
        changedBounds.push(...getOcclusionTransitionBounds(oldProxyBounds, nextProxyBounds));
        if (collapsedProxy) {
          changedDisplayIds.add(groupId);
        }
      }
      for (const id of changedDisplayIds) {
        const displayNode = getDisplayNode(id);
        if (!displayNode) continue;
        const position = getDisplayPosition(id, displayNode);
        nodeSpatial.update(id, nodeBounds(displayNode, position), id);
        const view = nodeViews.get(id);
        if (view) view.container.position.set(position.x, position.y);
        meshRenderer.updateNode(
          displayNode,
          position,
          getNodeVisual(displayNode),
          getNodePortPositions(displayNode),
        );
      }
      recordDuration(dragNodeMeshDurations, performance.now() - stageStartedAt);

      stageStartedAt = performance.now();
      for (const id of affectedEdges) {
        const edge = graph.getEdge(id);
        if (!edge) {
          nodeMoveRoutePreviews.delete(id);
          continue;
        }
        const source = graph.getNode(edge.sourceNodeId);
        const target = graph.getNode(edge.targetNodeId);
        if (!source || !target) {
          nodeMoveRoutePreviews.delete(id);
          continue;
        }
        const sourcePosition = previewPositions.get(source.id) ?? source;
        const targetPosition = previewPositions.get(target.id) ?? target;
        const sourceDx = sourcePosition.x - source.x;
        const sourceDy = sourcePosition.y - source.y;
        const targetDx = targetPosition.x - target.x;
        const targetDy = targetPosition.y - target.y;
        if (
          (previewPositions.has(source.id) || previewPositions.has(target.id)) &&
          sourceDx === targetDx &&
          sourceDy === targetDy &&
          (sourceDx !== 0 || sourceDy !== 0)
        ) {
          const controlPoints = edge.controlPoints?.map((point) => ({
            ...point,
            x: point.x + sourceDx,
            y: point.y + sourceDy,
          }));
          const orthogonalTurns = edge.orthogonalTurns?.map((point) => ({
            ...point,
            x: point.x + sourceDx,
            y: point.y + sourceDy,
          }));
          if (controlPoints?.length || orthogonalTurns?.length) {
            nodeMoveRoutePreviews.set(id, {
              ...(controlPoints ? { controlPoints } : {}),
              ...(orthogonalTurns ? { orthogonalTurns } : {}),
            });
          } else nodeMoveRoutePreviews.delete(id);
        } else nodeMoveRoutePreviews.delete(id);
      }
      const edgeUpdates: { readonly edge: FlowEdge; readonly curve: EdgeCurve | null }[] = [];
      for (const id of affectedEdges) {
        const edge = graph.getEdge(id);
        if (!edge) continue;
        edgeUpdates.push({ edge: getRenderableEdge(edge), curve: updateEdgeBounds(edge) });
      }
      meshRenderer.updateEdges(edgeUpdates);
      recordDuration(dragEdgeDurations, performance.now() - stageStartedAt);

      stageStartedAt = performance.now();
      const useDirtyPreviewSync =
        nodeSpatial.size + edgeSpatial.size > DIRTY_PREVIEW_ENTITY_THRESHOLD;
      if (
        !useDirtyPreviewSync ||
        !syncVisibleViewsForPreview(changedDisplayIds, affectedGroups, affectedEdges)
      ) {
        lastCameraBounds = null;
        lastOverscanBounds = null;
        syncVisibleViews();
      }
      recordDuration(dragVisibilityDurations, performance.now() - stageStartedAt);

      stageStartedAt = performance.now();
      if (changedBounds.length > 0) {
        let union = changedBounds[0];
        for (const bounds of changedBounds.slice(1)) union = unionBounds(union, bounds);
        refreshNodeTextOverlaps(union);
      }
      recordDuration(dragTextDurations, performance.now() - stageStartedAt);
      if (connectionController.isActive()) refreshConnectionMarker();
      invalidate();
    });
    recordDuration(dragDurations, performance.now() - startedAt);
  }

  const nodeDrag = createNodeDragInteraction(
    graph,
    world,
    app.canvas,
    (id, position) => {
      if (position === null) {
        pendingNodePreviews.set(id, null);
        invalidate();
        return;
      }
      pendingNodePreviews.set(id, position);
      invalidate();
    },
    semanticEvents.onActionRequest
      ? (proposal) => semanticEvents.onActionRequest?.(proposal) ?? { status: 'cancelled' }
      : undefined,
    semanticEvents.onActionRequest
      ? (nodeId, groupId) => {
          semanticEvents.onActionRequest?.({
            type: 'activate-canvas-target',
            target: groupId ? { type: 'group', groupId } : { type: 'node', nodeId, phase: 'click' },
          });
        }
      : undefined,
  );

  function setSelection(next: Selection) {
    const nextNodeIds = next?.type === 'node' ? [next.id] : [];
    setNodeSelection(nextNodeIds, next?.type === 'node' ? next.id : null, next);
  }

  function setNodeSelection(
    nodeIds: readonly string[],
    primary: string | null,
    next: Selection = null,
  ) {
    const nextIds = new Set(nodeIds);
    const unchanged =
      selection?.type === next?.type &&
      selection?.id === next?.id &&
      primarySelectedNodeId === primary &&
      selectedNodeIds.size === nextIds.size &&
      [...nextIds].every((id) => selectedNodeIds.has(id));
    if (unchanged) return;
    const previousSelection = selection;
    const previousNodeIds = [...selectedNodeIds];
    selection = next;
    selectedNodeIds.clear();
    for (const id of nextIds) selectedNodeIds.add(id);
    primarySelectedNodeId = primary;
    semanticEvents.onSelectionChange?.(
      next === null
        ? null
        : {
            target: { ...next },
            nodeIds: [...nextIds],
            primaryNodeId: primary,
          },
    );
    if (next?.type === 'group') semanticEvents.onGroupInteraction?.(next.id, 'select');
    if (next?.type === 'edge') semanticEvents.onEdgeInteraction?.(next.id, 'select');
    announceSelection(next, nextIds);
    if (next?.type !== 'edge' || graph.getEdge(next.id)?.settings.routingStyle !== 'orthogonal') {
      hoveredOrthogonalSegment = null;
      hoveredOrthogonalHandle = null;
    }
    const nodesToRaise =
      next?.type === 'group'
        ? graph.getGroup(next.id)?.collapsed
          ? [next.id]
          : (graph.getGroup(next.id)?.memberNodeIds ?? [])
        : [...selectedNodeIds];
    const raisedOrders = new Map<string, number>();
    const raisedBounds: Bounds[] = [];
    if (next?.type === 'group' && canvasOrder.raise(next.id, 'group'))
      groupPresentation.markOrderDirty();
    for (const id of nodesToRaise) {
      if (!getDisplayNode(id)) continue;
      const order = canvasOrder.bringToFront(id, 'node');
      raisedOrders.set(id, order);
      const node = getDisplayNode(id);
      if (node) raisedBounds.push(nodeBounds(node, getDisplayPosition(id, node)));
    }
    meshRenderer.bringNodesToFront(raisedOrders);
    if (nodesToRaise.length > 0) nodeContentOrderDirty = true;
    meshRenderer.setNodeSelection(
      [...selectedNodeIds],
      primarySelectedNodeId,
      next?.type === 'edge' ? next.id : null,
    );
    for (const id of previousNodeIds) updateNodeText(id);
    refreshNodeTextOverlaps(raisedBounds, nodesToRaise);
    syncNodeContentOrder();
    if (previousSelection?.type === 'group' || next?.type === 'group')
      syncGroupViews(getCameraBounds());
    invalidate();
    if (shouldRebuildProjectedPlanForSelection(previousSelection, next)) {
      notifyProjectedSceneChanged();
    }
  }

  function announceSelection(next: Selection, nodeIds: ReadonlySet<string>) {
    if (next?.type === 'group') {
      const group = graph.getGroup(next.id);
      if (group)
        announce(
          `Selected group ${group.label}. ${group.collapsed ? 'Collapsed. Press Enter to expand.' : 'Expanded. Press Enter to collapse.'}`,
        );
      return;
    }
    if (next?.type === 'edge') {
      const edge = graph.getEdge(next.id);
      const source = edge && graph.getNode(edge.sourceNodeId);
      const target = edge && graph.getNode(edge.targetNodeId);
      announce(
        edge
          ? `Selected edge from ${source?.label ?? edge.sourceNodeId} to ${target?.label ?? edge.targetNodeId}.`
          : 'Selected edge.',
      );
      return;
    }
    const primaryNode = next?.type === 'node' ? graph.getNode(next.id) : null;
    if (primaryNode) {
      announce(
        nodeIds.size > 1
          ? `Selected ${primaryNode.label}. ${nodeIds.size} nodes selected.`
          : `Selected node ${primaryNode.label}.`,
      );
      return;
    }
    announce(nodeIds.size > 1 ? `${nodeIds.size} nodes selected.` : 'Selection cleared.');
  }

  function getNavigableItems(): NavigableGraphItem[] {
    const cameraBounds = getCameraBounds();
    const items: NavigableGraphItem[] = nodeSpatial.query(cameraBounds).flatMap((id) => {
      const node = getDisplayNode(id);
      if (!node) return [];
      const bounds = nodeBounds(node, getDisplayPosition(id, node));
      return [
        {
          id,
          type: graph.getGroup(id)?.collapsed ? ('group' as const) : ('node' as const),
          centerX: (bounds.minX + bounds.maxX) / 2,
          centerY: (bounds.minY + bounds.maxY) / 2,
          order: canvasOrder.get(id, 'node'),
          band: RENDER_BAND.nodeBody,
        },
      ];
    });
    for (const id of groupSpatial.query(cameraBounds)) {
      const group = graph.getGroup(id);
      const bounds = group && !group.collapsed ? groupBoundsCache.get(id) : undefined;
      if (!group || !bounds) continue;
      items.push({
        id,
        type: 'group',
        centerX: bounds.x + bounds.width / 2,
        centerY: bounds.y + bounds.height / 2,
        order: canvasOrder.get(id, 'group'),
        band: RENDER_BAND.groupChrome,
      });
    }
    return items;
  }

  function selectNavigableItem(item: NavigableGraphItem | null) {
    if (!item) return;
    if (item.type === 'group') setSelection({ type: 'group', id: item.id });
    else setSelection({ type: 'node', id: item.id });
  }

  function handleCanvasKeyDown(event: KeyboardEvent) {
    if (
      !interaction.keyboardNavigation ||
      event.target !== app.canvas ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const directionByKey: Record<string, NavigationDirection | undefined> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const direction = directionByKey[event.key];
    if (direction) {
      event.preventDefault();
      const currentId = selection?.id ?? primarySelectedNodeId;
      selectNavigableItem(getDirectionalNavigationItem(getNavigableItems(), currentId, direction));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const items = getNavigableItems();
      selectNavigableItem(
        event.key === 'Home' ? getFirstNavigableItem(items) : getLastNavigableItem(items),
      );
      return;
    }
    if (event.key === 'Enter' && selection?.type === 'group') {
      const group = graph.getGroup(selection.id);
      if (group) {
        event.preventDefault();
        graph.setGroupCollapsed(group.id, !group.collapsed);
      }
    }
  }

  function toggleNodeSelection(id: string) {
    const next = new Set(selectedNodeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const primary = next.has(id) ? id : ([...next].at(-1) ?? null);
    setNodeSelection([...next], primary, primary ? { type: 'node', id: primary } : null);
  }

  function handleGraphChange(change: GraphChange) {
    const graphUpdateStartedAt = performance.now();
    const selectionBeforeGraphChange = selection;
    const selectedNodesBeforeGraphChange = new Set(selectedNodeIds);
    const movedNodes: { readonly id: string; readonly x: number; readonly y: number }[] = [];
    for (const id of [...change.addedNodeIds, ...change.changedNodeIds]) {
      const node = graph.getNode(id);
      if (!node) continue;
      const previous = lastKnownNodePositions.get(id);
      if (previous && (previous.x !== node.x || previous.y !== node.y))
        movedNodes.push({ id, x: node.x, y: node.y });
      lastKnownNodePositions.set(id, { x: node.x, y: node.y });
    }
    for (const id of change.removedNodeIds) lastKnownNodePositions.delete(id);
    if (movedNodes.length > 0) semanticEvents.onNodeMove?.(movedNodes);
    for (const id of change.changedGroupIds) {
      const previous = groupByRenderId.get(id);
      const current = graph.getGroup(id);
      if (previous && current && previous.collapsed !== current.collapsed) {
        announce(`${current.label} ${current.collapsed ? 'collapsed' : 'expanded'}.`);
        semanticEvents.onGroupInteraction?.(id, current.collapsed ? 'collapse' : 'expand');
      }
    }
    const proxyProjectionIds = new Set<string>();
    const groupOcclusionRefreshBounds: Bounds[] = [];
    const groupOcclusionRefreshIds = new Set<string>();
    for (const id of change.removedEdgeIds) {
      for (const groupId of edgeGroupIdsByEdgeId.get(id) ?? []) {
        proxyTopologyDirtyGroupIds.add(groupId);
        proxyProjectionIds.add(groupId);
      }
      edgeGroupIdsByEdgeId.delete(id);
    }
    for (const id of change.addedEdgeIds) {
      const edge = graph.getEdge(id);
      if (!edge) continue;
      const groupIds = [
        ...new Set(
          [
            graph.getGroupIdForNode(edge.sourceNodeId),
            graph.getGroupIdForNode(edge.targetNodeId),
          ].filter((groupId): groupId is string => groupId !== undefined),
        ),
      ];
      edgeGroupIdsByEdgeId.set(id, groupIds);
      for (const groupId of groupIds) {
        proxyTopologyDirtyGroupIds.add(groupId);
        proxyProjectionIds.add(groupId);
      }
    }
    for (const id of [...change.addedGroupIds, ...change.changedGroupIds]) {
      proxyTopologyDirtyGroupIds.add(id);
      proxyProjectionIds.add(id);
      const group = graph.getGroup(id);
      for (const nodeId of group?.memberNodeIds ?? []) {
        for (const edge of graph.getIncidentEdges(nodeId)) {
          const groupIds = new Set(edgeGroupIdsByEdgeId.get(edge.id) ?? []);
          groupIds.add(id);
          edgeGroupIdsByEdgeId.set(edge.id, [...groupIds]);
        }
      }
    }
    for (const id of change.removedGroupIds) {
      proxyProjectionIds.add(id);
      const oldGroup = groupByRenderId.get(id);
      for (const nodeId of oldGroup?.memberNodeIds ?? []) {
        for (const edge of graph.getIncidentEdges(nodeId)) {
          const groupIds = (edgeGroupIdsByEdgeId.get(edge.id) ?? []).filter(
            (groupId) => groupId !== id,
          );
          edgeGroupIdsByEdgeId.set(edge.id, groupIds);
        }
      }
    }
    for (const id of change.changedNodeIds) {
      const groupId = graph.getGroupIdForNode(id);
      if (groupId) {
        proxyTopologyDirtyGroupIds.add(groupId);
        proxyProjectionIds.add(groupId);
      }
    }
    meshRenderer.batchUpdates(() => {
      for (const id of change.removedNodeIds) {
        nodeSpatial.remove(id);
        portAnchors.delete(id);
        previewPositions.delete(id);
        for (const edge of graph.getIncidentEdges(id)) edgeCurveCache.delete(edge.id);
        canvasOrder.delete(id, 'node');
        releaseNodeView(id);
        if (hoveredNodeId === id) hoveredNodeId = null;
      }
      for (const id of change.removedEdgeIds) {
        edgeSpatial.remove(id);
        edgeOrder.delete(id);
        edgeCurveCache.delete(id);
        nodeMoveRoutePreviews.delete(id);
      }

      const changedNodes = new Set([...change.addedNodeIds, ...change.changedNodeIds]);
      for (const id of changedNodes) {
        const node = graph.getNode(id);
        if (!node) continue;
        if (change.addedNodeIds.includes(id)) {
          canvasOrder.ensure(id, 'node');
        }
        cacheNodePorts(node);
        const displayNode = getDisplayNode(id);
        if (displayNode)
          nodeSpatial.update(id, nodeBounds(displayNode, getDisplayPosition(id, displayNode)), id);
        else nodeSpatial.remove(id);
        const view = nodeViews.get(id);
        if (view && displayNode) {
          const collapsedGroup = visibleGraph.isCollapsedGroup(id);
          const visual = getNodeVisual(displayNode);
          updateNodeView(
            view,
            displayNode,
            collapsedGroup,
            app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE,
            !visual?.controls.some((control) => control.action === 'group-expand'),
          );
          const position = getDisplayPosition(id, displayNode);
          view.container.position.set(position.x, position.y);
        }
        nodeOcclusion.forget(id);
        if (displayNode)
          meshRenderer.updateNode(
            displayNode,
            getDisplayPosition(id, displayNode),
            getNodeVisual(displayNode),
            getNodePortPositions(displayNode),
          );
      }

      const changedEdges = new Set([...change.addedEdgeIds, ...change.changedEdgeIds]);
      for (const id of change.addedEdgeIds) edgeOrder.set(id, nextEdgeOrder++);
      for (const id of changedNodes) {
        for (const edge of graph.getIncidentEdges(id)) changedEdges.add(edge.id);
      }
      for (const id of new Set([
        ...change.removedGroupIds,
        ...change.addedGroupIds,
        ...change.changedGroupIds,
        ...proxyProjectionIds,
      ])) {
        const previousGroupBounds = groupBoundsCache.get(id);
        const previousBounds = previousGroupBounds
          ? {
              minX: previousGroupBounds.x,
              minY: previousGroupBounds.y,
              maxX: previousGroupBounds.x + previousGroupBounds.width,
              maxY: previousGroupBounds.y + previousGroupBounds.height,
            }
          : null;
        const previousGroup = groupByRenderId.get(id);
        for (const memberId of previousGroup?.memberNodeIds ?? [])
          groupOcclusionRefreshIds.add(memberId);
        groupOcclusionRefreshIds.add(id);
        const edgeIds = refreshGroupProjection(id);
        for (const edgeId of edgeIds) changedEdges.add(edgeId);
        const nextGroupBounds = groupBoundsCache.get(id);
        const nextBounds = nextGroupBounds
          ? {
              minX: nextGroupBounds.x,
              minY: nextGroupBounds.y,
              maxX: nextGroupBounds.x + nextGroupBounds.width,
              maxY: nextGroupBounds.y + nextGroupBounds.height,
            }
          : null;
        groupOcclusionRefreshBounds.push(
          ...getOcclusionTransitionBounds(previousBounds, nextBounds),
        );
        const proxyNode = visibleGraph.getProxyNode(id);
        if (proxyNode) {
          const position = getDisplayPosition(id, proxyNode);
          meshRenderer.updateNode(
            proxyNode,
            position,
            getNodeVisual(proxyNode),
            getNodePortPositions(proxyNode),
          );
          const view = nodeViews.get(id);
          if (view) {
            updateNodeView(
              view,
              proxyNode,
              true,
              app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE,
              !getNodeVisual(proxyNode)?.controls.some(
                (control) => control.action === 'group-expand',
              ),
            );
            view.container.position.set(position.x, position.y);
            nodeOcclusion.forget(id);
          }
        }
        if (change.removedGroupIds.includes(id)) {
          canvasOrder.delete(id, 'group');
          canvasOrder.delete(id, 'node');
          releaseNodeView(id);
          selectedNodeIds.delete(id);
        }
      }
      const edgeUpdates: { readonly edge: FlowEdge; readonly curve: EdgeCurve | null }[] = [];
      for (const id of changedEdges) {
        const edge = graph.getEdge(id);
        if (edge) {
          nodeMoveRoutePreviews.delete(id);
          edgeUpdates.push({ edge: getRenderableEdge(edge), curve: updateEdgeBounds(edge) });
        }
      }
      meshRenderer.updateEdges(edgeUpdates);

      if (selection?.type === 'node' && !graph.getNode(selection.id)) selection = null;
      if (selection?.type === 'edge' && !graph.getEdge(selection.id)) selection = null;
      if (selection?.type === 'group' && !graph.getGroup(selection.id)) selection = null;
      for (const id of [...selectedNodeIds]) if (!graph.getNode(id)) selectedNodeIds.delete(id);
      const activeConnection = connectionController.getActive();
      if (activeConnection && !graph.getNode(activeConnection.source.nodeId)) cancelConnection();
      if (connectionController.isActive()) refreshConnectionMarker();
      if (selection?.type === 'node' && !selectedNodeIds.has(selection.id)) {
        if (graph.getNode(selection.id)) selectedNodeIds.add(selection.id);
      }
      primarySelectedNodeId =
        selection?.type === 'node' ? selection.id : (selectedNodeIds.values().next().value ?? null);
      const selectionChanged =
        selectionBeforeGraphChange?.type !== selection?.type ||
        selectionBeforeGraphChange?.id !== selection?.id ||
        selectedNodesBeforeGraphChange.size !== selectedNodeIds.size ||
        [...selectedNodesBeforeGraphChange].some((id) => !selectedNodeIds.has(id));
      if (selectionChanged) announceSelection(selection, selectedNodeIds);
      meshRenderer.setNodeSelection(
        [...selectedNodeIds],
        primarySelectedNodeId,
        selection?.type === 'edge' ? selection.id : null,
      );
      lastCameraBounds = null;
      lastOverscanBounds = null;
      syncVisibleViews();
      if (groupOcclusionRefreshBounds.length > 0) {
        refreshNodeTextOverlaps(groupOcclusionRefreshBounds, [...groupOcclusionRefreshIds]);
      }
      for (const id of changedNodes) {
        if (overscanNodeIds.has(id)) updateNodeText(id, true);
      }
      syncGroupViews(getCameraBounds());
      invalidate();
    });
    recordDuration(graphUpdateDurations, performance.now() - graphUpdateStartedAt);
    notifyProjectedSceneChanged();
  }

  function movePointer(event: FederatedPointerEvent) {
    const { x, y } = event.global;
    const insideCanvas = x >= 0 && x <= app.screen.width && y >= 0 && y <= app.screen.height;
    lastPointerScreenPosition = insideCanvas ? { x, y } : null;
    lastPointerEvent = event;
    if (selectionController.isActive()) {
      selectionController.update(world.toLocal(event.global));
      drawSelectionBox();
      updateAutoPan(event.global);
      invalidate();
      return;
    }
    if (pendingGroupHeaderGesture) {
      if (startPendingGroupDrag(event)) return;
      return;
    }
    nodeDrag.move(event);
    if (nodeDrag.getActiveNodeIds().length > 0) {
      updateAutoPan(event.global);
      return;
    }
    if (connectionController.isActive()) {
      updateConnectionGesture(world.toLocal(event.global));
      updateAutoPan(event.global);
      return;
    }
    if (activeEdgeRouteDrag) {
      updateEdgeRouteDrag(event);
      return;
    }
    if (viewportPanning) return;
    const point = insideCanvas ? world.toLocal(event.global) : null;
    const hasOrthogonalHandle = updateEdgeEditorHover(point);
    const selectedEdge = selection?.type === 'edge' ? graph.getEdge(selection.id) : undefined;
    const hasControlPoint =
      !!point &&
      !!selectedEdge &&
      selectedEdge.settings.routingStyle !== 'orthogonal' &&
      !!pickClosestRoutePoint(selectedEdge.controlPoints ?? [], point, 6);
    const nextHovered = point ? findNodeAtPoint(point) : null;
    const hasClickableGroupHeader =
      !!point &&
      (!!selectedGroupHeaderOverlayAtPoint(point) || (!nextHovered && !!groupHeaderAtPoint(point)));
    const nextNode = nextHovered ? getDisplayNode(nextHovered) : undefined;
    const nextControl = nextNode && point ? getNodeControlAtPoint(nextNode, point) : null;
    const controlChanged =
      nextControl?.type !== hoveredNodeControl?.type ||
      ((nextControl?.type === 'port' || nextControl?.type === 'io') &&
        nextControl.type === hoveredNodeControl?.type &&
        nextControl.portId !== hoveredNodeControl.portId);
    if (nextHovered === hoveredNodeId && !controlChanged) {
      setCanvasCursor(
        hasOrthogonalHandle || hasControlPoint
          ? 'move'
          : hoveredNodeControl || hasClickableGroupHeader
            ? 'pointer'
            : nextHovered
              ? 'grab'
              : '',
      );
      return;
    }
    const previous = hoveredNodeId;
    hoveredNodeId = nextHovered;
    hoveredNodeControl = nextControl;
    if (previous) updateNodeText(previous);
    if (nextHovered) updateNodeText(nextHovered);
    setCanvasCursor(
      hasOrthogonalHandle || hasControlPoint
        ? 'move'
        : nextControl || hasClickableGroupHeader
          ? 'pointer'
          : nextHovered
            ? 'grab'
            : '',
    );
    invalidate();
  }

  function endPointerGesture(event: FederatedPointerEvent, outside = false) {
    if (selectionController.isActive()) finishSelectionBox();
    if (pendingGroupHeaderGesture) {
      const pending = pendingGroupHeaderGesture;
      const startedGroupDrag = startPendingGroupDrag(event);
      if (!startedGroupDrag && pendingGroupHeaderGesture) {
        const canCollapseGroup = interaction.graphEditing || interaction.groupActions;
        pendingGroupHeaderGesture = null;
        if (!outside && canCollapseGroup) {
          const decision = semanticEvents.onActionRequest?.({
            type: 'set-group-collapsed',
            groupId: pending.groupId,
            collapsed: true,
          });
          if (!decision || decision.status === 'ignored')
            graph.setGroupCollapsed(pending.groupId, true);
          else if (decision.status === 'committed' || decision.status === 'unchanged')
            semanticEvents.onGroupInteraction?.(pending.groupId, 'collapse');
        }
      }
    }
    if (connectionController.isActive()) finishConnection(event, outside);
    if (activeEdgeRouteDrag) {
      updateEdgeRouteDrag(event);
      finishEdgeRouteDrag();
    }
    nodeDrag.end(event);
    updateAutoPan(null);
    const { x, y } = event.global;
    const insideCanvas = x >= 0 && x <= app.screen.width && y >= 0 && y <= app.screen.height;
    const point = insideCanvas ? world.toLocal(event.global) : null;
    const nodeId = point ? findNodeAtPoint(point) : null;
    const node = nodeId ? getDisplayNode(nodeId) : undefined;
    const nodeControl = node && point ? getNodeControlAtPoint(node, point) : null;
    const clickableGroupHeader =
      !!point &&
      (!!selectedGroupHeaderOverlayAtPoint(point) || (!nodeId && !!groupHeaderAtPoint(point)));
    setCanvasCursor(nodeControl || clickableGroupHeader ? 'pointer' : nodeId ? 'grab' : '');
  }

  const handlePointerUpOutside = (event: FederatedPointerEvent) => {
    canvasTapActivation.cancel();
    endPointerGesture(event, true);
  };
  const handleCanvasPointerCancel = () => {
    canvasTapActivation.cancel();
    pendingGroupHeaderGesture = null;
    cancelSelectionBox();
    cancelConnection();
    nodeDrag.cancel();
    updateAutoPan(null);
    viewportInput.cancel();
    if (activeEdgeRouteDrag) {
      const edgeId = activeEdgeRouteDrag.edgeId;
      activeEdgeRouteDrag = null;
      hoveredOrthogonalSegment = null;
      hoveredOrthogonalHandle = null;
      discardRoutePreview(edgeId, edgeRoutePreviews, refreshEditedEdge);
    }
    setCanvasCursor('');
  };

  function handleCanvasCommandKeyDown(event: KeyboardEvent) {
    if (!interaction.keyboardCommands) return;
    if (event.key === 'Escape') {
      cancelConnection();
      cancelSelectionBox();
      host.title = '';
      setSelection(null);
      return;
    }
  }

  const viewportInput = createViewportInput(
    app,
    app.canvas,
    camera,
    world,
    handleBackgroundPointerDown,
    (panning) => {
      viewportPanning = panning;
      if (panning && hoveredNodeId) {
        const previous = hoveredNodeId;
        hoveredNodeId = null;
        hoveredNodeControl = null;
        updateNodeText(previous);
      }
      if (!panning)
        setCanvasCursor(
          connectionController.isActive() || connectionController.getPendingClick()
            ? 'crosshair'
            : hoveredNodeControl
              ? 'pointer'
              : hoveredNodeId
                ? 'grab'
                : '',
        );
    },
    () => viewportLocked,
    handleCanvasPointerCancel,
    interaction,
  );
  window.addEventListener('pointerdown', clearPendingCanvasTap, true);
  app.canvas.addEventListener('click', handleCanvasClick);
  world.on('pointermove', movePointer);
  app.stage.on('pointerup', endPointerGesture);
  app.stage.on('pointerupoutside', handlePointerUpOutside);
  app.canvas.addEventListener('pointercancel', handleCanvasPointerCancel);
  app.canvas.addEventListener('keydown', handleCanvasKeyDown);
  app.canvas.addEventListener('dblclick', handleCanvasDoubleClick);
  window.addEventListener('keydown', handleCanvasCommandKeyDown);

  for (const node of graph.getNodes()) {
    canvasOrder.ensure(node.id, 'node');
    cacheNodePorts(node);
    lastKnownNodePositions.set(node.id, { x: node.x, y: node.y });
    if (getDisplayNode(node.id)) nodeSpatial.insert(node.id, nodeBounds(node), node.id);
  }
  for (const edge of graph.getEdges()) {
    edgeOrder.set(edge.id, nextEdgeOrder++);
    const groupIds = [
      ...new Set(
        [
          graph.getGroupIdForNode(edge.sourceNodeId),
          graph.getGroupIdForNode(edge.targetNodeId),
        ].filter((groupId): groupId is string => groupId !== undefined),
      ),
    ];
    edgeGroupIdsByEdgeId.set(edge.id, groupIds);
  }
  initializeProjectedEdgeBounds(
    graph.getGroups(),
    graph.getEdges(),
    (group) => {
      groupByRenderId.set(group.id, group);
      refreshGroupProjection(group.id);
    },
    updateEdgeBounds,
  );

  const unsubscribeGraph = graph.subscribe(handleGraphChange);
  const unsubscribeViewport = camera.subscribe((viewport) => {
    for (const listener of viewportListeners) listener(viewport);
    queueViewportSync(viewport);
  });
  const resizeObserver = new ResizeObserver(() => {
    resizeRendererToHost();
    updateGridSize();
    const size = getCanvasCssSize();
    for (const listener of resizeListeners) listener(size);
    queueViewportSync(camera.getState(), false);
  });
  resizeObserver.observe(host);

  updateGridSize();
  applyViewportTransform(camera.getState());
  syncVisibleViews(true);
  lastViewportInput = camera.getState();
  invalidate();

  function refreshGroupPresentation(groupId?: string) {
    const groups = groupId
      ? [graph.getGroup(groupId)].filter((group): group is FlowGroup => !!group)
      : graph.getGroups();
    const affectedEdges = new Set<string>();
    const transitionBounds: Bounds[] = [];
    const affectedOcclusionIds = new Set<string>();
    for (const group of groups) {
      const previousBounds = groupBoundsCache.get(group.id);
      const oldBounds = previousBounds
        ? {
            minX: previousBounds.x,
            minY: previousBounds.y,
            maxX: previousBounds.x + previousBounds.width,
            maxY: previousBounds.y + previousBounds.height,
          }
        : null;
      const presentationData = resolveGroupPresentationData?.(group);
      groupPresentationData.set(group.id, presentationData);
      groupVisualCache.delete(group.id);
      groupProxyPortLayouts.delete(group.id);
      groupProxyCache.invalidate(group.id);
      proxyTopologyDirtyGroupIds.add(group.id);
      for (const memberId of group.memberNodeIds) {
        affectedOcclusionIds.add(memberId);
        for (const edge of graph.getIncidentEdges(memberId)) affectedEdges.add(edge.id);
      }
      affectedOcclusionIds.add(group.id);
      for (const edgeId of refreshGroupProjection(group.id)) affectedEdges.add(edgeId);
      const nextBounds = groupBoundsCache.get(group.id);
      const newBounds = nextBounds
        ? {
            minX: nextBounds.x,
            minY: nextBounds.y,
            maxX: nextBounds.x + nextBounds.width,
            maxY: nextBounds.y + nextBounds.height,
          }
        : null;
      transitionBounds.push(...getOcclusionTransitionBounds(oldBounds, newBounds));
      const proxy = visibleGraph.getProxyNode(group.id);
      if (proxy) {
        const position = getDisplayPosition(group.id, proxy);
        meshRenderer.updateNode(proxy, position, getNodeVisual(proxy), getNodePortPositions(proxy));
        const view = nodeViews.get(group.id);
        if (view) {
          updateNodeView(
            view,
            proxy,
            true,
            app.renderer.resolution * NODE_TEXT_RESOLUTION_SCALE,
            !getNodeVisual(proxy)?.controls.some((control) => control.action === 'group-expand'),
          );
          view.container.position.set(position.x, position.y);
          nodeOcclusion.forget(group.id);
        }
      }
    }
    for (const edgeId of affectedEdges) {
      const edge = graph.getEdge(edgeId);
      if (!edge) continue;
      edgeCurveCache.delete(edgeId);
      updateEdgeBounds(edge);
    }
    if (transitionBounds.length > 0)
      refreshNodeTextOverlaps(transitionBounds, [...affectedOcclusionIds]);
    syncVisibleViews(true);
    for (const id of affectedOcclusionIds)
      if (cameraVisibleNodeIds.has(id)) updateNodeText(id, true);
    syncGroupViews(getCameraBounds());
    invalidate();
  }

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      if (renderRequest !== null) cancelAnimationFrame(renderRequest);
      autoPan.destroy();
      unsubscribeGraph();
      unsubscribeViewport();
      resizeObserver.disconnect();
      nodeTextRefreshQueue.clear();
      viewportInput.destroy();
      window.removeEventListener('keydown', handleCanvasCommandKeyDown);
      world.off('pointermove', movePointer);
      app.stage.off('pointerup', endPointerGesture);
      app.stage.off('pointerupoutside', handlePointerUpOutside);
      app.canvas.removeEventListener('pointercancel', handleCanvasPointerCancel);
      window.removeEventListener('pointerdown', clearPendingCanvasTap, true);
      app.canvas.removeEventListener('click', handleCanvasClick);
      if (canvasTapActivationTimer !== null) {
        window.clearTimeout(canvasTapActivationTimer);
        canvasTapActivationTimer = null;
      }
      app.canvas.removeEventListener('keydown', handleCanvasKeyDown);
      app.canvas.removeEventListener('dblclick', handleCanvasDoubleClick);
      setCanvasCursor('');
      host.title = '';
      for (const view of nodePool) view.container.destroy({ children: true });
      groupPresentation.destroy();
      meshRenderer.destroy();
      app.stage.removeChild(grid, world);
      grid.destroy();
      world.destroy({ children: true });
      nodeSpatial.clear();
      edgeSpatial.clear();
      groupSpatial.clear();
      groupProxyCache.clear();
      visibleGraph.clear();
    },
    fitGraph() {
      fitView(false);
    },
    fitSelection() {
      fitView(true);
    },
    centerOnSelection: centerSelection,
    getSelection() {
      return selection === null
        ? null
        : {
            target: { ...selection },
            nodeIds: [...selectedNodeIds],
            primaryNodeId: primarySelectedNodeId,
          };
    },
    selectNodes,
    selectEdge,
    selectGroup,
    clearSelection() {
      setSelection(null);
    },
    zoomIn() {
      zoomBy(1.2);
    },
    zoomOut() {
      zoomBy(1 / 1.2);
    },
    setViewportLocked(locked) {
      viewportLocked = locked;
      viewportInput.setLocked(locked);
      if (locked) handleCanvasPointerCancel();
    },
    isViewportLocked() {
      return viewportLocked;
    },
    addRecipeNode,
    addGraphNode(node) {
      return graph.addGraphNode(node);
    },
    updateGraphNode(id, update) {
      return graph.updateGraphNode(id, update);
    },
    addGraphEdge(edge) {
      return graph.addGraphEdge(edge);
    },
    updateGraphEdge(id, update) {
      return graph.updateGraphEdge(id, update);
    },
    groupSelectedNodes,
    exportGraphDocument() {
      return serializeGraphDocument(graph, camera.getState());
    },
    async exportCanvasPng(options) {
      const { backgroundColor, padding, maxDimension, maxPixels } = options;
      if (
        !Number.isFinite(padding) ||
        padding < 0 ||
        !Number.isFinite(maxDimension) ||
        maxDimension <= 0 ||
        !Number.isSafeInteger(maxPixels) ||
        maxPixels <= 0
      ) {
        throw new Error('PNG export dimensions are invalid.');
      }
      const bounds = getGraphContentBounds();
      if (!bounds) {
        throw new Error('No graph content is available for PNG export.');
      }
      const frame = createCanvasExportFrame(bounds, padding, maxDimension, maxPixels);
      if (!frame) {
        throw new Error(
          'PNG export could not fit the graph geometry within the image dimension and pixel limits.',
        );
      }

      const outputWidth = Math.ceil(frame.width * frame.resolution);
      const outputHeight = Math.ceil(frame.height * frame.resolution);
      const tiles = createCanvasExportTiles(outputWidth, outputHeight, EXPORT_TILE_DIMENSION);
      if (!tiles) throw new Error('PNG export could not create render tiles.');

      const transientLayers = [
        groupFrontLayer,
        nodeSelectionLayer,
        connectionLayer,
        edgeEditorLayer,
      ];
      const previousVisibility = transientLayers.map((layer) => layer.visible);
      let canvas: HTMLCanvasElement | null = null;
      try {
        exportingCanvasPng = true;
        syncVisibleViews(true, bounds, false);
        for (const layer of transientLayers) layer.visible = false;
        world.position.set(0, 0);
        world.scale.set(1);
        canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
          throw new Error('The browser could not allocate the requested PNG output size.');
        }
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('The browser could not create the PNG composition context.');
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, outputWidth, outputHeight);

        for (const tile of tiles) {
          const tileCanvas = app.renderer.extract.canvas({
            target: world,
            frame: new Rectangle(
              frame.x + tile.x / frame.resolution,
              frame.y + tile.y / frame.resolution,
              tile.width / frame.resolution,
              tile.height / frame.resolution,
            ),
            resolution: frame.resolution,
            clearColor: backgroundColor,
            antialias: true,
          });
          try {
            if (!(tileCanvas instanceof HTMLCanvasElement)) {
              throw new Error('The browser returned an unsupported Pixi export tile.');
            }
            await drawCanvasExportTile(context, tileCanvas, tile, async () => {
              if (app.renderer instanceof WebGPURenderer) {
                await app.renderer.gpu.device.queue.onSubmittedWorkDone();
              }
            });
          } finally {
            tileCanvas.width = 0;
            tileCanvas.height = 0;
          }
        }
      } catch (error) {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(`PNG export failed while rendering the graph: ${details}`, {
          cause: error,
        });
      } finally {
        exportingCanvasPng = false;
        transientLayers.forEach((layer, index) => {
          layer.visible = previousVisibility[index] ?? true;
        });
        applyViewportTransform(camera.getState());
        syncVisibleViews(true, undefined, false);
        invalidate();
      }
      if (!canvas) throw new Error('PNG export failed to render the graph.');
      if (typeof canvas.toBlob !== 'function') {
        throw new Error('This browser cannot export the PixiJS canvas as PNG.');
      }
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob?.((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('PNG export failed: canvas.toBlob returned null.'));
        }, 'image/png');
      });
    },
    importGraphDocument(input) {
      applyGraphDocument(input, graph, camera);
    },
    graphToScreen,
    screenToGraph,
    getNodeBounds,
    getPortBounds,
    getPortRowBounds,
    getControlBounds,
    getGroupHeaderBounds,
    getEdgeGeometry,
    getProjectedScene,
    subscribeViewport(listener) {
      viewportListeners.add(listener);
      return () => viewportListeners.delete(listener);
    },
    subscribeResize(listener) {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    subscribeScene(listener) {
      sceneListeners.add(listener);
      return () => sceneListeners.delete(listener);
    },
    refreshGroupPresentation,
    getDiagnostics() {
      const totalGraphNodes = graph.getNodeCount();
      const totalGraphEdges = graph.getEdgeCount();
      const missedFrames =
        measuredRefreshIntervalMs > 0
          ? frameIntervals.filter((interval) => interval > measuredRefreshIntervalMs * 1.5).length
          : 0;
      return {
        totalGraphNodes,
        totalGraphEdges,
        cameraVisibleNodes: cameraVisibleNodeIds.size,
        cameraVisibleEdges: cameraVisibleEdgeIds.size,
        renderedNodeGeometries: meshRenderer.renderedNodeGeometryCount,
        renderedEdgeGeometries: meshRenderer.renderedEdgeGeometryCount,
        overscanActiveNodes: overscanNodeIds.size,
        overscanActiveEdges: overscanEdgeIds.size,
        offscreenNodes: totalGraphNodes - cameraVisibleNodeIds.size,
        offscreenEdges: totalGraphEdges - cameraVisibleEdgeIds.size,
        activeNodes: overscanNodeIds.size,
        activeEdges: overscanEdgeIds.size,
        indexedNodes: nodeSpatial.size,
        indexedEdges: edgeSpatial.size,
        renderedFrames,
        rendererCpuSampleCount: rendererCpuDurations.length,
        viewportSyncSampleCount: viewportSyncDurations.length,
        graphUpdateSampleCount: graphUpdateDurations.length,
        panSyncSampleCount: panSyncDurations.length,
        zoomSyncSampleCount: zoomSyncDurations.length,
        pickingSampleCount: pickingDurations.length,
        dragSampleCount: dragDurations.length,
        renderScheduled: renderRequest !== null,
        p95RenderWorkMs: percentile(renderDurations, 0.95),
        p50RendererCpuMs: percentile(rendererCpuDurations, 0.5),
        p95RendererCpuMs: percentile(rendererCpuDurations, 0.95),
        p50ViewportSyncMs: percentile(viewportSyncDurations, 0.5),
        p95ViewportSyncMs: percentile(viewportSyncDurations, 0.95),
        p50PanSyncMs: percentile(panSyncDurations, 0.5),
        p95PanSyncMs: percentile(panSyncDurations, 0.95),
        p50ZoomSyncMs: percentile(zoomSyncDurations, 0.5),
        p95ZoomSyncMs: percentile(zoomSyncDurations, 0.95),
        p95VisibilityQueryMs: percentile(visibilityQueryDurations, 0.95),
        p95ProjectedSceneMs: percentile(projectedSceneDurations, 0.95),
        p95VisibleMeshMs: percentile(visibleMeshDurations, 0.95),
        p95NodeTextLifecycleMs: percentile(nodeTextLifecycleDurations, 0.95),
        p95GroupPresentationMs: percentile(groupPresentationDurations, 0.95),
        p95VisibleSyncMs: percentile(viewportSyncDurations, 0.95),
        p50PickingMs: percentile(pickingDurations, 0.5),
        p95PickingMs: percentile(pickingDurations, 0.95),
        p50DragWorkMs: percentile(dragDurations, 0.5),
        p95DragWorkMs: percentile(dragDurations, 0.95),
        p95DragIndexMs: percentile(dragIndexDurations, 0.95),
        p95DragNodeMeshMs: percentile(dragNodeMeshDurations, 0.95),
        p95DragEdgesMs: percentile(dragEdgeDurations, 0.95),
        p95DragVisibilityMs: percentile(dragVisibilityDurations, 0.95),
        p95DragTextMs: percentile(dragTextDurations, 0.95),
        occlusionSampleCount: occlusionDurations.length,
        p95OcclusionMs: percentile(occlusionDurations, 0.95),
        p95OcclusionCandidates: percentile(occlusionCandidateCounts, 0.95),
        nodePoolSize: nodePool.length,
        nodePoolLimit: NODE_VIEW_POOL_LIMIT,
        lastGraphCommitMs: graph.getPerformanceDiagnostics().lastMutationDurationMs,
        measuredRefreshIntervalMs,
        frameIntervalsMs: [...frameIntervals],
        samples: {
          renderMs: [...renderDurations],
          rendererCpuMs: [...rendererCpuDurations],
          viewportSyncMs: [...viewportSyncDurations],
          graphUpdateMs: [...graphUpdateDurations],
          panSyncMs: [...panSyncDurations],
          zoomSyncMs: [...zoomSyncDurations],
          visibilityQueryMs: [...visibilityQueryDurations],
          projectedSceneMs: [...projectedSceneDurations],
          visibleMeshMs: [...visibleMeshDurations],
          nodeTextLifecycleMs: [...nodeTextLifecycleDurations],
          groupPresentationMs: [...groupPresentationDurations],
          pickingMs: [...pickingDurations],
          dragMs: [...dragDurations],
          dragIndexMs: [...dragIndexDurations],
          dragNodeMeshMs: [...dragNodeMeshDurations],
          dragEdgesMs: [...dragEdgeDurations],
          dragVisibilityMs: [...dragVisibilityDurations],
          dragTextMs: [...dragTextDurations],
          occlusionMs: [...occlusionDurations],
          occlusionCandidateCounts: [...occlusionCandidateCounts],
        },
        missedFrameRate: frameIntervals.length === 0 ? 0 : missedFrames / frameIntervals.length,
        selectionType: selection?.type ?? null,
        selectionId: selection?.id ?? null,
      };
    },
    resetPerformanceSamples() {
      graph.resetPerformanceDiagnostics();
      renderDurations.length = 0;
      rendererCpuDurations.length = 0;
      viewportSyncDurations.length = 0;
      graphUpdateDurations.length = 0;
      panSyncDurations.length = 0;
      zoomSyncDurations.length = 0;
      visibilityQueryDurations.length = 0;
      projectedSceneDurations.length = 0;
      visibleMeshDurations.length = 0;
      nodeTextLifecycleDurations.length = 0;
      groupPresentationDurations.length = 0;
      pickingDurations.length = 0;
      dragDurations.length = 0;
      dragIndexDurations.length = 0;
      dragNodeMeshDurations.length = 0;
      dragEdgeDurations.length = 0;
      dragVisibilityDurations.length = 0;
      dragTextDurations.length = 0;
      occlusionDurations.length = 0;
      occlusionCandidateCounts.length = 0;
      frameIntervals.length = 0;
      previousRenderAt = 0;
    },
    setRefreshIntervalEstimate(intervalMs: number) {
      if (Number.isFinite(intervalMs) && intervalMs > 0) measuredRefreshIntervalMs = intervalMs;
    },
  };
}
