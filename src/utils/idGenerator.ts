let _nodeSeq = 0;
let _edgeSeq = 0;

export function nextNodeId(): string {
  return `n-${Date.now().toString(36)}-${(_nodeSeq++).toString(36)}`;
}

export function nextEdgeId(): string {
  return `e-${Date.now().toString(36)}-${(_edgeSeq++).toString(36)}`;
}

export interface ParsedHandle {
  nodeId: string;
  side: 'input' | 'output';
  index: number;
}

export function buildHandleId(nodeId: string, side: 'input' | 'output', index: number): string {
  return `${nodeId}-${side}-${index}`;
}

export function parseHandleId(handleId: string): ParsedHandle {
  const parts = handleId.split('-');
  if (parts.length < 3) {
    throw new Error(`Invalid handle ID format: ${handleId}`);
  }

  const index = parseInt(parts[parts.length - 1], 10);
  const side = parts[parts.length - 2] as 'input' | 'output';
  const nodeId = parts.slice(0, -2).join('-');

  return { nodeId, side, index };
}
