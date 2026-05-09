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

    const currentHandleId = buildHandleId(current.nodeId, current.side, current.index);

    for (const edge of edges) {
      if (edge.sourceHandle === currentHandleId) {
        const targetParsed = parseHandleId(edge.targetHandle!);
        queue.push({
          nodeId: edge.target,
          side: 'input',
          index: targetParsed.index,
        });
      } else if (edge.targetHandle === currentHandleId) {
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

  const evaluateTrialMetric = (trialRate: number) => {
    const trialQ = resolveQuantity(ref, recipe);
    const trialCycleTime = recipe.cycle_time;
    const trialMachineCount = (trialRate * trialCycleTime) / trialQ;

    const trialNodes = nodes.map((n) => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: { ...n.data, machineCount: trialMachineCount },
        };
      }
      return n;
    });

    const trialGraph = buildSolverGraph(trialNodes, edges);
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
  let high = flowStatus.rate + componentExcess + componentDeficiency;

  for (let iter = 0; iter < 40; iter++) {
    const m1 = low + (high - low) / 3;
    const m2 = high - (high - low) / 3;
    if (evaluateTrialMetric(m1) < evaluateTrialMetric(m2)) {
      high = m2;
    } else {
      low = m1;
    }
  }
  let targetRate = low;

  // ── 4. Candidate Sockets Snapping ──────────────────────────────────────────

  const candidateRates: number[] = [0];
  candidateRates.push(componentExcess);
  candidateRates.push(componentDeficiency);

  for (const port of componentPorts) {
    const pNodeFlows = flowResults.get(port.nodeId);
    const portListFlows = port.side === 'input' ? pNodeFlows?.inputFlows : pNodeFlows?.outputFlows;
    const status = portListFlows?.[port.index];
    if (status) {
      candidateRates.push(status.rate);
      candidateRates.push(status.connected);
      candidateRates.push(Math.abs(status.rate - status.connected));
    }
  }

  const q_target = resolveQuantity(ref, recipe);
  if (q_target > 0) {
    const baseRate = q_target / recipe.cycle_time;
    for (const multiplier of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12]) {
      candidateRates.push(multiplier * baseRate);
    }
  }

  let bestCandidate = targetRate;
  let bestCandidateDiff = Infinity;
  for (const cand of candidateRates) {
    const diff = Math.abs(targetRate - cand);
    if (diff < 1e-4 && diff < bestCandidateDiff) {
      bestCandidateDiff = diff;
      bestCandidate = cand;
    }
  }
  targetRate = bestCandidate;

  return targetRate;
}
