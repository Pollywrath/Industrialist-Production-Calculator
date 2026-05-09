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

export function calculateBalancedRate(
  nodeId: string,
  ref: HandleRef,
  recipe: Recipe,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  flowResults: Map<string, NodeFlowResult>,
): number {
  // ── 1. Component Port Collection (BFS) ─────────────────────────────────────

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

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.nodeId}-${current.side}-${current.index}`;
    if (visited.has(key)) continue;
    visited.add(key);

    componentPorts.push(current);
    componentNodeIds.add(current.nodeId);

    const currentHandleId = buildHandleId(current.nodeId, current.side, current.index);

    for (const edge of edges) {
      if (edge.sourceHandle === currentHandleId) {
        componentEdgeIds.add(edge.id);
        const targetParsed = parseHandleId(edge.targetHandle!);
        queue.push({
          nodeId: edge.target,
          side: 'input',
          index: targetParsed.index,
        });
      } else if (edge.targetHandle === currentHandleId) {
        componentEdgeIds.add(edge.id);
        const sourceParsed = parseHandleId(edge.sourceHandle!);
        queue.push({
          nodeId: edge.source,
          side: 'output',
          index: sourceParsed.index,
        });
      }
    }
  }

  // ── 2. Network Excesses & Deficiencies ─────────────────────────────────────

  let componentDeficiency = 0;
  let componentExcess = 0;

  const nodeFlows = flowResults.get(nodeId);
  const listFlows = ref.side === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
  const flowStatus = listFlows?.[ref.index];
  if (!flowStatus) return 0;

  for (const port of componentPorts) {
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

  // ── 3. Disequilibrium Optimization (Ternary Search) ────────────────────────

  const localNodes = nodes.filter((n) => componentNodeIds.has(n.id));
  const localEdges = edges.filter((e) => componentEdgeIds.has(e.id));

  const evaluateTrialMetric = (trialRate: number) => {
    const trialQ = resolveQuantity(ref, recipe);
    const trialCycleTime = recipe.cycle_time;
    const trialMachineCount = (trialRate * trialCycleTime) / trialQ;

    const trialNodes = localNodes.map((n) => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: { ...n.data, machineCount: trialMachineCount },
        };
      }
      return n;
    });

    const trialGraph = buildSolverGraph(trialNodes, localEdges);
    const trialResults = calculateFlows(trialGraph);

    let sumMetric = 0;
    for (const port of componentPorts) {
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

  let low = 0;
  // Pad the upper bound so the target balanced rate is strictly inside the interval (never trapped on the boundary)
  let high = (flowStatus.rate + componentExcess + componentDeficiency) * 1.2 + 1.0;

  // Run 80 iterations to achieve absolute sub-picoflow precision down to JS floating-point limits
  for (let iter = 0; iter < 80; iter++) {
    const m1 = low + (high - low) / 3;
    const m2 = high - (high - low) / 3;
    if (evaluateTrialMetric(m1) <= evaluateTrialMetric(m2)) {
      high = m2;
    } else {
      low = m1;
    }
  }

  // Return the midpoint of the converged interval for maximum accuracy
  return (low + high) / 2;
}
