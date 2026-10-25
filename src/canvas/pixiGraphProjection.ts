import type { Edge } from '@xyflow/react';
import type { Recipe } from '../types/data';
import { FLOW_EDGE_TYPE } from './pixiEngine/domain/edges/flow/definition';
import type { FlowEdge, FlowEdgeSettings } from './pixiEngine/domain/edges/flow/model';
import type {
  EdgeControlPoint as PixiEdgeControlPoint,
  FlowGroup,
  FlowPort,
  GraphNode,
  GraphState,
  PortDirection,
  PortKind,
} from './pixiEngine/domain/graph/types';
import type { EdgeStyleSettings } from '../stores/useEdgeThemeStore';
import type { PixiRecipePresentation } from './pixiRecipePresentation';
import { getMachineName, getProduct, getProductName, resolveActiveRecipe } from '../data/lookup';
import {
  isGroupNode,
  isRecipeNode,
  type CanvasNode,
  type RecipeNodeData,
  type RecipeNodeType,
} from '../types/nodes';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { getRecipeEntryHandleType } from '../utils/handleTypes';

export const PIXI_GRAPH_ADAPTER_VERSION = 1 as const;

interface PixiRecipeData {
  recipeId: string;
  machineCount: number;
  machineName?: string;
  heightOverride?: number;
  cycleTime?: string;
  power?: string;
  pollution?: string;
  machineTierColor?: string;
  isTarget: boolean;
  appData: RecipeNodeData;
}

interface PixiAppEdge extends FlowEdge {
  readonly appData: unknown;
}

interface RecipeNodeProjectionInputs {
  readonly nodeData: RecipeNodeType['data'];
  readonly x: number;
  readonly y: number;
  readonly height: number | undefined;
  readonly recipe: Recipe;
  readonly presentation: PixiRecipePresentation | undefined;
}

interface EdgeProjectionInputs {
  readonly appEdge: Edge;
  readonly routingStyle: FlowEdgeSettings['routingStyle'];
  readonly lineStyle: FlowEdgeSettings['lineStyle'];
  readonly animationStyle: FlowEdgeSettings['animationStyle'];
}

interface GroupProjectionInputs {
  readonly nodeData: unknown;
  readonly memberNodeIds: readonly string[];
  readonly collapsed: boolean;
  readonly inputProxyPortIds: readonly string[];
  readonly outputProxyPortIds: readonly string[];
}

const recipeNodeProjectionInputs = new WeakMap<object, RecipeNodeProjectionInputs>();
const edgeProjectionInputs = new WeakMap<object, EdgeProjectionInputs>();
const groupProjectionInputs = new WeakMap<object, GroupProjectionInputs>();

export interface PixiGraphProjectionV1 {
  readonly adapterVersion: typeof PIXI_GRAPH_ADAPTER_VERSION;
  readonly graph: GraphState<GraphNode<'recipe', PixiRecipeData>, PixiAppEdge, FlowEdgeSettings>;
}

export interface PixiGraphProjectionInput {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly Edge[];
  readonly groupMemberIds: Readonly<Record<string, readonly string[]>>;
  readonly edgeStyle: EdgeStyleSettings;
  readonly recipePresentationByNodeId?: ReadonlyMap<string, PixiRecipePresentation>;
  readonly activeRecipeByNodeId?: ReadonlyMap<string, Recipe>;
  readonly previousProjection?: PixiGraphProjectionV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPortKind(value: unknown): PortKind {
  return value === 'fluid' ? 'fluid' : 'item';
}

function toPortId(nodeId: string, direction: PortDirection, logicalIndex: number): string {
  return buildHandleId(nodeId, direction, logicalIndex);
}

function buildPortOrder(
  node: RecipeNodeType,
  direction: PortDirection,
  ports: readonly FlowPort[],
): string[] {
  const appOrder = direction === 'input' ? node.data.inputOrder : node.data.outputOrder;
  const logicalOrder = appOrder ?? ports.map((port) => port.logicalIndex);
  const expectedCount = ports.filter((port) => port.direction === direction).length;
  if (
    logicalOrder.length !== expectedCount ||
    new Set(logicalOrder).size !== logicalOrder.length ||
    logicalOrder.some(
      (index) =>
        !Number.isInteger(index) ||
        !ports.some((port) => port.direction === direction && port.logicalIndex === index),
    )
  ) {
    throw new Error(`Node "${node.id}" has an invalid ${direction} port order.`);
  }
  return logicalOrder.map((index) => toPortId(node.id, direction, index));
}

function readAppRoutePoints(
  data: unknown,
  key: 'controlPoints' | 'orthogonalTurns',
  edgeId: string,
): PixiEdgeControlPoint[] | undefined {
  if (!isRecord(data) || data[key] === undefined) return undefined;
  const points = data[key];
  if (!Array.isArray(points)) throw new Error(`Edge "${edgeId}" has malformed ${key}.`);
  return points.map((point, index) => {
    if (
      !isRecord(point) ||
      typeof point.x !== 'number' ||
      !Number.isFinite(point.x) ||
      typeof point.y !== 'number' ||
      !Number.isFinite(point.y)
    ) {
      throw new Error(`Edge "${edgeId}" has a non-finite ${key} point.`);
    }
    return { id: `${edgeId}:${key}:${index}`, x: point.x, y: point.y };
  });
}

function toEdgeSettings(edgeStyle: EdgeStyleSettings): FlowEdgeSettings {
  return {
    routingStyle: edgeStyle.pathStyle,
    lineStyle: edgeStyle.lineStyle,
    animationStyle: edgeStyle.animationStyle,
  };
}

function toRecipePorts(
  node: RecipeNodeType,
  recipe: Recipe,
  presentation?: PixiRecipePresentation,
): FlowPort[] {
  const ports: FlowPort[] = [];
  for (const [direction, entries] of [
    ['input', recipe.inputs],
    ['output', recipe.outputs],
  ] as const) {
    entries.forEach((entry, logicalIndex) => {
      const product = getProduct(entry.product_id);
      const kind =
        getRecipeEntryHandleType(entry) ?? (product?.type === 'Fluid' ? 'fluid' : 'item');
      const productName = getProductName(entry.product_id);
      ports.push({
        id: toPortId(node.id, direction, logicalIndex),
        direction,
        kind: toPortKind(kind),
        logicalIndex,
        label: productName || entry.product_id,
        ...(typeof entry.product_link_id === 'string' && entry.product_link_id.trim()
          ? { linkId: entry.product_link_id.trim() }
          : {}),
        ...(presentation?.portSummaries.get(toPortId(node.id, direction, logicalIndex))
          ? { summary: presentation.portSummaries.get(toPortId(node.id, direction, logicalIndex)) }
          : {}),
        ...(direction === 'input' &&
        presentation?.deficientPortIds.has(toPortId(node.id, direction, logicalIndex))
          ? { status: 'deficient' as const }
          : {}),
        ...(direction === 'output' &&
        presentation?.excessPortIds.has(toPortId(node.id, direction, logicalIndex))
          ? { status: 'excess' as const }
          : {}),
      });
    });
  }
  return ports;
}

function toRecipeNode(
  node: RecipeNodeType,
  recipe: Recipe,
  presentation?: PixiRecipePresentation,
): GraphNode<'recipe', PixiRecipeData> {
  const ports = toRecipePorts(node, recipe, presentation);
  return {
    id: node.id,
    type: 'recipe',
    label: recipe.name,
    x: node.position.x,
    y: node.position.y,
    ports,
    inputOrder: buildPortOrder(node, 'input', ports),
    outputOrder: buildPortOrder(node, 'output', ports),
    data: {
      recipeId: node.data.recipeId,
      machineCount: node.data.machineCount,
      isTarget: !!node.data.isTarget,
      ...(presentation?.temperature ? { temperature: presentation.temperature } : {}),
      machineName: presentation?.machineName ?? getMachineName(recipe.machine_id),
      ...(presentation?.cycleTime ? { cycleTime: presentation.cycleTime } : {}),
      ...(presentation?.power ? { power: presentation.power } : {}),
      ...(presentation?.pollution ? { pollution: presentation.pollution } : {}),
      ...(presentation?.machineTierColor
        ? { machineTierColor: presentation.machineTierColor }
        : {}),
      appData: node.data,
      ...(typeof node.height === 'number' && Number.isFinite(node.height)
        ? { heightOverride: node.height }
        : {}),
    },
  };
}

function projectRecipeNode(
  node: RecipeNodeType,
  recipe: Recipe,
  presentation: PixiRecipePresentation | undefined,
  previousNode: GraphNode<'recipe', PixiRecipeData> | undefined,
): GraphNode<'recipe', PixiRecipeData> {
  if (previousNode) {
    const previousInputs = recipeNodeProjectionInputs.get(previousNode);
    if (
      previousInputs &&
      previousInputs.nodeData === node.data &&
      previousInputs.x === node.position.x &&
      previousInputs.y === node.position.y &&
      previousInputs.height === node.height &&
      previousInputs.recipe === recipe &&
      previousInputs.presentation === presentation
    ) {
      return previousNode;
    }
  }

  const projectedNode = toRecipeNode(node, recipe, presentation);
  recipeNodeProjectionInputs.set(projectedNode, {
    nodeData: node.data,
    x: node.position.x,
    y: node.position.y,
    height: node.height,
    recipe,
    presentation,
  });
  return projectedNode;
}

function projectGroup(
  node: Extract<CanvasNode, { type: 'group' }>,
  memberNodeIds: readonly string[],
  previousGroup: FlowGroup | undefined,
): FlowGroup {
  if (previousGroup) {
    const previousInputs = groupProjectionInputs.get(previousGroup);
    if (
      previousInputs &&
      previousInputs.nodeData === node.data &&
      previousInputs.memberNodeIds === memberNodeIds &&
      previousInputs.collapsed === node.data.collapsed &&
      previousInputs.inputProxyPortIds === node.data.inputProxyHandleIds &&
      previousInputs.outputProxyPortIds === node.data.outputProxyHandleIds
    ) {
      return previousGroup;
    }
  }

  const projectedGroup: FlowGroup = {
    id: node.id,
    label: node.data.label,
    memberNodeIds: [...memberNodeIds],
    collapsed: node.data.collapsed,
    inputProxyPortIds: [...node.data.inputProxyHandleIds],
    outputProxyPortIds: [...node.data.outputProxyHandleIds],
  };
  groupProjectionInputs.set(projectedGroup, {
    nodeData: node.data,
    memberNodeIds,
    collapsed: node.data.collapsed,
    inputProxyPortIds: node.data.inputProxyHandleIds,
    outputProxyPortIds: node.data.outputProxyHandleIds,
  });
  return projectedGroup;
}

function projectEdge(
  edge: Edge,
  settings: FlowEdgeSettings,
  previousEdge: PixiAppEdge | undefined,
): PixiAppEdge {
  if (previousEdge) {
    const previousInputs = edgeProjectionInputs.get(previousEdge);
    if (
      previousInputs &&
      previousInputs.appEdge === edge &&
      previousInputs.routingStyle === settings.routingStyle &&
      previousInputs.lineStyle === settings.lineStyle &&
      previousInputs.animationStyle === settings.animationStyle
    ) {
      return previousEdge;
    }
  }

  const projectedEdge = toPixiEdge(edge, settings);
  edgeProjectionInputs.set(projectedEdge, {
    appEdge: edge,
    routingStyle: settings.routingStyle,
    lineStyle: settings.lineStyle,
    animationStyle: settings.animationStyle,
  });
  return projectedEdge;
}

function toPixiEdge(edge: Edge, settings: FlowEdgeSettings): PixiAppEdge {
  if (!edge.sourceHandle || !edge.targetHandle) {
    throw new Error(`Edge "${edge.id}" is missing a port ID.`);
  }
  const sourcePort = parseHandleId(edge.sourceHandle);
  const targetPort = parseHandleId(edge.targetHandle);
  if (
    !sourcePort ||
    sourcePort.nodeId !== edge.source ||
    sourcePort.side !== 'output' ||
    !targetPort ||
    targetPort.nodeId !== edge.target ||
    targetPort.side !== 'input'
  ) {
    throw new Error(`Edge "${edge.id}" has invalid endpoint port IDs.`);
  }
  const controlPoints = readAppRoutePoints(edge.data, 'controlPoints', edge.id);
  const orthogonalTurns = readAppRoutePoints(edge.data, 'orthogonalTurns', edge.id);
  return {
    id: edge.id,
    type: FLOW_EDGE_TYPE,
    sourceNodeId: edge.source,
    sourcePortId: edge.sourceHandle,
    targetNodeId: edge.target,
    targetPortId: edge.targetHandle,
    settings: { ...settings },
    appData: edge.data,
    ...(controlPoints ? { controlPoints } : {}),
    ...(orthogonalTurns ? { orthogonalTurns } : {}),
  };
}

export function projectAppGraphToPixiV1(input: PixiGraphProjectionInput): PixiGraphProjectionV1 {
  const recipeNodes: GraphNode<'recipe', PixiRecipeData>[] = [];
  const groups: FlowGroup[] = [];
  const recipeNodeIds = new Set<string>();
  const previousNodes = new Map(
    (input.previousProjection?.graph.nodes ?? []).map((node) => [node.id, node]),
  );
  const previousEdges = new Map(
    (input.previousProjection?.graph.edges ?? []).map((edge) => [edge.id, edge]),
  );
  const previousGroups = new Map(
    (input.previousProjection?.graph.groups ?? []).map((group) => [group.id, group]),
  );

  for (const node of input.nodes) {
    if (isRecipeNode(node)) {
      const recipe =
        input.activeRecipeByNodeId?.get(node.id) ??
        resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
      if (!recipe)
        throw new Error(`Recipe "${node.data.recipeId}" for node "${node.id}" is unavailable.`);
      const previousNode = previousNodes.get(node.id);
      const projectedNode = projectRecipeNode(
        node,
        recipe,
        input.recipePresentationByNodeId?.get(node.id),
        previousNode,
      );
      recipeNodes.push(projectedNode);
      recipeNodeIds.add(node.id);
    } else if (isGroupNode(node)) {
      const previousGroup = previousGroups.get(node.id);
      const memberNodeIds = input.groupMemberIds[node.id] ?? [];
      const projectedGroup = projectGroup(node, memberNodeIds, previousGroup);
      groups.push(projectedGroup);
    } else {
      throw new Error('Unsupported app node type for Pixi canvas.');
    }
  }

  const groupIds = new Set(groups.map((group) => group.id));
  const groupForMember = new Map<string, string>();
  for (const group of groups) {
    for (const memberNodeId of group.memberNodeIds) {
      const member = input.nodes.find((node) => node.id === memberNodeId);
      if (!isRecipeNode(member) || member.data.groupId !== group.id) {
        throw new Error(`Group "${group.id}" has invalid member "${memberNodeId}".`);
      }
      if (groupForMember.has(memberNodeId)) {
        throw new Error(`Node "${memberNodeId}" belongs to more than one group.`);
      }
      groupForMember.set(memberNodeId, group.id);
    }
  }
  for (const node of input.nodes) {
    if (!isRecipeNode(node)) continue;
    if (node.data.groupId) {
      if (!groupIds.has(node.data.groupId)) {
        throw new Error(`Node "${node.id}" references missing group "${node.data.groupId}".`);
      }
      if (groupForMember.get(node.id) !== node.data.groupId) {
        throw new Error(
          `Node "${node.id}" is missing from group "${node.data.groupId}" membership.`,
        );
      }
    } else if (groupForMember.has(node.id)) {
      throw new Error(`Ungrouped node "${node.id}" is listed as a group member.`);
    }
  }

  const settings = toEdgeSettings(input.edgeStyle);
  const edges: PixiAppEdge[] = [];
  for (const edge of input.edges) {
    if (edge.id.startsWith('proxy-')) continue;
    if (!recipeNodeIds.has(edge.source) || !recipeNodeIds.has(edge.target)) {
      throw new Error(`Edge "${edge.id}" must reference recipe nodes.`);
    }
    const previousEdge = previousEdges.get(edge.id);
    edges.push(projectEdge(edge, settings, previousEdge));
  }

  return {
    adapterVersion: PIXI_GRAPH_ADAPTER_VERSION,
    graph: {
      nodes: recipeNodes,
      edges,
      groups,
      edgeDefaults: settings,
    },
  };
}
