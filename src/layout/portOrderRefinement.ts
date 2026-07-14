import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { getEdgeAnchors } from './materialize';
import type { LayoutEdgeSpec, MaterializedLayoutPass, PortOrderRefinement } from './types';

export function arePortOrdersEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function addPortNeighborY(
  neighborYsByHandleId: Map<string, number[]>,
  handleId: string,
  y: number,
): void {
  const values = neighborYsByHandleId.get(handleId);
  if (values) {
    values.push(y);
  } else {
    neighborYsByHandleId.set(handleId, [y]);
  }
}

function getLayoutEdgeHandleIds(edge: LayoutEdgeSpec): {
  sourceHandle: string;
  targetHandle: string;
} {
  return {
    sourceHandle: edge.sourceHandle ?? buildHandleId(edge.source, 'output', 0),
    targetHandle: edge.targetHandle ?? buildHandleId(edge.target, 'input', 0),
  };
}

function collectPortNeighborYs(
  layoutEdges: LayoutEdgeSpec[],
  pass: MaterializedLayoutPass,
): Map<string, number[]> {
  const neighborYsByHandleId = new Map<string, number[]>();

  for (let i = 0; i < layoutEdges.length; i++) {
    const edge = layoutEdges[i];
    if (edge.source === edge.target) continue;

    const { sourceHandle, targetHandle } = getLayoutEdgeHandleIds(edge);
    const sourceParsed = parseHandleId(sourceHandle);
    const targetParsed = parseHandleId(targetHandle);
    if (
      !sourceParsed ||
      !targetParsed ||
      sourceParsed.side !== 'output' ||
      targetParsed.side !== 'input'
    ) {
      continue;
    }

    const anchors = getEdgeAnchors(
      edge,
      pass.nodeMap,
      pass.positions,
      pass.dimensions,
      pass.inputOrders,
      pass.outputOrders,
    );
    if (!anchors || anchors.targetX <= anchors.sourceX) continue;

    addPortNeighborY(neighborYsByHandleId, sourceHandle, anchors.targetY);
    addPortNeighborY(neighborYsByHandleId, targetHandle, anchors.sourceY);
  }

  return neighborYsByHandleId;
}

function getMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function countPortOrderInversions(
  nodeId: string,
  side: 'input' | 'output',
  order: number[],
  neighborYsByHandleId: Map<string, number[]>,
): number {
  const orderedNeighborYs: number[] = [];

  for (let i = 0; i < order.length; i++) {
    const handleIndex = order[i];
    const values = neighborYsByHandleId.get(buildHandleId(nodeId, side, handleIndex));
    if (!values || values.length === 0) continue;
    orderedNeighborYs.push(getMedian(values));
  }

  let inversions = 0;
  for (let i = 0; i < orderedNeighborYs.length; i++) {
    for (let j = i + 1; j < orderedNeighborYs.length; j++) {
      if (orderedNeighborYs[i] > orderedNeighborYs[j]) {
        inversions++;
      }
    }
  }

  return inversions;
}

export function scorePortOrders(
  pass: MaterializedLayoutPass,
  layoutEdges: LayoutEdgeSpec[],
): number {
  const neighborYsByHandleId = collectPortNeighborYs(layoutEdges, pass);

  let score = 0;
  for (let i = 0; i < pass.layoutNodes.length; i++) {
    const node = pass.layoutNodes[i];
    if (!node.commitPortOrder) continue;

    score += countPortOrderInversions(
      node.id,
      'input',
      pass.inputOrders.get(node.id) ?? node.inputOrder,
      neighborYsByHandleId,
    );
    score += countPortOrderInversions(
      node.id,
      'output',
      pass.outputOrders.get(node.id) ?? node.outputOrder,
      neighborYsByHandleId,
    );
  }

  return score;
}

function refineSidePortOrder(
  nodeId: string,
  side: 'input' | 'output',
  currentOrder: number[],
  neighborYsByHandleId: Map<string, number[]>,
): number[] {
  const connectedHandles: Array<{
    handleIndex: number;
    displayIndex: number;
    neighborY: number;
  }> = [];

  for (let displayIndex = 0; displayIndex < currentOrder.length; displayIndex++) {
    const handleIndex = currentOrder[displayIndex];
    const values = neighborYsByHandleId.get(buildHandleId(nodeId, side, handleIndex));
    if (!values || values.length === 0) continue;
    connectedHandles.push({
      handleIndex,
      displayIndex,
      neighborY: getMedian(values),
    });
  }

  if (connectedHandles.length < 2) return currentOrder;

  const connectedSlots = connectedHandles
    .map((handle) => handle.displayIndex)
    .sort((a, b) => a - b);
  const sortedHandles = connectedHandles
    .slice()
    .sort(
      (a, b) =>
        a.neighborY - b.neighborY ||
        a.displayIndex - b.displayIndex ||
        a.handleIndex - b.handleIndex,
    );
  const candidate = currentOrder.slice();

  for (let i = 0; i < connectedSlots.length; i++) {
    candidate[connectedSlots[i]] = sortedHandles[i].handleIndex;
  }

  const currentScore = countPortOrderInversions(nodeId, side, currentOrder, neighborYsByHandleId);
  const candidateScore = countPortOrderInversions(nodeId, side, candidate, neighborYsByHandleId);

  if (candidateScore >= currentScore || arePortOrdersEqual(candidate, currentOrder)) {
    return currentOrder;
  }

  return candidate;
}

export function collectRefinedPortOrders(
  pass: MaterializedLayoutPass,
  layoutEdges: LayoutEdgeSpec[],
): PortOrderRefinement {
  const neighborYsByHandleId = collectPortNeighborYs(layoutEdges, pass);
  const inputOrders = new Map<string, number[]>();
  const outputOrders = new Map<string, number[]>();
  let changed = false;

  for (let i = 0; i < pass.layoutNodes.length; i++) {
    const node = pass.layoutNodes[i];
    if (!node.commitPortOrder) continue;

    const currentInputOrder = pass.inputOrders.get(node.id) ?? node.inputOrder;
    const currentOutputOrder = pass.outputOrders.get(node.id) ?? node.outputOrder;
    const inputOrder = refineSidePortOrder(
      node.id,
      'input',
      currentInputOrder,
      neighborYsByHandleId,
    );
    const outputOrder = refineSidePortOrder(
      node.id,
      'output',
      currentOutputOrder,
      neighborYsByHandleId,
    );

    inputOrders.set(node.id, inputOrder);
    outputOrders.set(node.id, outputOrder);
    changed =
      changed ||
      !arePortOrdersEqual(inputOrder, currentInputOrder) ||
      !arePortOrdersEqual(outputOrder, currentOutputOrder);
  }

  return { inputOrders, outputOrders, changed };
}
