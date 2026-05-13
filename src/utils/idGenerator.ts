let _nodeSeq = 0;
let _edgeSeq = 0;
let _saveSeq = 0;

export function nextNodeId(): string {
  const seq = _nodeSeq++;
  return `n-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function nextEdgeId(): string {
  const seq = _edgeSeq++;
  return `e-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function nextSaveId(): string {
  const seq = _saveSeq++;
  return `save-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export interface ParsedHandle {
  nodeId: string;
  side: 'input' | 'output';
  index: number;
}

export function buildHandleId(nodeId: string, side: 'input' | 'output', index: number): string {
  return `${nodeId}-${side}-${index}`;
}

export function parseHandleId(handleId: string): ParsedHandle | null {
  const parts = handleId.split('-');
  if (parts.length < 3) {
    return null;
  }

  const index = parseInt(parts[parts.length - 1], 10);
  if (isNaN(index)) {
    return null;
  }

  const side = parts[parts.length - 2];
  if (side !== 'input' && side !== 'output') {
    return null;
  }

  const nodeId = parts.slice(0, -2).join('-');

  return { nodeId, side, index };
}
