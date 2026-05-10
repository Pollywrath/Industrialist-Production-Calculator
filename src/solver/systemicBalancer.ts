import type { ReactFlowNode, ReactFlowEdge, NodeFlowResult } from './types';
import type { Recipe } from '../types/data';
import type { HandleRef } from '../types/nodes';
import { buildSolverGraph } from './graphBuilder';
import { calculateFlows } from './flowSolver';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';

function resolveQuantity(ref: HandleRef, recipe: Recipe | undefined): number {
  if (!recipe) return 0;
  const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[ref.index];
  return entry ? entry.quantity : 0;
}

const PHI = (Math.sqrt(5) - 1) / 2;

// ── Main Entry Point ─────────────────────────────────────────────────────────

export function calculateBalancedRate(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  flowResults: Map<string, NodeFlowResult>,
): number {
  // ── 1. Component Port Collection (BFS with pointer index) ──────────────────

  const adjacencyList = new Map<string, Array<{
    neighbor: { nodeId: string; side: 'input' | 'output'; index: number };
    edgeId: string;
  }>>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const srcHandle = edge.sourceHandle;
    const tgtHandle = edge.targetHandle;
    if (!srcHandle || !tgtHandle) continue;

    const srcParsed = parseHandleId(srcHandle);
    const tgtParsed = parseHandleId(tgtHandle);
    if (!srcParsed || !tgtParsed) continue;

    const srcPort = { nodeId: edge.source, side: 'output' as const, index: srcParsed.index };
    const tgtPort = { nodeId: edge.target, side: 'input' as const, index: tgtParsed.index };

    if (!adjacencyList.has(srcHandle)) adjacencyList.set(srcHandle, []);
    adjacencyList.get(srcHandle)!.push({ neighbor: tgtPort, edgeId: edge.id });

    if (!adjacencyList.has(tgtHandle)) adjacencyList.set(tgtHandle, []);
    adjacencyList.get(tgtHandle)!.push({ neighbor: srcPort, edgeId: edge.id });
  }

  const visited = new Set<string>();
  const componentNodeIds = new Set<string>();
  const componentEdgeIds = new Set<string>();
  const componentPorts: Array<{
    nodeId: string;
    side: 'input' | 'output';
    index: number;
  }> = [];
  const queue: Array<{
    nodeId: string;
    side: 'input' | 'output';
    index: number;
  }> = [{ nodeId, side: ref.side, index: ref.index }];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    const key = `${current.nodeId}-${current.side}-${current.index}`;
    if (visited.has(key)) continue;
    visited.add(key);

    componentPorts.push(current);
    componentNodeIds.add(current.nodeId);

    const currentHandleId = buildHandleId(current.nodeId, current.side, current.index);
    const connections = adjacencyList.get(currentHandleId);
    if (connections) {
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        componentEdgeIds.add(conn.edgeId);
        queue.push(conn.neighbor);
      }
    }
  }

  // ── 2. Topology Detection ──────────────────────────────────────────────────

  let isSimpleTopology = true;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!componentEdgeIds.has(edge.id)) continue;
    if (edge.source !== nodeId && edge.target !== nodeId) {
      isSimpleTopology = false;
      break;
    }
  }

  // ── 3. Solve ──────────────────────────────────────────────────────────────

  if (isSimpleTopology) {
    return solveAnalytically(nodeId, ref, recipe, edges, componentEdgeIds, flowResults);
  }

  return solveGoldenSection(
    nodeId, ref, recipe, nodes, edges, flowResults,
    componentNodeIds, componentEdgeIds, componentPorts,
  );
}

// ── Analytical Solver (simple topologies: single-edge, fan-in, fan-out) ──────

function solveAnalytically(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  edges: ReactFlowEdge[],
  componentEdgeIds: Set<string>,
  flowResults: Map<string, NodeFlowResult>,
): number {
  const cycleTime = recipe.cycle_time;
  const handleNeighborRates = new Map<string, number>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!componentEdgeIds.has(edge.id)) continue;
    if (!edge.sourceHandle || !edge.targetHandle) continue;

    if (edge.source === nodeId) {
      const srcParsed = parseHandleId(edge.sourceHandle);
      const tgtParsed = parseHandleId(edge.targetHandle);
      if (!srcParsed || !tgtParsed) continue;
      const handleKey = `output-${srcParsed.index}`;

      const neighborFlows = flowResults.get(edge.target);
      const neighborRate = neighborFlows?.inputFlows[tgtParsed.index]?.rate ?? 0;
      handleNeighborRates.set(handleKey, (handleNeighborRates.get(handleKey) ?? 0) + neighborRate);
    } else if (edge.target === nodeId) {
      const srcParsed = parseHandleId(edge.sourceHandle);
      const tgtParsed = parseHandleId(edge.targetHandle);
      if (!srcParsed || !tgtParsed) continue;
      const handleKey = `input-${tgtParsed.index}`;

      const neighborFlows = flowResults.get(edge.source);
      const neighborRate = neighborFlows?.outputFlows[srcParsed.index]?.rate ?? 0;
      handleNeighborRates.set(handleKey, (handleNeighborRates.get(handleKey) ?? 0) + neighborRate);
    }
  }

  if (handleNeighborRates.size <= 1) {
    const clickedKey = `${ref.side}-${ref.index}`;
    const neighborRate = handleNeighborRates.get(clickedKey) ?? 0;
    return Number(neighborRate.toFixed(8));
  }

  const breakpoints: Array<{ machineCount: number }> = [];

  for (const [handleKey, neighborRate] of handleNeighborRates) {
    const parts = handleKey.split('-');
    const side = parts[0] as 'input' | 'output';
    const index = parseInt(parts[1], 10);
    const list = side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[index];
    if (!entry || entry.quantity <= 0) continue;

    breakpoints.push({
      machineCount: (neighborRate * cycleTime) / entry.quantity,
    });
  }

  if (breakpoints.length === 0) return 0;

  let bestMachineCount = breakpoints[0].machineCount;
  let bestWaste = Infinity;

  for (let bp = 0; bp < breakpoints.length; bp++) {
    const m = breakpoints[bp].machineCount;
    let waste = 0;

    for (const [handleKey, neighborRate] of handleNeighborRates) {
      const parts = handleKey.split('-');
      const side = parts[0] as 'input' | 'output';
      const index = parseInt(parts[1], 10);
      const list = side === 'input' ? recipe.inputs : recipe.outputs;
      const entry = list[index];
      if (!entry) continue;

      const handleRate = (entry.quantity * m) / cycleTime;
      waste += Math.abs(handleRate - neighborRate);
    }

    if (waste < bestWaste) {
      bestWaste = waste;
      bestMachineCount = m;
    }
  }

  const q = resolveQuantity(ref, recipe);
  if (q <= 0) return 0;
  return Number(((bestMachineCount * q) / cycleTime).toFixed(8));
}

// ── Golden Section Search Solver (complex multi-path topologies) ─────────────

function solveGoldenSection(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  flowResults: Map<string, NodeFlowResult>,
  componentNodeIds: Set<string>,
  componentEdgeIds: Set<string>,
  componentPorts: Array<{ nodeId: string; side: 'input' | 'output'; index: number }>,
): number {
  const nodeFlows = flowResults.get(nodeId);
  const listFlows = ref.side === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
  const flowStatus = listFlows?.[ref.index];
  if (!flowStatus) return 0;

  let componentDeficiency = 0;
  let componentExcess = 0;

  for (let i = 0; i < componentPorts.length; i++) {
    const port = componentPorts[i];
    const portNodeFlows = flowResults.get(port.nodeId);
    const portListFlows =
      port.side === 'input' ? portNodeFlows?.inputFlows : portNodeFlows?.outputFlows;
    const status = portListFlows?.[port.index];
    if (!status) continue;

    const diff = Math.max(0, status.rate - status.connected);
    if (port.side === 'input') {
      componentDeficiency += diff;
    } else {
      componentExcess += diff;
    }
  }

  const localNodes = nodes.filter((n) => componentNodeIds.has(n.id));
  const localEdges = edges.filter((e) => componentEdgeIds.has(e.id));

  const targetNodeIndex = localNodes.findIndex((n) => n.id === nodeId);
  const trialNodes = localNodes.slice();
  const targetNodeTemplate = localNodes[targetNodeIndex];

  const cycleTime = recipe.cycle_time;
  const trialQ = resolveQuantity(ref, recipe);
  if (trialQ <= 0) return 0;

  const evaluateTrialMetric = (trialRate: number): number => {
    const trialMachineCount = (trialRate * cycleTime) / trialQ;

    trialNodes[targetNodeIndex] = {
      ...targetNodeTemplate,
      data: { ...targetNodeTemplate.data, machineCount: trialMachineCount },
    };

    const trialGraph = buildSolverGraph(trialNodes, localEdges);
    const trialResults = calculateFlows(trialGraph);

    let sumMetric = 0;
    for (let i = 0; i < componentPorts.length; i++) {
      const port = componentPorts[i];
      const trialNodeFlows = trialResults.get(port.nodeId);
      const trialPortListFlows =
        port.side === 'input' ? trialNodeFlows?.inputFlows : trialNodeFlows?.outputFlows;
      const status = trialPortListFlows?.[port.index];
      if (status) {
        sumMetric += Math.max(0, status.rate - status.connected);
      }
    }
    return sumMetric;
  };

  let a = 0;
  let b = (flowStatus.rate + componentExcess + componentDeficiency) * 1.2 + 1.0;

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

  const finalRate = (a + b) / 2;
  return Number(finalRate.toFixed(8));
}
