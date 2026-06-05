import type { Edge, Node } from '@xyflow/react';

export interface PositionSnapshot {
  x: number;
  y: number;
}

export interface NodeHistoryDiff<NodeType extends Node = Node> {
  type: 'add' | 'remove' | 'update';
  id: string;
  before?: NodeType;
  after?: NodeType;
}

export interface EdgeHistoryDiff<EdgeType extends Edge = Edge> {
  type: 'add' | 'remove' | 'update';
  id: string;
  before?: EdgeType;
  after?: EdgeType;
}

export interface GraphHistoryEntry<NodeType extends Node = Node, EdgeType extends Edge = Edge> {
  kind: 'graph';
  nodeDiffs: NodeHistoryDiff<NodeType>[];
  edgeDiffs: EdgeHistoryDiff<EdgeType>[];
  nodeOrderBefore: string[];
  nodeOrderAfter: string[];
  edgeOrderBefore: string[];
  edgeOrderAfter: string[];
}

export interface PositionHistoryEntry {
  kind: 'position';
  positions: Array<{
    id: string;
    from: PositionSnapshot;
    to: PositionSnapshot;
  }>;
}

export type HistoryEntry<NodeType extends Node = Node, EdgeType extends Edge = Edge> =
  | GraphHistoryEntry<NodeType, EdgeType>
  | PositionHistoryEntry;

export function createNodeMap<NodeType extends Node>(nodes: NodeType[]): Map<string, NodeType> {
  const map = new Map<string, NodeType>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    map.set(node.id, node);
  }
  return map;
}

export function createEdgeMap<EdgeType extends Edge>(edges: EdgeType[]): Map<string, EdgeType> {
  const map = new Map<string, EdgeType>();
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    map.set(edge.id, edge);
  }
  return map;
}

export function toPositionSnapshot(position: { x: number; y: number }): PositionSnapshot {
  return {
    x: position.x,
    y: position.y,
  };
}

export function arePositionsEqual(a: PositionSnapshot, b: PositionSnapshot): boolean {
  return a.x === b.x && a.y === b.y;
}

function sanitizeNodesForHistory<NodeType extends Node>(nodes: NodeType[]): NodeType[] {
  return nodes.map((node) => {
    if (node.type === 'group' && node.data) {
      return {
        ...node,
        data: {
          ...node.data,
          handlesReady: false,
        },
      };
    }
    return node;
  });
}

export function buildGraphHistoryEntry<NodeType extends Node, EdgeType extends Edge>(
  beforeNodes: NodeType[],
  beforeEdges: EdgeType[],
  afterNodes: NodeType[],
  afterEdges: EdgeType[],
): GraphHistoryEntry<NodeType, EdgeType> | null {
  const sanitizedBeforeNodes = sanitizeNodesForHistory(beforeNodes);
  const sanitizedAfterNodes = sanitizeNodesForHistory(afterNodes);
  const beforeNodesById = createNodeMap(sanitizedBeforeNodes);
  const beforeEdgesById = createEdgeMap(beforeEdges);
  const afterNodesById = createNodeMap(sanitizedAfterNodes);
  const afterEdgesById = createEdgeMap(afterEdges);

  const nodeDiffs: NodeHistoryDiff<NodeType>[] = [];
  const edgeDiffs: EdgeHistoryDiff<EdgeType>[] = [];

  for (let i = 0; i < sanitizedBeforeNodes.length; i++) {
    const beforeNode = sanitizedBeforeNodes[i];
    const afterNode = afterNodesById.get(beforeNode.id);
    if (!afterNode) {
      nodeDiffs.push({ type: 'remove', id: beforeNode.id, before: beforeNode });
    } else if (afterNode !== beforeNode) {
      nodeDiffs.push({ type: 'update', id: beforeNode.id, before: beforeNode, after: afterNode });
    }
  }

  for (let i = 0; i < sanitizedAfterNodes.length; i++) {
    const afterNode = sanitizedAfterNodes[i];
    if (!beforeNodesById.has(afterNode.id)) {
      nodeDiffs.push({ type: 'add', id: afterNode.id, after: afterNode });
    }
  }

  for (let i = 0; i < beforeEdges.length; i++) {
    const beforeEdge = beforeEdges[i];
    const afterEdge = afterEdgesById.get(beforeEdge.id);
    if (!afterEdge) {
      edgeDiffs.push({ type: 'remove', id: beforeEdge.id, before: beforeEdge });
    } else if (afterEdge !== beforeEdge) {
      edgeDiffs.push({ type: 'update', id: beforeEdge.id, before: beforeEdge, after: afterEdge });
    }
  }

  for (let i = 0; i < afterEdges.length; i++) {
    const afterEdge = afterEdges[i];
    if (!beforeEdgesById.has(afterEdge.id)) {
      edgeDiffs.push({ type: 'add', id: afterEdge.id, after: afterEdge });
    }
  }

  if (nodeDiffs.length === 0 && edgeDiffs.length === 0) {
    return null;
  }

  return {
    kind: 'graph',
    nodeDiffs,
    edgeDiffs,
    nodeOrderBefore: sanitizedBeforeNodes.map((node) => node.id),
    nodeOrderAfter: sanitizedAfterNodes.map((node) => node.id),
    edgeOrderBefore: beforeEdges.map((edge) => edge.id),
    edgeOrderAfter: afterEdges.map((edge) => edge.id),
  };
}

function orderNodesById<NodeType extends Node>(
  map: Map<string, NodeType>,
  orderedIds: string[],
): NodeType[] {
  const nodes: NodeType[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const node = map.get(id);
    if (!node) continue;
    seen.add(id);
    nodes.push(node);
  }

  for (const [id, node] of map.entries()) {
    if (!seen.has(id)) {
      nodes.push(node);
    }
  }

  return nodes;
}

function orderEdgesById<EdgeType extends Edge>(
  map: Map<string, EdgeType>,
  orderedIds: string[],
): EdgeType[] {
  const edges: EdgeType[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const edge = map.get(id);
    if (!edge) continue;
    seen.add(id);
    edges.push(edge);
  }

  for (const [id, edge] of map.entries()) {
    if (!seen.has(id)) {
      edges.push(edge);
    }
  }

  return edges;
}

export function applyGraphHistoryEntry<NodeType extends Node, EdgeType extends Edge>(
  entry: GraphHistoryEntry<NodeType, EdgeType>,
  direction: 'undo' | 'redo',
  currentNodes: NodeType[],
  currentEdges: EdgeType[],
): { nodes: NodeType[]; edges: EdgeType[] } {
  const nextNodesById = createNodeMap(currentNodes);
  const nextEdgesById = createEdgeMap(currentEdges);

  for (let i = 0; i < entry.nodeDiffs.length; i++) {
    const diff = entry.nodeDiffs[i];
    if (diff.type === 'add') {
      if (direction === 'undo') {
        nextNodesById.delete(diff.id);
      } else if (diff.after) {
        nextNodesById.set(diff.id, diff.after);
      }
      continue;
    }

    if (diff.type === 'remove') {
      if (direction === 'undo') {
        if (diff.before) nextNodesById.set(diff.id, diff.before);
      } else {
        nextNodesById.delete(diff.id);
      }
      continue;
    }

    if (direction === 'undo') {
      if (diff.before) nextNodesById.set(diff.id, diff.before);
    } else if (diff.after) {
      nextNodesById.set(diff.id, diff.after);
    }
  }

  for (let i = 0; i < entry.edgeDiffs.length; i++) {
    const diff = entry.edgeDiffs[i];
    if (diff.type === 'add') {
      if (direction === 'undo') {
        nextEdgesById.delete(diff.id);
      } else if (diff.after) {
        nextEdgesById.set(diff.id, diff.after);
      }
      continue;
    }

    if (diff.type === 'remove') {
      if (direction === 'undo') {
        if (diff.before) nextEdgesById.set(diff.id, diff.before);
      } else {
        nextEdgesById.delete(diff.id);
      }
      continue;
    }

    if (direction === 'undo') {
      if (diff.before) nextEdgesById.set(diff.id, diff.before);
    } else if (diff.after) {
      nextEdgesById.set(diff.id, diff.after);
    }
  }

  const nodeOrder = direction === 'undo' ? entry.nodeOrderBefore : entry.nodeOrderAfter;
  const edgeOrder = direction === 'undo' ? entry.edgeOrderBefore : entry.edgeOrderAfter;

  return {
    nodes: orderNodesById(nextNodesById, nodeOrder),
    edges: orderEdgesById(nextEdgesById, edgeOrder),
  };
}

export function applyPositionHistoryEntry<NodeType extends Node>(
  entry: PositionHistoryEntry,
  direction: 'undo' | 'redo',
  currentNodes: NodeType[],
): NodeType[] {
  const positionsById = new Map<string, PositionSnapshot>();
  for (let i = 0; i < entry.positions.length; i++) {
    const step = entry.positions[i];
    positionsById.set(step.id, direction === 'undo' ? step.from : step.to);
  }

  let changed = false;
  const nextNodes = new Array<NodeType>(currentNodes.length);
  for (let i = 0; i < currentNodes.length; i++) {
    const node = currentNodes[i];
    const nextPosition = positionsById.get(node.id);
    if (!nextPosition || arePositionsEqual(toPositionSnapshot(node.position), nextPosition)) {
      nextNodes[i] = node;
      continue;
    }

    changed = true;
    nextNodes[i] = {
      ...node,
      position: { x: nextPosition.x, y: nextPosition.y },
    };
  }

  return changed ? nextNodes : currentNodes;
}
