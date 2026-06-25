import type { TutorialHighlight } from '../../tutorials/types';
import type { TutorialAlias } from '../../tutorials/types';
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
    highlight.kind === 'rect' ||
    highlight.kind === 'handle' ||
    highlight.kind === 'edge' ||
    highlight.kind === 'group'
  );
}
