import type { CanvasNode, RecipeNodeType } from '../types/nodes';
import type { Edge } from '@xyflow/react';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import { parseHandleId } from '../utils/idGenerator';
import type { HandleDataType } from '../types/data';

export interface AppConnectionCandidate {
  readonly source?: string | null;
  readonly sourceHandle?: string | null;
  readonly target?: string | null;
  readonly targetHandle?: string | null;
}

export interface ResolvedAppConnection {
  readonly sourceNodeId: string;
  readonly sourceHandleId: string;
  readonly targetNodeId: string;
  readonly targetHandleId: string;
}

export function areConnectionProductsCompatible(
  sourceProductId: string,
  targetProductId: string,
  sourceHandleType: HandleDataType | '',
  targetHandleType: HandleDataType | '',
): boolean {
  if (
    !sourceProductId ||
    !targetProductId ||
    !sourceHandleType ||
    sourceHandleType !== targetHandleType
  ) {
    return false;
  }
  return (
    sourceProductId === targetProductId ||
    sourceProductId === 'any_fluid' ||
    sourceProductId === 'any_item' ||
    targetProductId === 'any_fluid' ||
    targetProductId === 'any_item'
  );
}

interface ConnectionValidationOptions {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly Edge[];
  readonly excludeEdgeId?: string;
}

function resolveEndpoint(
  nodeId: string,
  handleId: string,
  nodesById: ReadonlyMap<string, CanvasNode>,
) {
  const node = nodesById.get(nodeId);
  if (isGroupNode(node)) {
    if (!node.data.collapsed) return null;
    const parsedProxy = parseHandleId(handleId);
    if (!parsedProxy || parsedProxy.nodeId !== node.id) return null;
    const proxyHandles =
      parsedProxy.side === 'input' ? node.data.inputProxyHandleIds : node.data.outputProxyHandleIds;
    const handleIdForMember = proxyHandles[parsedProxy.index];
    const parsedMember = handleIdForMember ? parseHandleId(handleIdForMember) : null;
    if (!parsedMember || parsedMember.side !== parsedProxy.side) return null;
    const member = nodesById.get(parsedMember.nodeId);
    if (!isRecipeNode(member)) return null;
    return {
      nodeId: member.id,
      handleId: handleIdForMember,
      parsed: parsedMember,
    };
  }

  const parsed = parseHandleId(handleId);
  if (!isRecipeNode(node) || !parsed || parsed.nodeId !== node.id) return null;
  return { nodeId: node.id, handleId, parsed };
}

export function resolveAppConnection(
  connection: AppConnectionCandidate,
  nodes: readonly CanvasNode[],
): ResolvedAppConnection | null {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  )
    return null;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const first = resolveEndpoint(connection.source, connection.sourceHandle, nodesById);
  const second = resolveEndpoint(connection.target, connection.targetHandle, nodesById);
  if (!first || !second) return null;

  const source = first.parsed.side === 'output' ? first : second;
  const target = first.parsed.side === 'input' ? first : second;
  if (source.parsed.side !== 'output' || target.parsed.side !== 'input') return null;
  return {
    sourceNodeId: source.nodeId,
    sourceHandleId: source.handleId,
    targetNodeId: target.nodeId,
    targetHandleId: target.handleId,
  };
}

export function isAppConnectionValid(
  connection: AppConnectionCandidate,
  { nodes, edges, excludeEdgeId }: ConnectionValidationOptions,
): boolean {
  const resolved = resolveAppConnection(connection, nodes);
  if (!resolved) return false;

  const recipeNodes = nodes.filter(isRecipeNode) as RecipeNodeType[];
  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const recipeEdges = edges.filter(
    (edge) =>
      edge.id !== excludeEdgeId &&
      !edge.id.startsWith('proxy-') &&
      recipeNodeIds.has(edge.source) &&
      recipeNodeIds.has(edge.target),
  );
  const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);
  const sourceHelpers = resolutionContext.createHelpers(resolved.sourceNodeId);
  const targetHelpers = resolutionContext.createHelpers(resolved.targetNodeId);
  const sourceParsed = parseHandleId(resolved.sourceHandleId);
  const targetParsed = parseHandleId(resolved.targetHandleId);
  if (!sourceParsed || !targetParsed) return false;

  const sourceHandleType = sourceHelpers.resolveHandleType('output', sourceParsed.index);
  const targetHandleType = targetHelpers.resolveHandleType('input', targetParsed.index);
  const sourceProductId = sourceHelpers.resolveProduct('output', sourceParsed.index);
  const targetProductId = targetHelpers.resolveProduct('input', targetParsed.index);
  return areConnectionProductsCompatible(
    sourceProductId,
    targetProductId,
    sourceHandleType,
    targetHandleType,
  );
}
