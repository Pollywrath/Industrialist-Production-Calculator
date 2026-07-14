import type { EdgeControlPoint } from '../types/edges';
import type { Recipe } from '../types/data';

export type LayoutEdgePathStyle = 'straight' | 'bezier' | 'orthogonal';
export type LayoutRecipeResolver = (
  recipeId: string,
  nodeSettings?: Record<string, unknown>,
  nodeId?: string,
) => Pick<Recipe, 'inputs' | 'outputs'> | undefined;

export interface AutoLayoutOptions {
  edgePath?: LayoutEdgePathStyle;
  resolveRecipe?: LayoutRecipeResolver;
}

export interface LayoutSpacingOptions {
  componentComponent: number;
  nodeNode: number;
  edgeNode: number;
  edgeEdge: number;
  nodeNodeBetweenLayers: number;
  edgeNodeBetweenLayers: number;
  edgeEdgeBetweenLayers: number;
}

export interface LayoutEdgePriority {
  direction: number;
  shortness: number;
  straightness: number;
}

export interface LayoutEdgePriorityOptions {
  flow: LayoutEdgePriority;
  feedback: LayoutEdgePriority;
  selfLoop: LayoutEdgePriority;
}

export type LayoutGreedySwitchType = 'OFF' | 'ONE_SIDED_GREEDY_SWITCH' | 'TWO_SIDED_GREEDY_SWITCH';

export type LayoutLayeringStrategy =
  | 'NETWORK_SIMPLEX'
  | 'LONGEST_PATH'
  | 'MIN_WIDTH'
  | 'COFFMAN_GRAHAM';

export interface ResolvedLayoutOptions {
  elkSpacing: LayoutSpacingOptions;
  edgePriority: LayoutEdgePriorityOptions;
  greedySwitchActivationThreshold: number;
  greedySwitchHierarchicalType: LayoutGreedySwitchType;
  layeringStrategy: LayoutLayeringStrategy;
  thoroughness: number;
  portOrderRefinementPasses: number;
}

export interface NodeHandlesMeta {
  inputOrder: number[];
  outputOrder: number[];
  inputCount: number;
  outputCount: number;
}

export type LayoutNodeKind = 'recipe' | 'collapsed-group' | 'expanded-group';
export type PortConstraints = 'FIXED_SIDE' | 'FIXED_POS';
export type PortOrderMode = 'current' | 'stable';

export interface LayoutNodeSpec {
  id: string;
  kind: LayoutNodeKind;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  inputOrder: number[];
  outputOrder: number[];
  commitPortOrder: boolean;
}

export interface LayoutEdgeSpec {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  kind: LayoutEdgeKind;
}

export type LayoutEdgeKind = 'flow' | 'feedback' | 'self-loop';

export interface LayoutGraphResult {
  positions: Map<string, { x: number; y: number }>;
  dimensions: Map<string, { width: number; height: number }>;
  inputOrders: Map<string, number[]>;
  outputOrders: Map<string, number[]>;
  edgeUpdates: Map<string, EdgeUpdate>;
}

export interface LayoutedPoint {
  x?: number;
  y?: number;
}

export interface LayoutedPort extends LayoutedPoint {
  id: string;
}

export interface LayoutedEdgeSection {
  startPoint?: LayoutedPoint;
  endPoint?: LayoutedPoint;
  bendPoints?: LayoutedPoint[];
}

export interface LayoutedEdge {
  id: string;
  container?: string;
  sections?: LayoutedEdgeSection[];
}

export interface LayoutedNode extends LayoutedPoint {
  id: string;
  width?: number;
  height?: number;
  ports?: LayoutedPort[];
  children?: LayoutedNode[];
  edges?: LayoutedEdge[];
}

export interface LayoutedNodePlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports?: LayoutedPort[];
}

export interface LayoutedGraph {
  children?: LayoutedNode[];
  edges?: LayoutedEdge[];
}

export interface CollectedLayoutedEdge {
  edge: LayoutedEdge;
  offsetX: number;
  offsetY: number;
}

export interface MaterializedLayoutPass {
  layouted: LayoutedGraph;
  layoutNodes: LayoutNodeSpec[];
  nodeMap: Map<string, LayoutNodeSpec>;
  placements: Map<string, LayoutedNodePlacement>;
  positions: Map<string, { x: number; y: number }>;
  dimensions: Map<string, { width: number; height: number }>;
  inputOrders: Map<string, number[]>;
  outputOrders: Map<string, number[]>;
}

export interface PortOrderRefinement {
  inputOrders: Map<string, number[]>;
  outputOrders: Map<string, number[]>;
  changed: boolean;
}

export interface ElkInputPort {
  id: string;
  width: number;
  height: number;
  properties: Record<string, string>;
  x?: number;
  y?: number;
}

export interface ElkInputEdge {
  id: string;
  sources: string[];
  targets: string[];
  properties: Record<string, string>;
}

export interface ElkInputNode {
  id: string;
  width?: number;
  height?: number;
  ports?: ElkInputPort[];
  children?: ElkInputNode[];
  properties?: Record<string, string>;
}

export interface EdgeUpdate {
  clearControlPoints?: boolean;
  orthogonalTurns?: EdgeControlPoint[];
}
