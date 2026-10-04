import type { Edge } from '@xyflow/react';
import type { Recipe } from '../types/data';
import type { CanvasNode, GroupNodeType, RecipeNodeType } from '../types/nodes';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  getCollapsedGroupHeight,
} from '../utils/graph/groupBounds';
import {
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
  RECT_GAP,
  RECT_HEIGHT,
  createIndexOrder,
} from './constants';
import type {
  LayoutEdgeKind,
  LayoutEdgeSpec,
  LayoutNodeSpec,
  LayoutRecipeResolver,
  NodeHandlesMeta,
} from './types';

type LayoutEdgeDraft = Omit<LayoutEdgeSpec, 'kind'>;

function getRecipeNodeHandlesMeta(
  node: RecipeNodeType,
  recipe: Pick<Recipe, 'inputs' | 'outputs'> | undefined,
): NodeHandlesMeta {
  const fallbackInputCount = recipe?.inputs.length ?? 0;
  const fallbackOutputCount = recipe?.outputs.length ?? 0;

  const inputOrder = node.data.inputOrder?.slice() ?? createIndexOrder(fallbackInputCount);
  const outputOrder = node.data.outputOrder?.slice() ?? createIndexOrder(fallbackOutputCount);

  return {
    inputOrder,
    outputOrder,
    inputCount: inputOrder.length,
    outputCount: outputOrder.length,
  };
}

function getCollapsedGroupHandlesMeta(node: GroupNodeType): NodeHandlesMeta {
  const inputCount = node.data.inputProxyHandleIds.length;
  const outputCount = node.data.outputProxyHandleIds.length;

  return {
    inputOrder: createIndexOrder(inputCount),
    outputOrder: createIndexOrder(outputCount),
    inputCount,
    outputCount,
  };
}

function calculateRecipeNodeHeight(
  node: RecipeNodeType,
  recipe: Pick<Recipe, 'inputs' | 'outputs'> | undefined,
): number {
  const { inputCount, outputCount } = getRecipeNodeHandlesMeta(node, recipe);
  const maxCount = Math.max(inputCount, outputCount, 1);
  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  return BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
}

function createRecipeLayoutNode(
  node: RecipeNodeType,
  resolveRecipe?: LayoutRecipeResolver,
  parentId?: string,
): LayoutNodeSpec {
  const recipe = resolveRecipe?.(node.data.recipeId, node.data.settings, node.id);
  const meta = getRecipeNodeHandlesMeta(node, recipe);
  return {
    id: node.id,
    kind: 'recipe',
    parentId,
    position: node.position,
    width: node.width ?? NODE_CSS_WIDTH,
    height: node.height ?? calculateRecipeNodeHeight(node, recipe),
    inputOrder: meta.inputOrder,
    outputOrder: meta.outputOrder,
    commitPortOrder: true,
  };
}

function createExpandedGroupLayoutNode(node: GroupNodeType): LayoutNodeSpec {
  return {
    id: node.id,
    kind: 'expanded-group',
    position: node.position,
    width: node.width ?? EMPTY_GROUP_WIDTH,
    height: node.height ?? EMPTY_GROUP_HEIGHT,
    inputOrder: [],
    outputOrder: [],
    commitPortOrder: false,
  };
}

function createCollapsedGroupLayoutNode(node: GroupNodeType): LayoutNodeSpec {
  const meta = getCollapsedGroupHandlesMeta(node);
  const fallbackHeight = getCollapsedGroupHeight(meta.inputCount, meta.outputCount);
  return {
    id: node.id,
    kind: 'collapsed-group',
    position: node.position,
    width: node.width ?? node.measured?.width ?? NODE_CSS_WIDTH,
    height: node.height ?? node.measured?.height ?? fallbackHeight,
    inputOrder: meta.inputOrder,
    outputOrder: meta.outputOrder,
    commitPortOrder: true,
  };
}

export function buildLayoutNodes(
  nodes: CanvasNode[],
  resolveRecipe?: LayoutRecipeResolver,
): LayoutNodeSpec[] {
  const groupNodes = nodes.filter(isGroupNode);
  const groupMap = new Map(groupNodes.map((node) => [node.id, node]));
  const layoutNodes: LayoutNodeSpec[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (isGroupNode(node)) {
      layoutNodes.push(
        node.data.collapsed
          ? createCollapsedGroupLayoutNode(node)
          : createExpandedGroupLayoutNode(node),
      );
      continue;
    }

    if (!isRecipeNode(node) || node.hidden) continue;

    const groupNode = node.data.groupId ? groupMap.get(node.data.groupId) : undefined;
    const parentId = groupNode && !groupNode.data.collapsed ? groupNode.id : undefined;
    layoutNodes.push(createRecipeLayoutNode(node, resolveRecipe, parentId));
  }

  layoutNodes.sort((a, b) => a.id.localeCompare(b.id));
  return layoutNodes;
}

export function buildLayoutEdges(
  nodes: CanvasNode[],
  edges: Edge[],
  layoutNodeIds: ReadonlySet<string>,
): LayoutEdgeSpec[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const layoutEdges: LayoutEdgeDraft[] = [];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.hidden) continue;
    if (!layoutNodeIds.has(edge.source) || !layoutNodeIds.has(edge.target)) continue;

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (isGroupNode(sourceNode) && !sourceNode.data.collapsed) continue;
    if (isGroupNode(targetNode) && !targetNode.data.collapsed) continue;

    layoutEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    });
  }

  layoutEdges.sort((a, b) => a.id.localeCompare(b.id));
  return finalizeLayoutEdges(layoutEdges);
}

function buildComponentIds(edges: LayoutEdgeDraft[]): Map<string, number> {
  const adjacency = new Map<string, string[]>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const componentByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let nextIndex = 0;
  let nextComponentId = 0;

  const visit = (nodeId: string) => {
    indexByNode.set(nodeId, nextIndex);
    lowLinkByNode.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (let i = 0; i < neighbors.length; i++) {
      const neighborId = neighbors[i];
      if (!indexByNode.has(neighborId)) {
        visit(neighborId);
        lowLinkByNode.set(
          nodeId,
          Math.min(lowLinkByNode.get(nodeId) ?? 0, lowLinkByNode.get(neighborId) ?? 0),
        );
      } else if (onStack.has(neighborId)) {
        lowLinkByNode.set(
          nodeId,
          Math.min(lowLinkByNode.get(nodeId) ?? 0, indexByNode.get(neighborId) ?? 0),
        );
      }
    }

    if (lowLinkByNode.get(nodeId) !== indexByNode.get(nodeId)) return;

    while (stack.length > 0) {
      const memberId = stack.pop();
      if (!memberId) break;
      onStack.delete(memberId);
      componentByNode.set(memberId, nextComponentId);
      if (memberId === nodeId) break;
    }

    nextComponentId += 1;
  };

  adjacency.forEach((_neighbors, nodeId) => {
    if (!indexByNode.has(nodeId)) visit(nodeId);
  });

  return componentByNode;
}

function getLayoutEdgeKind(
  edge: LayoutEdgeDraft,
  componentByNode: ReadonlyMap<string, number>,
): LayoutEdgeKind {
  if (edge.source === edge.target) return 'self-loop';

  const sourceComponent = componentByNode.get(edge.source);
  return sourceComponent !== undefined && sourceComponent === componentByNode.get(edge.target)
    ? 'feedback'
    : 'flow';
}

function finalizeLayoutEdges(edges: LayoutEdgeDraft[]): LayoutEdgeSpec[] {
  const componentByNode = buildComponentIds(edges);
  return edges.map((edge) => ({
    ...edge,
    kind: getLayoutEdgeKind(edge, componentByNode),
  }));
}
