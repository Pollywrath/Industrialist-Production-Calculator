import type { TutorialHighlight } from '../../tutorials/types';
import type { TutorialAlias } from '../../tutorials/types';
import {
  getCanvasAdapter,
  type CanvasBounds,
  type CanvasPoint,
} from '../../canvas/canvasAdapterApi';
import { useFlowStore } from '../../stores/useFlowStore';
import { isGroupNode, isRecipeNode } from '../../types/nodes';
import { buildHandleId } from '../../utils/idGenerator';

export const TUTORIAL_DRIVER_REFRESH_EVENT = 'industrialist:tutorial-driver-refresh';

export const selectorForTutorialHighlight = (
  highlight: TutorialHighlight,
  getNodeId: (alias: TutorialAlias) => string | null | undefined,
): string => {
  switch (highlight.kind) {
    case 'selector':
      return highlight.selector;
    case 'control':
      return `[data-tutorial-control-id="${highlight.id}"]`;
    case 'overlay':
      return `[data-tutorial-overlay-id="${highlight.id}"]`;
    case 'node': {
      const nodeId = getNodeId(highlight.alias);
      return nodeId ? `[data-tutorial-node-id="${nodeId}"]` : '';
    }
    case 'node-editor-button': {
      const nodeId = getNodeId(highlight.alias);
      return nodeId ? `[data-tutorial-node-editor-button="${nodeId}"]` : '';
    }
    case 'rect': {
      const nodeId = getNodeId(highlight.alias);
      return nodeId
        ? `[data-tutorial-rect-node-id="${nodeId}"][data-tutorial-rect-side="${highlight.side}"][data-tutorial-rect-index="${highlight.index}"]`
        : '';
    }
    case 'handle': {
      const nodeId = getNodeId(highlight.alias);
      return nodeId
        ? `[data-tutorial-handle-id="${buildHandleId(nodeId, highlight.side, highlight.index)}"]`
        : '';
    }
    case 'edge': {
      const sourceNodeId = getNodeId(highlight.sourceAlias);
      const targetNodeId = getNodeId(highlight.targetAlias);
      return sourceNodeId && targetNodeId
        ? `[data-tutorial-edge-source="${sourceNodeId}"][data-tutorial-edge-target="${targetNodeId}"][data-tutorial-edge-source-index="${highlight.sourceIndex}"][data-tutorial-edge-target-index="${highlight.targetIndex}"]`
        : '';
    }
    case 'recipe-card':
      return `[data-tutorial-recipe-card="${highlight.recipeId}"]`;
    case 'product-row':
      return `[data-tutorial-product-row="${highlight.productId}"]`;
    case 'diagnostic':
      return highlight.nodeAlias
        ? `[data-tutorial-diagnostic-status="${highlight.status}"][data-tutorial-diagnostic-product="${highlight.productId}"][data-tutorial-diagnostic-node="${getNodeId(highlight.nodeAlias) ?? ''}"]`
        : `[data-tutorial-diagnostic-status="${highlight.status}"][data-tutorial-diagnostic-product="${highlight.productId}"]`;
    case 'node-editor':
      return `[data-tutorial-node-editor="${highlight.id}"]`;
    case 'solver':
      return `[data-tutorial-solver="${highlight.id}"]`;
    case 'save':
      return `[data-tutorial-save="${highlight.id}"]`;
    case 'dashboard':
      return `[data-tutorial-dashboard="${highlight.id}"]`;
    case 'group': {
      const nodeId = getNodeId(highlight.alias);
      if (!nodeId) return '';
      return highlight.part
        ? `[data-tutorial-group-node-id="${nodeId}"][data-tutorial-group-part="${highlight.part}"]`
        : `[data-tutorial-node-id="${nodeId}"]`;
    }
    case 'data':
      return highlight.selector;
  }
};

export const getElementForTutorialHighlight = (
  highlight: TutorialHighlight,
  getNodeId: (alias: TutorialAlias) => string | null | undefined,
): Element | null => {
  const selector = selectorForTutorialHighlight(highlight, getNodeId);
  return selector ? document.querySelector(selector) : null;
};

export interface TutorialCanvasGeometry {
  bounds: CanvasBounds;
  points?: readonly CanvasPoint[];
}

export interface OffscreenTutorialAnchor {
  x: number;
  y: number;
  direction: 'up' | 'right' | 'down' | 'left';
}

export function getOffscreenTutorialAnchor(
  target: CanvasBounds,
  canvas: CanvasBounds,
): OffscreenTutorialAnchor | null {
  const right = canvas.x + canvas.width;
  const bottom = canvas.y + canvas.height;
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  if (targetRight > canvas.x && target.x < right && targetBottom > canvas.y && target.y < bottom) {
    return null;
  }

  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const anchor = {
    x: Math.min(right, Math.max(canvas.x, targetCenter.x)),
    y: Math.min(bottom, Math.max(canvas.y, targetCenter.y)),
  };
  const horizontalDistance = Math.abs(targetCenter.x - anchor.x);
  const verticalDistance = Math.abs(targetCenter.y - anchor.y);
  const direction =
    horizontalDistance > verticalDistance
      ? targetCenter.x < anchor.x
        ? 'left'
        : 'right'
      : targetCenter.y < anchor.y
        ? 'up'
        : 'down';
  return { ...anchor, direction };
}

export function resolvePixiTutorialGeometry(
  highlight: TutorialHighlight,
  getNodeId: (alias: TutorialAlias) => string | null | undefined,
  space: 'graph' | 'screen' = 'screen',
): TutorialCanvasGeometry | null {
  const adapter = getCanvasAdapter();
  if (adapter?.canvasType !== 'pixi') return null;

  if (highlight.kind === 'node') {
    const nodeId = getNodeId(highlight.alias);
    const bounds = nodeId ? adapter.getNodeBounds(nodeId, space) : null;
    return bounds ? { bounds } : null;
  }

  if (highlight.kind === 'node-editor-button') {
    const nodeId = getNodeId(highlight.alias);
    const bounds = nodeId ? adapter.getControlBounds?.(nodeId, 'node-menu', space) : null;
    return bounds ? { bounds } : null;
  }

  if (highlight.kind === 'rect' || highlight.kind === 'handle') {
    const nodeId = getNodeId(highlight.alias);
    if (!nodeId) return null;
    const portId = buildHandleId(nodeId, highlight.side, highlight.index);
    const bounds =
      highlight.kind === 'rect'
        ? (adapter.getPortRowBounds?.(nodeId, portId, space) ?? null)
        : adapter.getPortBounds(nodeId, portId, space);
    return bounds ? { bounds } : null;
  }

  if (highlight.kind === 'edge') {
    const sourceNodeId = getNodeId(highlight.sourceAlias);
    const targetNodeId = getNodeId(highlight.targetAlias);
    if (!sourceNodeId || !targetNodeId) return null;
    const sourceHandle = buildHandleId(sourceNodeId, 'output', highlight.sourceIndex);
    const targetHandle = buildHandleId(targetNodeId, 'input', highlight.targetIndex);
    const edge = useFlowStore
      .getState()
      .edges.find(
        (item) =>
          !item.id.startsWith('proxy-') &&
          item.source === sourceNodeId &&
          item.sourceHandle === sourceHandle &&
          item.target === targetNodeId &&
          item.targetHandle === targetHandle,
      );
    if (!edge) return null;
    const flowState = useFlowStore.getState();
    const sourceNode = flowState.nodesMap.get(edge.source);
    const targetNode = flowState.nodesMap.get(edge.target);
    const sourceGroup =
      isRecipeNode(sourceNode) && sourceNode.data.groupId
        ? flowState.nodesMap.get(sourceNode.data.groupId)
        : undefined;
    const targetGroup =
      isRecipeNode(targetNode) && targetNode.data.groupId
        ? flowState.nodesMap.get(targetNode.data.groupId)
        : undefined;
    const sourceCollapsedGroup =
      isGroupNode(sourceGroup) && sourceGroup.data.collapsed ? sourceGroup.id : null;
    const targetCollapsedGroup =
      isGroupNode(targetGroup) && targetGroup.data.collapsed ? targetGroup.id : null;
    if (sourceCollapsedGroup && sourceCollapsedGroup === targetCollapsedGroup) return null;
    const geometry =
      sourceCollapsedGroup || targetCollapsedGroup
        ? (adapter.getEdgeGeometry(`proxy-${edge.id}`, space) ??
          adapter.getEdgeGeometry(edge.id, space))
        : adapter.getEdgeGeometry(edge.id, space);
    return geometry ? { bounds: geometry.bounds, points: geometry.points } : null;
  }

  if (highlight.kind === 'group') {
    const groupId = getNodeId(highlight.alias);
    if (!groupId) return null;
    if (highlight.part === 'bar') {
      const bounds = adapter.getGroupHeaderBounds?.(groupId, space);
      return bounds ? { bounds } : null;
    }
    if (highlight.part === 'edit') {
      const bounds = adapter.getControlBounds?.(groupId, 'group-menu', space);
      return bounds ? { bounds } : null;
    }
    if (highlight.part === 'expand') {
      const bounds = adapter.getControlBounds?.(groupId, 'group-expand', space);
      return bounds ? { bounds } : null;
    }
    const bounds = adapter.getNodeBounds(groupId, space);
    return bounds ? { bounds } : null;
  }

  return null;
}

export function getSecondaryTutorialHighlights(step: {
  secondaryHighlight?: TutorialHighlight;
  secondaryHighlights?: TutorialHighlight[];
}): TutorialHighlight[] {
  const highlights = step.secondaryHighlights ? [...step.secondaryHighlights] : [];
  if (step.secondaryHighlight) {
    highlights.unshift(step.secondaryHighlight);
  }
  return highlights;
}

export function isTutorialFlowHighlight(highlight: TutorialHighlight): boolean {
  return (
    highlight.kind === 'node' ||
    highlight.kind === 'node-editor-button' ||
    highlight.kind === 'rect' ||
    highlight.kind === 'handle' ||
    highlight.kind === 'edge' ||
    highlight.kind === 'group'
  );
}
