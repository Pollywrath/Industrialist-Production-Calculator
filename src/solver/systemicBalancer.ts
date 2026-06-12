import type { NodeFlowResult, ReactFlowEdge, ReactFlowNode, SolverConnection } from '../types/solver';
import type { Recipe } from '../types/data';
import type { HandleRef } from '../types/nodes';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { solveFlowPipeline } from './solverPipeline';

const PHI = (Math.sqrt(5) - 1) / 2;

interface ComponentPortRef {
  nodeId: string;
  side: 'input' | 'output';
  index: number;
}

interface ComponentScope {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  ports: ComponentPortRef[];
  connections: SolverConnection[];
}

function resolvePortQuantity(recipe: Recipe, side: 'input' | 'output', index: number): number {
  const list = side === 'input' ? recipe.inputs : recipe.outputs;
  return list[index]?.quantity ?? 0;
}

function buildProductScopedComponent(
  nodeId: string,
  ref: HandleRef,
  edges: ReactFlowEdge[],
  resolvedProducts: Record<string, string>,
): ComponentScope | null {
  const clickedHandleId = buildHandleId(nodeId, ref.side, ref.index);
  const clickedProductId = resolvedProducts[clickedHandleId];
  if (!clickedProductId) return null;

  const adjacency = new Map<
    string,
    Array<{ neighborHandleId: string; edgeId: string; connection: SolverConnection }>
  >();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const sourceHandleId = edge.sourceHandle;
    const targetHandleId = edge.targetHandle;
    if (!sourceHandleId || !targetHandleId) continue;

    const sourceParsed = parseHandleId(sourceHandleId);
    const targetParsed = parseHandleId(targetHandleId);
    if (!sourceParsed || !targetParsed) continue;

    const edgeProductId = resolvedProducts[sourceHandleId] || resolvedProducts[targetHandleId];
    if (edgeProductId !== clickedProductId) continue;

    const connection: SolverConnection = {
      id: edge.id,
      sourceNodeId: edge.source,
      sourceOutputIndex: sourceParsed.index,
      sourceRate: 0,
      targetNodeId: edge.target,
      targetInputIndex: targetParsed.index,
      targetRate: 0,
    };

    const sourceAdjacency = adjacency.get(sourceHandleId) ?? [];
    sourceAdjacency.push({ neighborHandleId: targetHandleId, edgeId: edge.id, connection });
    adjacency.set(sourceHandleId, sourceAdjacency);

    const targetAdjacency = adjacency.get(targetHandleId) ?? [];
    targetAdjacency.push({ neighborHandleId: sourceHandleId, edgeId: edge.id, connection });
    adjacency.set(targetHandleId, targetAdjacency);
  }

  const visitedHandles = new Set<string>();
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const ports: ComponentPortRef[] = [];
  const connectionsById = new Map<string, SolverConnection>();
  const queue: string[] = [clickedHandleId];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const handleId = queue[queueIndex++];
    if (visitedHandles.has(handleId)) continue;
    visitedHandles.add(handleId);

    const parsed = parseHandleId(handleId);
    if (parsed) {
      nodeIds.add(parsed.nodeId);
      ports.push({ nodeId: parsed.nodeId, side: parsed.side, index: parsed.index });
    }

    const neighbors = adjacency.get(handleId);
    if (!neighbors) continue;
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      edgeIds.add(neighbor.edgeId);
      connectionsById.set(neighbor.edgeId, neighbor.connection);
      queue.push(neighbor.neighborHandleId);
    }
  }

  if (edgeIds.size === 0) return null;
  return { nodeIds, edgeIds, ports, connections: Array.from(connectionsById.values()) };
}

function getUnmet(flowResults: Map<string, NodeFlowResult>, port: ComponentPortRef): number {
  const nodeFlows = flowResults.get(port.nodeId);
  const flow =
    port.side === 'input' ? nodeFlows?.inputFlows[port.index] : nodeFlows?.outputFlows[port.index];
  return flow ? Math.max(0, flow.rate - flow.connected) : 0;
}

export function calculateBalancedRate(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  flowResults: Map<string, NodeFlowResult>,
  resolvedProducts: Record<string, string>,
  globalSettings?: Record<string, unknown>,
): number {
  const scope = buildProductScopedComponent(nodeId, ref, edges, resolvedProducts);
  if (!scope) return 0;

  let isSimpleTopology = true;
  for (let i = 0; i < scope.connections.length; i++) {
    const connection = scope.connections[i];
    if (connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId) {
      isSimpleTopology = false;
      break;
    }
  }

  if (isSimpleTopology) {
    return solveAnalytically(nodeId, ref, recipe, scope.connections, flowResults);
  }

  return solveGoldenSection(nodeId, ref, recipe, nodes, edges, flowResults, scope, globalSettings);
}

function solveAnalytically(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  connections: SolverConnection[],
  flowResults: Map<string, NodeFlowResult>,
): number {
  const cycleTime = recipe.cycle_time;
  const inputNeighborRates = new Map<number, number>();
  const outputNeighborRates = new Map<number, number>();

  for (let i = 0; i < connections.length; i++) {
    const connection = connections[i];
    if (connection.sourceNodeId === nodeId) {
      const neighborRate =
        flowResults.get(connection.targetNodeId)?.inputFlows[connection.targetInputIndex]?.rate ?? 0;
      outputNeighborRates.set(
        connection.sourceOutputIndex,
        (outputNeighborRates.get(connection.sourceOutputIndex) ?? 0) + neighborRate,
      );
    } else if (connection.targetNodeId === nodeId) {
      const neighborRate =
        flowResults.get(connection.sourceNodeId)?.outputFlows[connection.sourceOutputIndex]?.rate ?? 0;
      inputNeighborRates.set(
        connection.targetInputIndex,
        (inputNeighborRates.get(connection.targetInputIndex) ?? 0) + neighborRate,
      );
    }
  }

  if (inputNeighborRates.size + outputNeighborRates.size <= 1) {
    const singleRate =
      ref.side === 'input'
        ? (inputNeighborRates.get(ref.index) ?? 0)
        : (outputNeighborRates.get(ref.index) ?? 0);
    return Number(singleRate.toFixed(8));
  }

  const breakpoints: number[] = [];
  inputNeighborRates.forEach((neighborRate, index) => {
    const quantity = resolvePortQuantity(recipe, 'input', index);
    if (quantity > 0) breakpoints.push((neighborRate * cycleTime) / quantity);
  });
  outputNeighborRates.forEach((neighborRate, index) => {
    const quantity = resolvePortQuantity(recipe, 'output', index);
    if (quantity > 0) breakpoints.push((neighborRate * cycleTime) / quantity);
  });
  if (breakpoints.length === 0) return 0;

  let bestMachineCount = breakpoints[0];
  let bestWaste = Infinity;
  for (let i = 0; i < breakpoints.length; i++) {
    const machineCount = breakpoints[i];
    let waste = 0;

    inputNeighborRates.forEach((neighborRate, index) => {
      waste +=
        Math.abs((resolvePortQuantity(recipe, 'input', index) * machineCount) / cycleTime - neighborRate);
    });
    outputNeighborRates.forEach((neighborRate, index) => {
      waste +=
        Math.abs((resolvePortQuantity(recipe, 'output', index) * machineCount) / cycleTime - neighborRate);
    });

    if (waste < bestWaste) {
      bestWaste = waste;
      bestMachineCount = machineCount;
    }
  }

  const quantity = resolvePortQuantity(recipe, ref.side, ref.index);
  if (quantity <= 0) return 0;
  return Number(((bestMachineCount * quantity) / cycleTime).toFixed(8));
}

function solveGoldenSection(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  flowResults: Map<string, NodeFlowResult>,
  scope: ComponentScope,
  globalSettings?: Record<string, unknown>,
): number {
  const nodeFlows = flowResults.get(nodeId);
  const flowStatus = (ref.side === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows)?.[ref.index];
  if (!flowStatus) return 0;

  const localNodes = nodes.filter((node) => scope.nodeIds.has(node.id));
  const localEdges = edges.filter((edge) => scope.edgeIds.has(edge.id));
  const targetNodeIndex = localNodes.findIndex((node) => node.id === nodeId);
  if (targetNodeIndex < 0) return 0;

  const cycleTime = recipe.cycle_time;
  const trialQuantity = resolvePortQuantity(recipe, ref.side, ref.index);
  if (trialQuantity <= 0) return 0;

  let deficiency = 0;
  let excess = 0;
  for (let i = 0; i < scope.ports.length; i++) {
    const unmet = getUnmet(flowResults, scope.ports[i]);
    if (scope.ports[i].side === 'input') deficiency += unmet;
    else excess += unmet;
  }

  const targetNodeTemplate = localNodes[targetNodeIndex];
  const trialNodes = localNodes.slice();
  const evaluateTrialMetric = (trialRate: number): number => {
    trialNodes[targetNodeIndex] = {
      ...targetNodeTemplate,
      data: { ...targetNodeTemplate.data, machineCount: (trialRate * cycleTime) / trialQuantity },
    };

    const { results: trialResults } = solveFlowPipeline(trialNodes, localEdges, globalSettings);
    let unmet = 0;
    for (let i = 0; i < scope.ports.length; i++) {
      unmet += getUnmet(trialResults, scope.ports[i]);
    }
    return unmet;
  };

  let a = 0;
  let b = (flowStatus.rate + deficiency + excess) * 1.2 + 1.0;
  let x1 = b - PHI * (b - a);
  let x2 = a + PHI * (b - a);
  let f1 = evaluateTrialMetric(x1);
  let f2 = evaluateTrialMetric(x2);

  for (let iter = 0; iter < 40; iter++) {
    if (b - a < 1e-8) break;
    if (f1 <= f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - PHI * (b - a);
      f1 = evaluateTrialMetric(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + PHI * (b - a);
      f2 = evaluateTrialMetric(x2);
    }
  }

  return Number(((a + b) / 2).toFixed(8));
}

