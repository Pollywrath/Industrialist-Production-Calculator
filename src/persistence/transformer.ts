import type { Node, Edge } from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { parseHandleId, buildHandleId, nextNodeId, nextEdgeId } from '../utils/idGenerator';
import { getRecipe } from '../data/lookup';

import type { SavedNode, SavedEdge, SaveData } from '../types/saves';

export const CURRENT_SAVE_VERSION = 1;

export function migrateSaveData(rawData: unknown): SaveData {
  if (!rawData || typeof rawData !== 'object') {
    return { version: CURRENT_SAVE_VERSION, nodes: [], edges: [] };
  }

  const data = rawData as Record<string, unknown>;

  const version =
    typeof data.version === 'number' && data.version > 0 ? data.version : CURRENT_SAVE_VERSION;

  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const nodes: SavedNode[] = rawNodes.map((rawN) => {
    if (!rawN || typeof rawN !== 'object') {
      return {
        id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        recipeId: '',
        machineCount: 1,
        position: { x: 0, y: 0 },
        settings: {},
      };
    }

    const n = rawN as Record<string, unknown>;
    const pos =
      n.position && typeof n.position === 'object'
        ? (n.position as { x?: number; y?: number })
        : { x: 0, y: 0 };

    let settings: Record<string, unknown> = {};
    if (n.settings && typeof n.settings === 'object') {
      settings = { ...(n.settings as Record<string, unknown>) };
    }

    let recipeId = typeof n.recipeId === 'string' ? n.recipeId : '';
    if (recipeId && !getRecipe(recipeId)) {
      recipeId = '';
    }

    let machineCount = typeof n.machineCount === 'number' ? n.machineCount : 1;
    if (!Number.isFinite(machineCount) || Number.isNaN(machineCount) || machineCount < 1) {
      machineCount = 1;
    } else {
      machineCount = Math.floor(machineCount);
    }

    const savedNode: SavedNode = {
      id:
        typeof n.id === 'string'
          ? n.id
          : `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      recipeId,
      machineCount,
      position: {
        x: typeof pos.x === 'number' && Number.isFinite(pos.x) ? pos.x : 0,
        y: typeof pos.y === 'number' && Number.isFinite(pos.y) ? pos.y : 0,
      },
      settings,
    };

    if (Array.isArray(n.inputOrder)) {
      const uniqueInts = new Set<number>();
      for (const x of n.inputOrder) {
        if (typeof x === 'number' && Number.isInteger(x) && x >= 0) {
          uniqueInts.add(x);
        }
      }
      savedNode.inputOrder = Array.from(uniqueInts);
    }
    if (Array.isArray(n.outputOrder)) {
      const uniqueInts = new Set<number>();
      for (const x of n.outputOrder) {
        if (typeof x === 'number' && Number.isInteger(x) && x >= 0) {
          uniqueInts.add(x);
        }
      }
      savedNode.outputOrder = Array.from(uniqueInts);
    }

    return savedNode;
  });

  const rawEdges = Array.isArray(data.edges) ? data.edges : [];
  const edges: SavedEdge[] = rawEdges.map((rawE) => {
    if (!rawE || typeof rawE !== 'object') {
      return {
        id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        source: '',
        sourceIndex: 0,
        target: '',
        targetIndex: 0,
      };
    }

    const e = rawE as Record<string, unknown>;
    const sIdx = typeof e.sourceIndex === 'number' ? Math.floor(e.sourceIndex) : 0;
    const tIdx = typeof e.targetIndex === 'number' ? Math.floor(e.targetIndex) : 0;

    return {
      id:
        typeof e.id === 'string'
          ? e.id
          : `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      source: typeof e.source === 'string' ? e.source : '',
      sourceIndex: sIdx >= 0 ? sIdx : 0,
      target: typeof e.target === 'string' ? e.target : '',
      targetIndex: tIdx >= 0 ? tIdx : 0,
    };
  });

  return {
    version,
    nodes,
    edges,
  };
}

export function serializeCanvas(nodes: Node<RecipeNodeData>[], edges: Edge[]): SaveData {
  const savedNodes: SavedNode[] = nodes.map((n) => ({
    id: n.id,
    recipeId: n.data.recipeId,
    machineCount: n.data.machineCount,
    inputOrder: n.data.inputOrder,
    outputOrder: n.data.outputOrder,
    position: { x: n.position.x, y: n.position.y },
    settings: (n.data as { settings?: Record<string, unknown> }).settings ?? {},
  }));

  const savedEdges: SavedEdge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e.sourceHandle || !e.targetHandle) continue;

    const sourceParsed = parseHandleId(e.sourceHandle);
    const targetParsed = parseHandleId(e.targetHandle);

    if (!sourceParsed || !targetParsed) {
      console.warn(`[Persistence] Dropping malformed edge ${e.id} during serialization.`);
      continue;
    }

    savedEdges.push({
      id: e.id,
      source: e.source,
      sourceIndex: sourceParsed.index,
      target: e.target,
      targetIndex: targetParsed.index,
    });
  }

  return {
    version: CURRENT_SAVE_VERSION,
    nodes: savedNodes,
    edges: savedEdges,
  };
}

export function deserializeCanvas(saveData: SaveData): {
  nodes: Node<RecipeNodeData>[];
  edges: Edge[];
} {
  const migrated = migrateSaveData(saveData);

  const idMap = new Map<string, string>();
  const seenNodeIds = new Set<string>();

  const nodes: Node<RecipeNodeData>[] = [];
  for (let i = 0; i < migrated.nodes.length; i++) {
    const sn = migrated.nodes[i];
    let finalId = sn.id;

    if (seenNodeIds.has(finalId) || !finalId) {
      finalId = nextNodeId();
      idMap.set(sn.id, finalId);
    }
    seenNodeIds.add(finalId);

    nodes.push({
      id: finalId,
      type: 'recipe',
      position: sn.position,
      data: {
        recipeId: sn.recipeId,
        machineCount: sn.machineCount,
        inputOrder: sn.inputOrder,
        outputOrder: sn.outputOrder,
        settings: sn.settings,
      } as RecipeNodeData,
    });
  }

  const nodeLookup = new Map<string, SavedNode>();
  for (let i = 0; i < migrated.nodes.length; i++) {
    const n = migrated.nodes[i];
    if (!nodeLookup.has(n.id)) {
      nodeLookup.set(n.id, n);
    }
  }

  const edges: Edge[] = [];
  const seenEdgeIds = new Set<string>();

  for (let i = 0; i < migrated.edges.length; i++) {
    const se = migrated.edges[i];

    const sourceId = idMap.get(se.source) ?? se.source;
    const targetId = idMap.get(se.target) ?? se.target;

    const sourceNode = nodeLookup.get(se.source);
    const targetNode = nodeLookup.get(se.target);

    if (!sourceNode || !targetNode) continue;

    const sourceRecipe = getRecipe(sourceNode.recipeId);
    const targetRecipe = getRecipe(targetNode.recipeId);

    if (!sourceRecipe || !targetRecipe) continue;

    if (
      se.sourceIndex >= sourceRecipe.outputs.length ||
      se.targetIndex >= targetRecipe.inputs.length
    ) {
      console.warn(`[Persistence] Dropping orphaned edge ${se.id} connected to deleted port.`);
      continue;
    }

    let finalEdgeId = se.id;
    if (seenEdgeIds.has(finalEdgeId) || !finalEdgeId) {
      finalEdgeId = nextEdgeId();
    }
    seenEdgeIds.add(finalEdgeId);

    edges.push({
      id: finalEdgeId,
      type: 'recipe',
      source: sourceId,
      target: targetId,
      sourceHandle: buildHandleId(sourceId, 'output', se.sourceIndex),
      targetHandle: buildHandleId(targetId, 'input', se.targetIndex),
    });
  }

  return { nodes, edges };
}
