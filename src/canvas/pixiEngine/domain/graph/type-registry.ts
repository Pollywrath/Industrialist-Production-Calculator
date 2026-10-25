import type { GraphEdge, GraphNode } from './types';
import { flowEdgeType } from '../edges/flow/definition';
import type { FlowEdge } from '../edges/flow/model';
import { FLOW_EDGE_TYPE } from '../edges/flow/definition';
import { recipeNodeType } from '../nodes/recipe/definition';
import type { RecipeNode } from '../nodes/recipe/model';
import { RECIPE_NODE_TYPE } from '../nodes/recipe/definition';
import { getPortPosition, getRecipeNodeSize } from '../nodes/recipe/geometry';
import type { FlowGroup } from './types';
import type { GroupProxyPort } from '../nodes/group/geometry';

export interface GraphBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type VisualPaint = string | number;

export type NodeVisualShape =
  | {
      readonly kind: 'rect' | 'round-rect';
      readonly bounds: GraphBounds;
      readonly radius?: number;
      readonly fill?: VisualPaint;
      readonly stroke?: VisualPaint;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: 'circle';
      readonly centerX: number;
      readonly centerY: number;
      readonly radius: number;
      readonly fill?: VisualPaint;
      readonly stroke?: VisualPaint;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: 'polygon';
      readonly points: readonly { readonly x: number; readonly y: number }[];
      readonly fill?: VisualPaint;
      readonly stroke?: VisualPaint;
      readonly strokeWidth?: number;
    };

export interface NodeVisualText {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly color: VisualPaint;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontWeight?: number | string;
  readonly align?: 'left' | 'center' | 'right';
  readonly verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface NodeVisualControl {
  readonly id: string;
  readonly bounds: GraphBounds;
  readonly label: string;
  readonly action: string;
  readonly shape?: 'rect' | 'round-rect' | 'circle';
  readonly fill?: VisualPaint;
  readonly stroke?: VisualPaint;
}

export interface NodeVisualAsset {
  readonly asset: string;
  readonly bounds: GraphBounds;
  readonly fit?: 'contain' | 'cover' | 'stretch';
}

export interface NodeVisualDescription {
  readonly bounds: GraphBounds;
  readonly shapes: readonly NodeVisualShape[];
  readonly texts: readonly NodeVisualText[];
  readonly controls: readonly NodeVisualControl[];
  readonly assets: readonly NodeVisualAsset[];
  readonly hitShapes: readonly GraphBounds[];
}

export interface NodePortLayout {
  readonly x: number;
  readonly y: number;
  readonly bounds: GraphBounds;
}

export interface NodeTypeDefinition<TNode extends GraphNode = GraphNode> {
  readonly type: TNode['type'];
  validate(node: GraphNode): asserts node is TNode;
  getBounds(node: TNode): GraphBounds;
  getPortLayout(node: TNode, portId: string): NodePortLayout | null;
  describe(node: TNode): NodeVisualDescription;
}

export interface EdgeVisualDescription {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly color: VisualPaint;
  readonly width: number;
  readonly hitWidth: number;
  readonly pattern?: 'solid' | 'dashed' | 'dotted';
  readonly animation?: 'none' | 'moving-dashes' | 'pulse-arrow';
}

export interface EdgeTypeDefinition<TEdge extends GraphEdge = GraphEdge> {
  readonly type: TEdge['type'];
  readonly defaults: unknown;
  validate(edge: GraphEdge): asserts edge is TEdge;
  describe(
    edge: TEdge,
    source: { readonly x: number; readonly y: number },
    target: { readonly x: number; readonly y: number },
  ): EdgeVisualDescription;
}

export type GroupPresentationMode = 'expanded' | 'collapsed';

export interface GroupMemberGeometry {
  readonly node: GraphNode;
  readonly position: { readonly x: number; readonly y: number };
  readonly bounds: GraphBounds;
}

export interface GroupPresentationContext {
  readonly worldBounds: GraphBounds;
  readonly localBounds: GraphBounds;
  readonly members: readonly GroupMemberGeometry[];
  readonly proxyPorts: readonly GroupProxyPort[];
  readonly presentationData: unknown;
}

export interface GroupTypeDefinition<TPresentationData = unknown> {
  readonly type: 'group';
  readonly projection: 'container-proxy';
  getBounds?(
    group: FlowGroup,
    members: readonly GroupMemberGeometry[],
    presentationData: TPresentationData,
  ): GraphBounds | null;
  getProxyPortLayout?(
    group: FlowGroup,
    proxyPort: GroupProxyPort,
    index: number,
    total: number,
    context: GroupPresentationContext,
  ): NodePortLayout | null;
  describe?(
    group: FlowGroup,
    mode: GroupPresentationMode,
    context: GroupPresentationContext,
  ): NodeVisualDescription | undefined;
}

export type NodeTypeDefinitions = Readonly<Record<string, NodeTypeDefinition>>;
export type EdgeTypeDefinitions = Readonly<Record<string, EdgeTypeDefinition>>;
export interface GraphTypeRegistry<
  TNodes extends NodeTypeDefinitions = NodeTypeDefinitions,
  TEdges extends EdgeTypeDefinitions = EdgeTypeDefinitions,
  TGroup extends GroupTypeDefinition = GroupTypeDefinition,
> {
  readonly nodes: TNodes;
  readonly edges: TEdges;
  readonly groups: Readonly<{ group: TGroup }>;
}

const recipeDefinitionValue: NodeTypeDefinition<RecipeNode> = {
  type: RECIPE_NODE_TYPE,
  validate(node): asserts node is RecipeNode {
    recipeNodeType.validate(node as RecipeNode);
  },
  getBounds(node) {
    const size = getRecipeNodeSize(node);
    return { x: 0, y: 0, ...size };
  },
  getPortLayout(node, portId) {
    const position = getPortPosition(node, portId);
    return position
      ? {
          x: position.x,
          y: position.y,
          bounds: { x: position.x - 6, y: position.y - 6, width: 12, height: 12 },
        }
      : null;
  },
  describe(node) {
    const bounds = this.getBounds(node);
    const portHitShapes = node.ports.flatMap((port) => {
      const layout = this.getPortLayout(node, port.id);
      return layout ? [layout.bounds] : [];
    });
    return {
      bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      shapes: [
        {
          kind: 'round-rect',
          bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          radius: 12,
          fill: node.data.isTarget ? 'nodeTargetBackground' : 'nodeBackground',
          stroke: node.data.isTarget ? 'nodeTargetBorder' : 'nodeBorder',
          strokeWidth: 2,
        },
      ],
      texts: [
        {
          id: 'label',
          text: node.label,
          x: bounds.width / 2,
          y: 24,
          color: 'textPrimary',
          fontSize: 15,
          fontWeight: 700,
          align: 'center',
        },
      ],
      controls: [
        {
          id: 'menu',
          bounds: { x: bounds.width - 34, y: 10, width: 24, height: 24 },
          label: 'Node actions',
          action: 'node-menu',
          shape: 'round-rect',
        },
      ],
      assets: [],
      hitShapes: [{ x: 0, y: 0, width: bounds.width, height: bounds.height }, ...portHitShapes],
    };
  },
};
const recipeDefinition = Object.freeze(recipeDefinitionValue);

const flowDefinitionValue: EdgeTypeDefinition<FlowEdge> = {
  type: FLOW_EDGE_TYPE,
  defaults: flowEdgeType.defaults,
  validate(edge): asserts edge is FlowEdge {
    if (edge.type !== FLOW_EDGE_TYPE) throw new Error(`Unknown flow edge type "${edge.type}".`);
    flowEdgeType.validateSettings(edge.settings as FlowEdge['settings']);
  },
  describe(edge, source, target) {
    return {
      points: [source, target],
      color: 'edge',
      width: 2.6,
      hitWidth: 12,
      pattern: edge.settings.lineStyle,
      animation: edge.settings.animationStyle,
    };
  },
};
const flowDefinition = Object.freeze(flowDefinitionValue);

const BUILTIN_GROUP_TYPE: GroupTypeDefinition = Object.freeze({
  type: 'group',
  projection: 'container-proxy',
});

function copyAndFreezeData<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(copyAndFreezeData)) as T;
  if (typeof value !== 'object' || value === null) return value;
  const copy = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, copyAndFreezeData(item)]),
  );
  return Object.freeze(copy) as T;
}

export const defaultGraphTypeRegistry: GraphTypeRegistry<
  Readonly<{ recipe: typeof recipeDefinition }>,
  Readonly<{ flow: typeof flowDefinition }>
> = Object.freeze({
  nodes: Object.freeze({ recipe: recipeDefinition }),
  edges: Object.freeze({ flow: flowDefinition }),
  groups: Object.freeze({ group: BUILTIN_GROUP_TYPE }),
});

export function createGraphTypeRegistry<
  TNodes extends NodeTypeDefinitions = Readonly<Record<never, never>>,
  TEdges extends EdgeTypeDefinitions = Readonly<Record<never, never>>,
  TGroup extends GroupTypeDefinition = GroupTypeDefinition,
>(
  options: {
    readonly nodes?: TNodes;
    readonly edges?: TEdges;
    readonly groups?: Readonly<{ group?: TGroup }>;
  } = {},
): GraphTypeRegistry<
  typeof defaultGraphTypeRegistry.nodes & TNodes,
  typeof defaultGraphTypeRegistry.edges & TEdges,
  TGroup
> {
  const nodes = options.nodes ?? ({} as TNodes);
  const edges = options.edges ?? ({} as TEdges);
  for (const [key, definition] of Object.entries(nodes)) {
    if (key in defaultGraphTypeRegistry.nodes)
      throw new Error(`Node type "${key}" is already registered.`);
    if (key !== definition.type)
      throw new Error(`Node type registry key "${key}" does not match its definition.`);
  }
  for (const [key, definition] of Object.entries(edges)) {
    if (key in defaultGraphTypeRegistry.edges)
      throw new Error(`Edge type "${key}" is already registered.`);
    if (key !== definition.type)
      throw new Error(`Edge type registry key "${key}" does not match its definition.`);
  }
  const group = options.groups?.group ?? defaultGraphTypeRegistry.groups.group;
  if (group.type !== 'group' || group.projection !== 'container-proxy') {
    throw new Error(
      'The group registry entry must preserve the engine-owned container-proxy projection.',
    );
  }
  return Object.freeze({
    nodes: Object.freeze(
      Object.fromEntries([
        ...Object.entries(defaultGraphTypeRegistry.nodes),
        ...Object.entries(nodes).map(([key, definition]) => [
          key,
          Object.freeze({ ...definition }),
        ]),
      ]),
    ) as typeof defaultGraphTypeRegistry.nodes & TNodes,
    edges: Object.freeze(
      Object.fromEntries([
        ...Object.entries(defaultGraphTypeRegistry.edges),
        ...Object.entries(edges).map(([key, definition]) => [
          key,
          Object.freeze({
            ...definition,
            defaults: copyAndFreezeData(definition.defaults),
          }),
        ]),
      ]),
    ) as typeof defaultGraphTypeRegistry.edges & TEdges,
    groups: Object.freeze({ group: Object.freeze({ ...group }) }) as Readonly<{ group: TGroup }>,
  });
}
