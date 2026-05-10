import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { getAllRecipes, getRecipe } from '../../../data/lookup';
import useControlStore from '../../../stores/useControlStore';
import useFlowStore from '../../../stores/useFlowStore';
import useFlowResultStore from '../../../stores/useFlowResultStore';
import { useRecipeSelectorFilters } from './useRecipeSelectorFilters';
import { computeRecipeInsertion } from './graphInsertion';
import SelectionStage from './SelectionStage';
import RecipeStage from './RecipeStage';
import styles from './RecipeSelector.module.css';
import type { NodeFlowResult } from '../../../solver/types';

function getClickedPerSecondRate(
  nodeId: string | null,
  sourceSide: 'input' | 'output' | null,
  productId: string | null,
  handleIndex: number | null,
  nodeData: { recipeId: string; machineCount: number } | null,
  nodeFlows: NodeFlowResult | undefined | null
): number | null {
  if (!nodeId || !sourceSide || !productId || handleIndex === null || !nodeData) {
    return null;
  }
  const existingRecipe = nodeData.recipeId ? getRecipe(nodeData.recipeId) : null;
  if (!existingRecipe) return null;

  const existingMachineCount = nodeData.machineCount ?? 1;
  const list = sourceSide === 'input' ? existingRecipe.inputs : existingRecipe.outputs;
  const entry = list[handleIndex];
  if (!entry || entry.product_id !== productId) return null;

  const clickedBaseQty = entry.quantity;
  const listFlows = sourceSide === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
  const flowStatus = listFlows?.[handleIndex];

  return flowStatus
    ? Math.max(0, flowStatus.rate - flowStatus.connected)
    : (clickedBaseQty / existingRecipe.cycle_time) * existingMachineCount;
}

export default function RecipeSelector() {
  const isRecipeSelectorOpen = useControlStore((s) => s.isRecipeSelectorOpen);
  if (!isRecipeSelectorOpen) return null;
  return <RecipeSelectorModal />;
}

function RecipeSelectorModal() {
  const setRecipeSelectorOpen = useControlStore((s) => s.setRecipeSelectorOpen);
  const preselectedProductId = useControlStore((s) => s.preselectedProductId);
  const preselectedSourceSide = useControlStore((s) => s.preselectedSourceSide);
  const preselectedNodeId = useControlStore((s) => s.preselectedNodeId);
  const preselectedHandleIndex = useControlStore((s) => s.preselectedHandleIndex);
  const rateMode = useControlStore((s) => s.rateMode);

  const preselectedNode = useFlowStore((s) => {
    if (!preselectedNodeId) return null;
    return s.nodesMap.get(preselectedNodeId) || null;
  });

  const preselectedNodeData = preselectedNode
    ? {
      recipeId: preselectedNode.data?.recipeId,
      machineCount: preselectedNode.data?.machineCount,
    }
    : null;

  const preselectedNodeFlows = useFlowResultStore((s) => {
    if (!preselectedNodeId) return undefined;
    return s.results.get(preselectedNodeId);
  });

  const { screenToFlowPosition } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const staticRecipes = getAllRecipes();

  const filters = useRecipeSelectorFilters({
    recipes: staticRecipes,
    preselectedProductId,
    preselectedSourceSide,
  });

  useEffect(() => {
    if (inputRef.current && filters.stage === 'select') {
      inputRef.current.focus();
    }
  }, [filters.activeTab, filters.stage]);

  const derivedRate = getClickedPerSecondRate(
    preselectedNodeId,
    preselectedSourceSide,
    preselectedProductId,
    preselectedHandleIndex,
    preselectedNodeData,
    preselectedNodeFlows,
  );

  const clickedRateInfo = derivedRate !== null ? { clickedPerSecondRate: derivedRate } : null;

  const handleAddRecipe = (recipeId: string) => {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;

    const flowStore = useFlowStore.getState();

    const { newNode, nextEdges } = computeRecipeInsertion({
      recipe,
      preselectedNodeId,
      preselectedSourceSide,
      preselectedProductId,
      preselectedHandleIndex,
      derivedRate,
      nodes: flowStore.nodes,
      edges: flowStore.edges,
      screenToFlowPosition,
    });

    const cleanNodes = flowStore.nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const maxZ = cleanNodes.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0);
    newNode.zIndex = maxZ + 1;

    flowStore.setNodesAndEdges([...cleanNodes, newNode], nextEdges);
    setRecipeSelectorOpen(false);
  };

  return createPortal(
    <div className={styles['recipe-selector-overlay']} onClick={() => setRecipeSelectorOpen(false)}>
      <div className={styles['recipe-selector-modal']} onClick={(e) => e.stopPropagation()}>
        {filters.stage === 'select' ? (
          <SelectionStage inputRef={inputRef} />
        ) : (
          <RecipeStage
            activeTab={filters.activeTab}
            selectedId={filters.selectedId}
            filterProducers={filters.filterProducers}
            setFilterProducers={filters.setFilterProducers}
            filterConsumers={filters.filterConsumers}
            setFilterConsumers={filters.setFilterConsumers}
            matchingRecipes={filters.matchingRecipes}
            rateMode={rateMode}
            clickedRateInfo={clickedRateInfo}
            preselectedSourceSide={preselectedSourceSide}
            preselectedProductId={preselectedProductId}
            onBack={filters.handleBack}
            onClose={() => setRecipeSelectorOpen(false)}
            onAddRecipe={handleAddRecipe}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
