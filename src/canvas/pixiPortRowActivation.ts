import { resolveActiveRecipe } from '../data/lookup';
import { useDataStore } from '../stores/useDataStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useFlowStore } from '../stores/useFlowStore';
import { isTutorialActive, canPerformTutorialAction } from '../stores/useTutorialStore';
import { useUIStore } from '../stores/useUIStore';
import { isRecipeNode } from '../types/nodes';
import { parseHandleId } from '../utils/idGenerator';

export function activatePixiPortRow(nodeId: string, portId: string): boolean {
  const parsed = parseHandleId(portId);
  if (!parsed || parsed.nodeId !== nodeId) return false;

  const tutorialEvent = {
    type: 'node-rect' as const,
    nodeId,
    side: parsed.side,
    index: parsed.index,
  };
  if (isTutorialActive() && !canPerformTutorialAction(tutorialEvent)) return false;

  const flowState = useFlowStore.getState();
  const node = flowState.nodesMap.get(nodeId);
  if (!isRecipeNode(node)) return false;
  const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, nodeId);
  if (!recipe) return false;

  const entries = parsed.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = entries[parsed.index];
  if (!entry) return false;

  const resultState = useFlowResultStore.getState();
  const isSolveFresh =
    resultState.graphVersion === flowState.graphVersion &&
    resultState.dataDbVersion === useDataStore.getState().dbVersion;
  const resolvedProduct = isSolveFresh ? resultState.resolvedProducts[portId] : undefined;
  const placeholder = entry.product_id === 'any_fluid' || entry.product_id === 'any_item';
  const productId =
    resolvedProduct && resolvedProduct !== 'any_fluid' && resolvedProduct !== 'any_item'
      ? resolvedProduct
      : placeholder
        ? null
        : entry.product_id;

  useUIStore.getState().setRecipeSelectorOpen(true, productId, parsed.side, nodeId, parsed.index);
  return true;
}
