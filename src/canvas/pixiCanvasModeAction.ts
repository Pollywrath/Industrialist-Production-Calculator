import { isRecipeNode } from '../types/nodes';
import { useFlowStore } from '../stores/useFlowStore';
import { getEffectiveToggleId, useUIStore } from '../stores/useUIStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../stores/useTutorialStore';
import { parseHandleId } from '../utils/idGenerator';
import type { TutorialActionEvent } from '../tutorials/types';
import type { CanvasActionDecision } from './pixiEngine/canvas/interaction/action-proposal';

export type CanvasModeTarget = (
  | { readonly type: 'node'; readonly nodeId: string; readonly phase?: 'down' | 'click' }
  | { readonly type: 'group'; readonly groupId: string }
  | { readonly type: 'edge'; readonly edgeId: string }
  | { readonly type: 'port'; readonly nodeId: string; readonly portId: string }
) & { readonly altKey?: boolean };

function tutorialEventForModeTarget(
  target: CanvasModeTarget,
  mode: string | null,
): TutorialActionEvent | null {
  if (target.type !== 'node' && target.type !== 'port') return null;
  if (mode === 'target') return { type: 'target-node', nodeId: target.nodeId };
  if (mode === 'multi_select') return { type: 'node-multi-select', nodeId: target.nodeId };
  return null;
}

export function applyPixiCanvasModeAction(target: CanvasModeTarget): CanvasActionDecision {
  const mode = getEffectiveToggleId(useUIStore.getState());
  const tutorialActive = isTutorialActive();
  const tutorialEvent = tutorialEventForModeTarget(target, mode);
  if (tutorialActive && (!tutorialEvent || !canPerformTutorialAction(tutorialEvent))) {
    return {
      status: 'cancelled',
      reason: 'The current tutorial step does not authorize this action.',
    };
  }
  if (!mode && !target.altKey) return { status: 'ignored' };

  const flow = useFlowStore.getState();
  if (mode === 'delete_mode' || target.altKey) {
    if (target.type === 'edge') {
      const edge = flow.edges.find((item) => item.id === target.edgeId);
      if (!edge || edge.id.startsWith('proxy-')) return { status: 'unchanged' };
      flow.onEdgesChange([{ id: edge.id, type: 'remove' }]);
      return { status: 'committed', id: edge.id };
    }
    if (target.type === 'port') {
      const node = flow.nodesMap.get(target.nodeId);
      const port = parseHandleId(target.portId);
      if (!isRecipeNode(node) || !port || port.nodeId !== node.id) return { status: 'unchanged' };
      const previousEdges = flow.edges;
      flow.deleteEdgesConnectedToHandle(target.portId);
      return useFlowStore.getState().edges === previousEdges
        ? { status: 'unchanged' }
        : { status: 'committed', id: target.portId };
    }

    const nodeId = target.type === 'group' ? target.groupId : target.nodeId;
    if (!flow.nodesMap.has(nodeId)) return { status: 'unchanged' };
    flow.deleteNode(nodeId);
    return useFlowStore.getState().nodesMap.has(nodeId)
      ? { status: 'rejected', reason: 'The app rejected the delete action.' }
      : { status: 'committed', id: nodeId };
  }

  if (mode === 'multi_select') {
    if (target.type !== 'node' && target.type !== 'port') return { status: 'ignored' };
    const node = flow.nodesMap.get(target.nodeId);
    if (!isRecipeNode(node) || node.data.groupId) return { status: 'ignored' };
    if (target.type === 'node' && target.phase === 'down' && node.data.isMultiSelected) {
      return { status: 'ignored' };
    }
    flow.toggleNodeSelection(node.id);
    const nextNode = useFlowStore.getState().nodesMap.get(node.id);
    if (!isRecipeNode(nextNode) || nextNode.data.isMultiSelected === node.data.isMultiSelected) {
      return { status: 'rejected', reason: 'The app rejected the selection action.' };
    }
    if (tutorialActive) {
      const nodeIds = useFlowStore
        .getState()
        .nodes.filter((item) => isRecipeNode(item) && item.data.isMultiSelected)
        .map((item) => item.id);
      completeTutorialAction({ type: 'node-multi-select', nodeIds });
    }
    return { status: 'committed', id: node.id };
  }

  if (target.type !== 'node' && target.type !== 'port') return { status: 'ignored' };
  const node = flow.nodesMap.get(target.nodeId);
  if (!isRecipeNode(node)) return { status: 'ignored' };
  const nextValue = !node.data.isTarget;
  flow.updateNodeData(node.id, { isTarget: nextValue });
  const nextNode = useFlowStore.getState().nodesMap.get(node.id);
  if (!isRecipeNode(nextNode) || nextNode.data.isTarget !== nextValue) {
    return { status: 'rejected', reason: 'The app rejected the target action.' };
  }
  if (tutorialActive) completeTutorialAction({ type: 'target-node', nodeId: node.id });
  return { status: 'committed', id: node.id };
}
