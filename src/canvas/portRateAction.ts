import { calculateBalancedRate } from '../solver/systemicBalancer';
import { useDataStore } from '../stores/useDataStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useFlowStore } from '../stores/useFlowStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { isRecipeNode, type HandleRef } from '../types/nodes';
import { buildHandleId } from '../utils/idGenerator';
import { constrainMachineCount } from '../utils/machineCountConstraint';
import { calculateMachineCountFromRate } from '../utils/recipeComputation';

export function applyConnectedPortRate(nodeId: string, ref: HandleRef): boolean {
  const flow = useFlowStore.getState();
  const result = useFlowResultStore.getState();
  if (
    result.graphVersion !== flow.graphVersion ||
    result.dataDbVersion !== useDataStore.getState().dbVersion
  ) {
    return false;
  }

  const recipe = result.nodeRecipes[nodeId];
  const node = flow.nodesMap.get(nodeId);
  if (!recipe || !isRecipeNode(node) || node.data.machineCountConstraint?.kind === 'locked') {
    return false;
  }

  const entries = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = entries[ref.index];
  if (!entry || entry.quantity <= 0) return false;

  const recipeNodes = flow.nodes.filter(isRecipeNode);
  const recipeNodeIds = new Set(recipeNodes.map((recipeNode) => recipeNode.id));
  const recipeEdges = flow.edges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );
  const handleId = buildHandleId(nodeId, ref.side, ref.index);
  if (
    !recipeEdges.some((edge) => edge.sourceHandle === handleId || edge.targetHandle === handleId)
  ) {
    return false;
  }

  const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
  const balancedRate = calculateBalancedRate(
    nodeId,
    ref,
    recipe,
    recipeNodes,
    recipeEdges,
    result.results,
    result.resolvedProducts,
    globalSettings,
  );
  const machineCount = constrainMachineCount(
    node.data,
    calculateMachineCountFromRate(balancedRate, recipe.cycle_time, entry.quantity),
  );
  useFlowStore.getState().updateNodeData(nodeId, { machineCount });
  return true;
}
