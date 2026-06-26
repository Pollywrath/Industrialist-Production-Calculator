import type { Edge } from '@xyflow/react';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import type { CanvasNode } from '../types/nodes';
import type { EdgeControlPoint } from '../types/edges';
import { parseHandleId, buildHandleId, nextNodeId, nextEdgeId } from '../utils/idGenerator';
import { getRecipe, resolveActiveRecipe } from '../data/lookup';
import { cleanMachineCount } from '../utils/precision';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';

import type {
  SavedNode,
  SavedRecipeNode,
  SavedEdge,
  SaveData,
  GlobalSettings,
} from '../types/saves';

export const CURRENT_SAVE_VERSION = 2;

function sanitizeSavedPoints(raw: unknown): EdgeControlPoint[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const points: EdgeControlPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;

    const point = item as { x?: number; y?: number };
    if (
      typeof point.x !== 'number' ||
      !Number.isFinite(point.x) ||
      typeof point.y !== 'number' ||
      !Number.isFinite(point.y)
    ) {
      continue;
    }

    points.push({ x: point.x, y: point.y });
  }

  return points.length > 0 ? points : undefined;
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const items: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === 'string' && item) {
      items.push(item);
    }
  }

  return items;
}

function remapProxyHandleIds(
  handleIds: string[],
  idMap: Map<string, string>,
  recipeNodeIds: Set<string>,
  side: 'input' | 'output',
): string[] {
  let changed = false;
  const nextHandleIds: string[] = [];

  for (let i = 0; i < handleIds.length; i++) {
    const handleId = handleIds[i];
    const parsed = parseHandleId(handleId);
    const nextNodeId = parsed ? idMap.get(parsed.nodeId) : undefined;
    const nextHandleId =
      parsed && nextNodeId ? buildHandleId(nextNodeId, parsed.side, parsed.index) : handleId;
    const nextParsed = parseHandleId(nextHandleId);

    if (!nextParsed || nextParsed.side !== side || !recipeNodeIds.has(nextParsed.nodeId)) {
      changed = true;
      continue;
    }

    nextHandleIds.push(nextHandleId);
    if (parsed && nextNodeId) {
      changed = true;
    }
  }

  return changed ? nextHandleIds : handleIds;
}

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
        type: 'recipe',
        recipeId: '',
        machineCount: 1,
        position: { x: 0, y: 0 },
        settings: {},
      };
    }

    const n = rawN as Record<string, unknown>;
    const id =
      typeof n.id === 'string'
        ? n.id
        : `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const pos =
      n.position && typeof n.position === 'object'
        ? (n.position as { x?: number; y?: number })
        : { x: 0, y: 0 };
    const position = {
      x: typeof pos.x === 'number' && Number.isFinite(pos.x) ? pos.x : 0,
      y: typeof pos.y === 'number' && Number.isFinite(pos.y) ? pos.y : 0,
    };

    if (n.type === 'group') {
      return {
        id,
        type: 'group',
        label: typeof n.label === 'string' ? n.label : 'Group',
        collapsed: typeof n.collapsed === 'boolean' ? n.collapsed : false,
        inputProxyHandleIds: sanitizeStringArray(n.inputProxyHandleIds),
        outputProxyHandleIds: sanitizeStringArray(n.outputProxyHandleIds),
        position,
      };
    }

    let settings: Record<string, unknown> = {};
    if (n.settings && typeof n.settings === 'object') {
      settings = { ...(n.settings as Record<string, unknown>) };
    }

    let recipeId = typeof n.recipeId === 'string' ? n.recipeId : '';
    if (recipeId && !getRecipe(recipeId)) {
      recipeId = '';
    }

    let machineCount = typeof n.machineCount === 'number' ? n.machineCount : 1;
    if (!Number.isFinite(machineCount) || Number.isNaN(machineCount) || machineCount < 0) {
      machineCount = 1;
    } else {
      machineCount = cleanMachineCount(machineCount);
    }

    const savedNode: SavedRecipeNode = {
      id,
      type: 'recipe',
      recipeId,
      machineCount,
      position,
      settings,
      isTarget: typeof n.isTarget === 'boolean' ? n.isTarget : undefined,
      groupId: typeof n.groupId === 'string' ? n.groupId : undefined,
      hidden: typeof n.hidden === 'boolean' ? n.hidden : undefined,
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
      controlPoints: sanitizeSavedPoints(e.controlPoints),
      orthogonalTurns: sanitizeSavedPoints(e.orthogonalTurns),
      hidden: typeof e.hidden === 'boolean' ? e.hidden : undefined,
    };
  });

  let globalSettings: GlobalSettings | undefined;
  if (data.globalSettings && typeof data.globalSettings === 'object') {
    const gs = data.globalSettings as Record<string, unknown>;
    globalSettings = {
      global_pollution: typeof gs.global_pollution === 'number' ? gs.global_pollution : 10,
      difficulty: typeof gs.difficulty === 'string' ? gs.difficulty : undefined,
      unlockedResearchIds: Array.isArray(gs.unlockedResearchIds) ? gs.unlockedResearchIds.filter((x): x is string => typeof x === 'string') : undefined,
      oreNodesEnabled: typeof gs.oreNodesEnabled === 'boolean' ? gs.oreNodesEnabled : undefined,
      showVariantLimited: typeof gs.showVariantLimited === 'boolean' ? gs.showVariantLimited : undefined,
    };
  }

  let dataOverrides: { id: string; data: Record<string, unknown> }[] | undefined;
  if (Array.isArray(data.dataOverrides)) {
    dataOverrides = [];
    for (let i = 0; i < data.dataOverrides.length; i++) {
      const entry = data.dataOverrides[i];
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        entry.data &&
        typeof entry.data === 'object'
      ) {
        dataOverrides.push({
          id: entry.id,
          data: entry.data as Record<string, unknown>,
        });
      }
    }
  }

  return {
    version,
    nodes,
    edges,
    globalSettings,
    dataOverrides,
  };
}

export function serializeCanvas(
  nodes: CanvasNode[],
  edges: Edge[],
  allOverrides?: { id: string; data: Record<string, unknown> }[],
): SaveData {
  const savedNodes: SavedNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (isRecipeNode(n)) {
      savedNodes.push({
        id: n.id,
        type: 'recipe',
        recipeId: n.data.recipeId,
        machineCount: n.data.machineCount,
        inputOrder: n.data.inputOrder,
        outputOrder: n.data.outputOrder,
        position: { x: n.position.x, y: n.position.y },
        settings: n.data.settings ?? {},
        isTarget: n.data.isTarget,
        groupId: n.data.groupId,
        hidden: n.hidden || undefined,
      });
    } else if (isGroupNode(n)) {
      savedNodes.push({
        id: n.id,
        type: 'group',
        label: n.data.label,
        collapsed: n.data.collapsed,
        inputProxyHandleIds: n.data.inputProxyHandleIds,
        outputProxyHandleIds: n.data.outputProxyHandleIds,
        position: { x: n.position.x, y: n.position.y },
      });
    }
  }

  const savedEdges: SavedEdge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.id.startsWith('proxy-')) continue;
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
      controlPoints: sanitizeSavedPoints(
        (e.data as { controlPoints?: unknown } | undefined)?.controlPoints,
      ),
      orthogonalTurns: sanitizeSavedPoints(
        (e.data as { orthogonalTurns?: unknown } | undefined)?.orthogonalTurns,
      ),
      hidden: e.hidden || undefined,
    });
  }

  const globalSettings: GlobalSettings = useGlobalSettingsStore.getState().settings;

  return {
    version: CURRENT_SAVE_VERSION,
    nodes: savedNodes,
    edges: savedEdges,
    globalSettings,
    dataOverrides: allOverrides && allOverrides.length > 0 ? allOverrides : undefined,
  };
}

export function deserializeCanvas(saveData: SaveData): {
  nodes: CanvasNode[];
  edges: Edge[];
} {
  const migrated = migrateSaveData(saveData);

  if (migrated.globalSettings) {
    useGlobalSettingsStore.getState().importSettings(migrated.globalSettings);
  }

  const idMap = new Map<string, string>();
  const seenNodeIds = new Set<string>();
  const finalNodeIds = new Array<string>(migrated.nodes.length);
  const finalGroupIds = new Set<string>();
  const finalRecipeIds = new Set<string>();

  for (let i = 0; i < migrated.nodes.length; i++) {
    const sn = migrated.nodes[i];
    let finalId = sn.id;

    if (seenNodeIds.has(finalId) || !finalId) {
      finalId = nextNodeId();
      idMap.set(sn.id, finalId);
    }
    seenNodeIds.add(finalId);
    finalNodeIds[i] = finalId;
    if (sn.type === 'group') {
      finalGroupIds.add(finalId);
    } else {
      finalRecipeIds.add(finalId);
    }
  }

  const nodes: CanvasNode[] = [];
  for (let i = 0; i < migrated.nodes.length; i++) {
    const sn = migrated.nodes[i];
    const finalId = finalNodeIds[i];
    if (sn.type === 'group') {
      nodes.push({
        id: finalId,
        type: 'group',
        position: sn.position,
        data: {
          label: sn.label,
          collapsed: sn.collapsed,
          handlesReady: false,
          inputProxyHandleIds: remapProxyHandleIds(
            sn.inputProxyHandleIds,
            idMap,
            finalRecipeIds,
            'input',
          ),
          outputProxyHandleIds: remapProxyHandleIds(
            sn.outputProxyHandleIds,
            idMap,
            finalRecipeIds,
            'output',
          ),
        },
      });
    } else {
      const groupId = sn.groupId ? idMap.get(sn.groupId) ?? sn.groupId : undefined;
      nodes.push({
        id: finalId,
        type: 'recipe',
        position: sn.position,
        hidden: sn.hidden || undefined,
        data: {
          recipeId: sn.recipeId,
          machineCount: sn.machineCount,
          inputOrder: sn.inputOrder,
          outputOrder: sn.outputOrder,
          settings: sn.settings,
          isTarget: sn.isTarget,
          groupId: groupId && finalGroupIds.has(groupId) ? groupId : undefined,
        },
      });
    }
  }

  const nodeLookup = new Map<string, SavedRecipeNode>();
  for (let i = 0; i < migrated.nodes.length; i++) {
    const n = migrated.nodes[i];
    if (n.type !== 'group' && !nodeLookup.has(n.id)) {
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

    const sourceRecipe =
      resolveActiveRecipe(sourceNode.recipeId, sourceNode.settings) ?? getRecipe(sourceNode.recipeId);
    const targetRecipe =
      resolveActiveRecipe(targetNode.recipeId, targetNode.settings) ?? getRecipe(targetNode.recipeId);

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

    const edgeData =
      (se.controlPoints && se.controlPoints.length > 0) ||
      (se.orthogonalTurns && se.orthogonalTurns.length > 0)
        ? {
            ...(se.controlPoints && se.controlPoints.length > 0
              ? { controlPoints: se.controlPoints }
              : {}),
            ...(se.orthogonalTurns && se.orthogonalTurns.length > 0
              ? { orthogonalTurns: se.orthogonalTurns }
              : {}),
          }
        : undefined;

    edges.push({
      id: finalEdgeId,
      type: 'recipe',
      source: sourceId,
      target: targetId,
      sourceHandle: buildHandleId(sourceId, 'output', se.sourceIndex),
      targetHandle: buildHandleId(targetId, 'input', se.targetIndex),
      data: edgeData,
      hidden: se.hidden || undefined,
    });
  }

  return { nodes, edges };
}
