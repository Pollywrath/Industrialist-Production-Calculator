import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { resolveActiveRecipe, getProduct } from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { computeRecipeInsertion } from './graphInsertion';
import { SelectionStage } from './SelectionStage';
import { RecipeStage } from './RecipeStage';
import styles from './RecipeSelector.module.css';
import type { NodeFlowResult } from '../../../types/solver';
import type { HandleDataType, Recipe } from '../../../types/data';
import { RecipeSelectorProvider } from './RecipeSelectorProvider';
import { useRecipeSelectorStore } from './RecipeSelectorContext';
import { createGraphResolutionContext } from '../../../utils/graphResolutionContext';
import { isRecipeNode } from '../../../types/nodes';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../../stores/useTutorialStore';

function getClickedPerSecondRate(
  sourceSide: 'input' | 'output' | null,
  productId: string | null,
  handleIndex: number | null,
  recipe: Recipe | undefined,
  machineCount: number,
  nodeFlows: NodeFlowResult | undefined | null,
): number | null {
  if (!sourceSide || handleIndex === null || !recipe) {
    return null;
  }
  const existingMachineCount = machineCount ?? 1;
  const list = sourceSide === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[handleIndex];
  if (!entry) return null;

  const isEntryPlaceholder = entry.product_id === 'any_fluid' || entry.product_id === 'any_item';
  if (!isEntryPlaceholder) {
    if (entry.product_id !== productId) return null;
  } else if (productId) {
    const entryProd = getProduct(entry.product_id);
    const clickedProd = getProduct(productId);
    if (entryProd?.type !== clickedProd?.type) return null;
  }

  const clickedBaseQty = entry.quantity;
  const listFlows = sourceSide === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
  const flowStatus = listFlows?.[handleIndex];

  return flowStatus
    ? Math.max(0, flowStatus.rate - flowStatus.connected)
    : (clickedBaseQty / recipe.cycle_time) * existingMachineCount;
}

export function RecipeSelector() {
  const isRecipeSelectorOpen = useUIStore((s) => s.isRecipeSelectorOpen);
  const preselectedProductId = useUIStore((s) => s.preselectedProductId);
  const preselectedSourceSide = useUIStore((s) => s.preselectedSourceSide);

  if (!isRecipeSelectorOpen) return null;

  return (
    <RecipeSelectorProvider
      preselectedProductId={preselectedProductId}
      preselectedSourceSide={preselectedSourceSide}
    >
      <RecipeSelectorModal />
    </RecipeSelectorProvider>
  );
}

function RecipeSelectorModal() {
  const setRecipeSelectorOpen = useUIStore((s) => s.setRecipeSelectorOpen);
  const preselectedProductId = useUIStore((s) => s.preselectedProductId);
  const preselectedSourceSide = useUIStore((s) => s.preselectedSourceSide);
  const preselectedNodeId = useUIStore((s) => s.preselectedNodeId);
  const preselectedHandleIndex = useUIStore((s) => s.preselectedHandleIndex);
  const setNodesAndEdges = useFlowStore((s) => s.setNodesAndEdges);

  const preselectedNode = useFlowStore((s) => {
    if (!preselectedNodeId) return null;
    return s.nodesMap.get(preselectedNodeId) || null;
  });

  const preselectedRecipeNode = isRecipeNode(preselectedNode) ? preselectedNode : null;
  const preselectedNodeData = preselectedRecipeNode?.data || null;
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const recipeNodes = nodes.filter(isRecipeNode);
  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const recipeEdges = edges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );
  const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);

  const preselectedNodeFlows = useFlowResultStore((s) => {
    if (!preselectedNodeId) return undefined;
    return s.results.get(preselectedNodeId);
  });

  const { screenToFlowPosition } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const stage = useRecipeSelectorStore((s) => s.stage);
  const activeTab = useRecipeSelectorStore((s) => s.activeTab);
  const selectedId = useRecipeSelectorStore((s) => s.selectedId);

  useEffect(() => {
    if (inputRef.current && stage === 'select') {
      inputRef.current.focus();
    }
  }, [activeTab, stage]);

  const effectiveProductId = preselectedProductId || (activeTab === 'product' ? selectedId : null);
  const preselectedHandleType: HandleDataType | '' | null =
    preselectedNodeId && preselectedSourceSide && preselectedHandleIndex !== null
      ? resolutionContext
          .createHelpers(preselectedNodeId)
          .resolveHandleType(preselectedSourceSide, preselectedHandleIndex)
      : null;

  const preselectedRecipe =
    preselectedNodeId && preselectedNodeData
      ? resolveActiveRecipe(
          preselectedNodeData.recipeId,
          preselectedNodeData.settings,
          preselectedNodeId,
          resolutionContext.createHelpers(preselectedNodeId),
        )
      : undefined;

  const derivedRate = getClickedPerSecondRate(
    preselectedSourceSide,
    effectiveProductId,
    preselectedHandleIndex,
    preselectedRecipe,
    preselectedNodeData?.machineCount ?? 1,
    preselectedNodeFlows,
  );

  const clickedRateInfo = derivedRate !== null ? { clickedPerSecondRate: derivedRate } : null;

  const handleAddRecipe = (recipeId: string) => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'selector-recipe', recipeId })
    ) {
      return;
    }

    const defaultRecipe = resolveActiveRecipe(recipeId);
    if (!defaultRecipe) return;

    const { nodes, edges } = useFlowStore.getState();

    let resolvedSettings: Record<string, unknown> | undefined;
    if (effectiveProductId) {
      const sr = getSpecialRecipe(recipeId);
      if (sr && sr.resolveSettings) {
        const customSettings = sr.resolveSettings(effectiveProductId);
        if (customSettings) {
          resolvedSettings = customSettings;
        }
      }
    }

    const recipe = resolvedSettings
      ? (resolveActiveRecipe(recipeId, resolvedSettings) ?? defaultRecipe)
      : defaultRecipe;

    const { newNode, nextEdges } = computeRecipeInsertion({
      recipe,
      preselectedNodeId,
      preselectedSourceSide,
      preselectedProductId: effectiveProductId,
      preselectedHandleType,
      preselectedHandleIndex,
      derivedRate,
      nodes,
      edges,
      screenToFlowPosition,
      resolvedSettings,
    });

    const cleanNodes = nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const maxZ = cleanNodes.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0);
    newNode.zIndex = maxZ + 1;

    setNodesAndEdges([...cleanNodes, newNode], nextEdges);
    setRecipeSelectorOpen(false);
    completeTutorialAction({
      type: 'selector-recipe',
      recipeId,
      nodeId: newNode.id,
    });
  };

  return createPortal(
    <div
      className={styles['recipe-selector-overlay']}
      onClick={() => {
        if (isTutorialActive()) return;
        setRecipeSelectorOpen(false);
      }}
    >
      <div className={styles['recipe-selector-modal']} onClick={(e) => e.stopPropagation()}>
        {stage === 'select' ? (
          <SelectionStage inputRef={inputRef} />
        ) : (
          <RecipeStage
            clickedRateInfo={clickedRateInfo}
            preselectedSourceSide={preselectedSourceSide}
            preselectedProductId={effectiveProductId}
            preselectedHandleType={preselectedHandleType}
            onAddRecipe={handleAddRecipe}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
