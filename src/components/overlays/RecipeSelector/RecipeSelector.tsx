import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { getRecipe, getProduct } from '../../../data/lookup';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { computeRecipeInsertion } from './graphInsertion';
import { SelectionStage } from './SelectionStage';
import { RecipeStage } from './RecipeStage';
import styles from './RecipeSelector.module.css';
import type { NodeFlowResult } from '../../../types/solver';
import { RecipeSelectorProvider } from './RecipeSelectorProvider';
import { useRecipeSelectorStore } from './RecipeSelectorContext';

function getClickedPerSecondRate(
  nodeId: string | null,
  sourceSide: 'input' | 'output' | null,
  productId: string | null,
  handleIndex: number | null,
  nodeData: { recipeId: string; machineCount: number } | null,
  nodeFlows: NodeFlowResult | undefined | null,
): number | null {
  if (!nodeId || !sourceSide || handleIndex === null || !nodeData) {
    return null;
  }
  const existingRecipe = nodeData.recipeId ? getRecipe(nodeData.recipeId) : null;
  if (!existingRecipe) return null;

  const existingMachineCount = nodeData.machineCount ?? 1;
  const list = sourceSide === 'input' ? existingRecipe.inputs : existingRecipe.outputs;
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
    : (clickedBaseQty / existingRecipe.cycle_time) * existingMachineCount;
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

  const preselectedNodeData = preselectedNode?.data || null;

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

  const effectiveProductId =
    preselectedProductId || (activeTab === 'product' ? selectedId : null);

  const derivedRate = getClickedPerSecondRate(
    preselectedNodeId,
    preselectedSourceSide,
    effectiveProductId,
    preselectedHandleIndex,
    preselectedNodeData,
    preselectedNodeFlows,
  );

  const clickedRateInfo = derivedRate !== null ? { clickedPerSecondRate: derivedRate } : null;

  const handleAddRecipe = (recipeId: string) => {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;

    const { nodes, edges } = useFlowStore.getState();

    const { newNode, nextEdges } = computeRecipeInsertion({
      recipe,
      preselectedNodeId,
      preselectedSourceSide,
      preselectedProductId: effectiveProductId,
      preselectedHandleIndex,
      derivedRate,
      nodes,
      edges,
      screenToFlowPosition,
    });

    const cleanNodes = nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const maxZ = cleanNodes.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0);
    newNode.zIndex = maxZ + 1;

    setNodesAndEdges([...cleanNodes, newNode], nextEdges);
    setRecipeSelectorOpen(false);
  };

  return createPortal(
    <div className={styles['recipe-selector-overlay']} onClick={() => setRecipeSelectorOpen(false)}>
      <div className={styles['recipe-selector-modal']} onClick={(e) => e.stopPropagation()}>
        {stage === 'select' ? (
          <SelectionStage inputRef={inputRef} />
        ) : (
          <RecipeStage
            clickedRateInfo={clickedRateInfo}
            preselectedSourceSide={preselectedSourceSide}
            preselectedProductId={effectiveProductId}
            onAddRecipe={handleAddRecipe}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
