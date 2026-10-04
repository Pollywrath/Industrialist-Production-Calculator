import type { Edge } from '@xyflow/react';
import type { CanvasNode } from '../types/nodes';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import { computeGroupBoundsByGroupId } from '../utils/graph/groupBounds';
import { snapToGrid } from './constants';
import type { EdgeUpdate, LayoutGraphResult, LayoutNodeSpec } from './types';

function applyIndexOrder<T>(values: T[], order: number[] | undefined): T[] {
  if (!order || order.length !== values.length) return values;

  const seen = new Set<number>();
  const ordered: T[] = [];
  for (let i = 0; i < order.length; i++) {
    const index = order[i];
    if (index < 0 || index >= values.length || seen.has(index)) return values;
    seen.add(index);
    ordered.push(values[index]);
  }

  return ordered;
}

function applyEdgeUpdate(edge: Edge, update: EdgeUpdate): Edge {
  const nextData: Record<string, unknown> = {
    ...(edge.data as Record<string, unknown> | undefined),
  };

  if (update.clearControlPoints) {
    delete nextData.controlPoints;
  }

  if (update.orthogonalTurns && update.orthogonalTurns.length > 0) {
    nextData.orthogonalTurns = update.orthogonalTurns;
  } else if ('orthogonalTurns' in nextData) {
    delete nextData.orthogonalTurns;
  }

  return {
    ...edge,
    data: nextData,
  };
}

function applyExpandedGroupBounds(
  nodes: readonly CanvasNode[],
  expandedGroupIds: ReadonlySet<string>,
): CanvasNode[] {
  if (expandedGroupIds.size === 0) return nodes as CanvasNode[];

  const boundsByGroupId = computeGroupBoundsByGroupId(nodes, expandedGroupIds);
  let changed = false;
  const nextNodes = new Array<CanvasNode>(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isGroupNode(node) || node.data.collapsed || !expandedGroupIds.has(node.id)) {
      nextNodes[i] = node;
      continue;
    }

    const bounds = boundsByGroupId.get(node.id);
    if (!bounds) {
      nextNodes[i] = node;
      continue;
    }

    if (
      node.position.x === bounds.x &&
      node.position.y === bounds.y &&
      node.width === bounds.width &&
      node.height === bounds.height
    ) {
      nextNodes[i] = node;
      continue;
    }

    changed = true;
    nextNodes[i] = {
      ...node,
      position: { x: bounds.x, y: bounds.y },
      width: bounds.width,
      height: bounds.height,
    };
  }

  return changed ? nextNodes : (nodes as CanvasNode[]);
}

export function applyLayoutResult(
  nodes: CanvasNode[],
  edges: Edge[],
  layoutNodes: LayoutNodeSpec[],
  layout: LayoutGraphResult,
): { nodes: CanvasNode[]; edges: Edge[] } {
  const groupNodes = nodes.filter(isGroupNode);
  const groupMap = new Map(groupNodes.map((node) => [node.id, node]));
  const finalPositions = new Map<string, { x: number; y: number }>();
  const finalInputOrders = new Map<string, number[]>();
  const finalOutputOrders = new Map<string, number[]>();
  const finalGroupDimensions = new Map<string, { width: number; height: number }>();
  const collapsedGroupDeltas = new Map<string, { dx: number; dy: number }>();

  for (let i = 0; i < layoutNodes.length; i++) {
    const layoutNode = layoutNodes[i];
    const position = layout.positions.get(layoutNode.id);
    if (!position) continue;

    finalPositions.set(layoutNode.id, position);

    if (layoutNode.kind === 'recipe') {
      finalInputOrders.set(
        layoutNode.id,
        layout.inputOrders.get(layoutNode.id) ?? layoutNode.inputOrder,
      );
      finalOutputOrders.set(
        layoutNode.id,
        layout.outputOrders.get(layoutNode.id) ?? layoutNode.outputOrder,
      );
      continue;
    }

    finalGroupDimensions.set(
      layoutNode.id,
      layout.dimensions.get(layoutNode.id) ?? {
        width: layoutNode.width,
        height: layoutNode.height,
      },
    );

    const groupNode = groupMap.get(layoutNode.id);
    if (groupNode?.data.collapsed) {
      collapsedGroupDeltas.set(layoutNode.id, {
        dx: position.x - groupNode.position.x,
        dy: position.y - groupNode.position.y,
      });
    }
  }

  const updatedNodes = nodes.map((node) => {
    if (isRecipeNode(node)) {
      let position = finalPositions.get(node.id);
      if (!position && node.hidden && node.data.groupId) {
        const delta = collapsedGroupDeltas.get(node.data.groupId);
        if (delta) {
          position = snapToGrid(node.position.x + delta.dx, node.position.y + delta.dy);
        }
      }

      const inputOrder = finalInputOrders.get(node.id) ?? node.data.inputOrder;
      const outputOrder = finalOutputOrders.get(node.id) ?? node.data.outputOrder;

      if (
        !position &&
        inputOrder === node.data.inputOrder &&
        outputOrder === node.data.outputOrder
      ) {
        return node;
      }

      return {
        ...node,
        position: position ?? node.position,
        data: {
          ...node.data,
          inputOrder,
          outputOrder,
        },
      };
    }

    if (!isGroupNode(node)) return node;

    const position = finalPositions.get(node.id);
    const dimensions = finalGroupDimensions.get(node.id);

    if (!node.data.collapsed) {
      if (!position && !dimensions) return node;
      return {
        ...node,
        position: position ?? node.position,
        width: dimensions?.width ?? node.width,
        height: dimensions?.height ?? node.height,
      };
    }

    const inputProxyHandleIds = applyIndexOrder(
      node.data.inputProxyHandleIds,
      layout.inputOrders.get(node.id),
    );
    const outputProxyHandleIds = applyIndexOrder(
      node.data.outputProxyHandleIds,
      layout.outputOrders.get(node.id),
    );

    return {
      ...node,
      position: position ?? node.position,
      width: dimensions?.width ?? node.width,
      height: dimensions?.height ?? node.height,
      data: {
        ...node.data,
        inputProxyHandleIds,
        outputProxyHandleIds,
      },
    };
  });

  const expandedGroupIds = new Set(
    groupNodes.filter((node) => !node.data.collapsed).map((node) => node.id),
  );
  const boundedNodes = applyExpandedGroupBounds(updatedNodes, expandedGroupIds);

  const updatedEdges = edges.map((edge) => {
    const update = layout.edgeUpdates.get(edge.id);
    return update ? applyEdgeUpdate(edge, update) : edge;
  });

  return { nodes: boundedNodes, edges: updatedEdges };
}
