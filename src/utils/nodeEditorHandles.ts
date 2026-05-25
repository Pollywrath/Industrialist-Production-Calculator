import type { Edge } from '@xyflow/react';
import { buildHandleId, parseHandleId } from './idGenerator';

export function clampHandleOrder(order: number[], handleCount: number): number[] {
  const clamped = order.filter((idx) => idx >= 0 && idx < handleCount);
  for (let i = 0; i < handleCount; i++) {
    if (!clamped.includes(i)) {
      clamped.push(i);
    }
  }
  return clamped;
}

export function getRemovedHandleIndices(originalOrder: number[], clampedOrder: number[]): number[] {
  const clampedSet = new Set(clampedOrder);
  return [...new Set(originalOrder.filter((idx) => !clampedSet.has(idx)))];
}

export function getStaleHandleIndicesFromEdges(
  nodeId: string,
  side: 'input' | 'output',
  handleCount: number,
  edges: Edge[],
): number[] {
  const stale = new Set<number>();
  for (const edge of edges) {
    const handleId = side === 'input' ? edge.targetHandle : edge.sourceHandle;
    if (!handleId) continue;
    const parsed = parseHandleId(handleId);
    if (parsed?.nodeId === nodeId && parsed.side === side && parsed.index >= handleCount) {
      stale.add(parsed.index);
    }
  }
  return [...stale];
}

export function collectStaleHandleIndices(
  originalOrder: number[],
  clampedOrder: number[],
  nodeId: string,
  side: 'input' | 'output',
  handleCount: number,
  edges: Edge[],
): number[] {
  return [
    ...new Set([
      ...getRemovedHandleIndices(originalOrder, clampedOrder),
      ...getStaleHandleIndicesFromEdges(nodeId, side, handleCount, edges),
    ]),
  ];
}

export function buildStaleHandleIds(
  nodeId: string,
  side: 'input' | 'output',
  indices: number[],
): string[] {
  return indices.map((idx) => buildHandleId(nodeId, side, idx));
}
