import type { Application } from 'pixi.js';
import {
  createFlowchartRenderer,
  type FlowchartRendererHandle,
  type RendererDiagnostics,
  type CanvasSelectionState,
  type CanvasSelectionTarget,
} from './canvas/renderer/flowchart-renderer';
import { GraphStore, type GraphChange } from './state/graph-store';
import { ViewportStore } from './state/viewport-store';
import { defaultGraphTypeRegistry, type GraphTypeRegistry } from './domain/graph/type-registry';
import type { CanvasInteractionConfig } from './canvas/interaction/config';
import type { CanvasSemanticEvents } from './canvas/renderer/flowchart-renderer';

export interface AttachGraphCanvasOptions {
  readonly graph?: GraphStore;
  readonly camera?: ViewportStore;
  readonly announce?: (message: string) => void;
  readonly typeRegistry?: GraphTypeRegistry;
  readonly interaction?: CanvasInteractionConfig;
  readonly events?: CanvasSemanticEvents;
  readonly resolveAsset?: (assetId: string) => CanvasImageSource | null;
  readonly resolveGroupPresentationData?: (
    group: import('./domain/graph/types').FlowGroup,
  ) => unknown;
}

export function attachGraphCanvas(
  app: Application,
  host: HTMLElement,
  options: AttachGraphCanvasOptions = {},
): GraphCanvasApi {
  const typeRegistry =
    options.typeRegistry ?? options.graph?.typeRegistry ?? defaultGraphTypeRegistry;
  const graph = options.graph ?? new GraphStore({ nodes: [], edges: [] }, typeRegistry);
  const camera = options.camera ?? new ViewportStore();
  app.stop();
  if (app.canvas.parentElement !== host) host.appendChild(app.canvas);
  const renderer = createFlowchartRenderer(app, host, graph, camera, 'batch', options.announce, {
    typeRegistry,
    interaction: options.interaction,
    events: options.events,
    resolveAsset: options.resolveAsset,
    resolveGroupPresentationData: options.resolveGroupPresentationData,
  });
  return Object.assign(renderer, { graph, camera, typeRegistry });
}

export interface GraphCanvasApi extends FlowchartRendererHandle {
  readonly graph: GraphStore;
  readonly camera: ViewportStore;
  readonly typeRegistry: GraphTypeRegistry;
}

export { graphStore } from './state/graph-store';
export { GraphStore } from './state/graph-store';
export { createGraphTypeRegistry, defaultGraphTypeRegistry } from './domain/graph/type-registry';
export type {
  EdgeTypeDefinition,
  EdgeTypeDefinitions,
  EdgeVisualDescription,
  GroupTypeDefinition,
  GroupMemberGeometry,
  GroupPresentationContext,
  GroupPresentationMode,
  GraphBounds,
  GraphTypeRegistry,
  NodeTypeDefinitions,
  NodePortLayout,
  NodeTypeDefinition,
  NodeVisualAsset,
  NodeVisualControl,
  NodeVisualDescription,
  NodeVisualShape,
  NodeVisualText,
  VisualPaint,
} from './domain/graph/type-registry';
export type { CanvasInteractionConfig } from './canvas/interaction/config';
export type {
  CanvasActionDecision,
  CanvasActionHandler,
  CanvasActionProposal,
} from './canvas/interaction/action-proposal';
export type {
  CanvasCoordinateSpace,
  CanvasGeometryBounds,
  CanvasProjectedScene,
  CanvasSemanticEvents,
} from './canvas/renderer/flowchart-renderer';
export { MAX_ZOOM, MIN_ZOOM, viewportStore, ViewportStore } from './state/viewport-store';
export type { GraphChange, CanvasSelectionState, CanvasSelectionTarget, RendererDiagnostics };

export {
  importGraphDocument,
  parseGraphDocument,
  serializeGraphDocument,
} from './state/graph-document';
export type { GraphDocument } from './state/graph-document';

export type {
  EdgeControlPoint,
  EdgeId,
  FlowGroup,
  FlowPort,
  GraphEdge,
  GraphNode,
  GraphState,
  GroupId,
  NodeId,
  PortDirection,
  PortId,
  PortKind,
  Viewport,
} from './domain/graph/types';

export { RECIPE_NODE_TYPE, recipeNodeType } from './domain/nodes/recipe/definition';
export type { NewRecipeNode, RecipeNode, RecipeNodeData } from './domain/nodes/recipe/model';
export { FLOW_EDGE_TYPE, flowEdgeType } from './domain/edges/flow/definition';
export type {
  EdgeAnimationStyle,
  EdgeLineStyle,
  EdgePathStyle,
  FlowEdge,
  FlowEdgeSettings,
  NewFlowEdge,
} from './domain/edges/flow/model';
