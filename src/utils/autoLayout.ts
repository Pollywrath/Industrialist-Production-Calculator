import type { Edge } from '@xyflow/react';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { EdgePathStyle } from '../stores/useEdgeThemeStore';
import { resolveActiveRecipe } from '../data/lookup';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import type { CanvasNode, GroupNodeType, RecipeNodeType } from '../types/nodes';
import {
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
  RECT_GAP,
  RECT_HEIGHT,
  SNAP_GRID,
} from '../components/shared/layoutConstants';
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING_X,
  GROUP_PADDING_Y,
  computeGroupBoundsByGroupId,
  getCollapsedGroupHeight,
} from './groupBounds';
import { buildHandleId, parseHandleId } from './idGenerator';

const IO_COLUMN_TOP_PAD = 17;
const HANDLE_STEP = RECT_HEIGHT + RECT_GAP;

const GRID_X = SNAP_GRID[0];
const GRID_Y = SNAP_GRID[1];
const EXPANDED_GROUP_PADDING = `[top=${GROUP_HEADER_HEIGHT + GROUP_PADDING_Y}, left=${GROUP_PADDING_X}, bottom=${GROUP_PADDING_Y}, right=${GROUP_PADDING_X}]`;
const ORTHOGONAL_MIN_SEGMENT_LENGTH = 12;
const MAX_ROUTE_LANE_INDEX = 3;
const ROUTE_OBSTACLE_PADDING = 6;
const ROUTE_COLLISION_PENALTY = 1_000_000;
const ROUTE_EPSILON = 0.001;

const snapToGrid = (x: number, y: number) => ({
  x: Math.round(x / GRID_X) * GRID_X,
  y: Math.round(y / GRID_Y) * GRID_Y,
});

const snapX = (x: number) => Math.round(x / GRID_X) * GRID_X;
const snapY = (y: number) => Math.round(y / GRID_Y) * GRID_Y;

const elk = new ELK({
  workerUrl: elkWorkerUrl,
  workerFactory: (url) => new Worker(url ?? elkWorkerUrl),
});

interface AutoLayoutOptions {
  edgePath?: EdgePathStyle;
}

interface NodeHandlesMeta {
  inputOrder: number[];
  outputOrder: number[];
  inputCount: number;
  outputCount: number;
}

type LayoutNodeKind = 'recipe' | 'collapsed-group' | 'expanded-group';

interface LayoutNodeSpec {
  id: string;
  kind: LayoutNodeKind;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  inputOrder: number[];
  outputOrder: number[];
  commitPortOrder: boolean;
}

interface LayoutEdgeSpec {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface LayoutComponentResult {
  layoutedChildren: LayoutedNode[];
  layoutedEdges: Array<{
    id: string;
    container?: string;
    sections?: Array<{
      bendPoints?: Array<{ x: number; y: number }>;
    }>;
  }>;
  bounds: { x: number; y: number; width: number; height: number };
}

interface LayoutGraphResult {
  positions: Map<string, { x: number; y: number }>;
  dimensions: Map<string, { width: number; height: number }>;
  inputOrders: Map<string, number[]>;
  outputOrders: Map<string, number[]>;
  edgeUpdates: Map<string, EdgeUpdate>;
}

interface LayoutedNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  ports?: Array<{
    id: string;
    x?: number;
    y?: number;
  }>;
  children?: LayoutedNode[];
}

interface LayoutedNodePlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports?: LayoutedNode['ports'];
}

interface ElkInputNode {
  id: string;
  width?: number;
  height?: number;
  ports?: ReturnType<typeof buildPorts>;
  children?: ElkInputNode[];
  properties?: Record<string, string>;
}

interface EdgeUpdate {
  clearControlPoints?: boolean;
  orthogonalTurns?: Array<{ x: number; y: number }>;
}

const createIndexOrder = (count: number): number[] =>
  Array.from({ length: count }, (_unused, index) => index);

function getRecipeNodeHandlesMeta(node: RecipeNodeType): NodeHandlesMeta {
  const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
  const fallbackInputCount = recipe?.inputs.length ?? 0;
  const fallbackOutputCount = recipe?.outputs.length ?? 0;

  const inputOrder =
    node.data.inputOrder?.slice() ??
    Array.from({ length: fallbackInputCount }, (_unused, index) => index);
  const outputOrder =
    node.data.outputOrder?.slice() ??
    Array.from({ length: fallbackOutputCount }, (_unused, index) => index);

  return {
    inputOrder,
    outputOrder,
    inputCount: inputOrder.length,
    outputCount: outputOrder.length,
  };
}

function getCollapsedGroupHandlesMeta(node: GroupNodeType): NodeHandlesMeta {
  const inputCount = node.data.inputProxyHandleIds.length;
  const outputCount = node.data.outputProxyHandleIds.length;

  return {
    inputOrder: createIndexOrder(inputCount),
    outputOrder: createIndexOrder(outputCount),
    inputCount,
    outputCount,
  };
}

function calculateRecipeNodeHeight(node: RecipeNodeType): number {
  const { inputCount, outputCount } = getRecipeNodeHandlesMeta(node);
  const maxCount = Math.max(inputCount, outputCount, 1);
  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  return BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
}

function getHandleY(
  side: 'left' | 'right',
  displayIndex: number,
  inputCount: number,
  outputCount: number,
): number {
  const maxCount = Math.max(inputCount, outputCount);
  const sideCount = side === 'left' ? inputCount : outputCount;
  const verticalOffset = ((maxCount - sideCount) * HANDLE_STEP) / 2;
  return (
    BASE_INFO_HEIGHT +
    IO_COLUMN_TOP_PAD +
    verticalOffset +
    displayIndex * HANDLE_STEP +
    RECT_HEIGHT / 2
  );
}

function getLayoutPortY(
  side: 'input' | 'output',
  displayIndex: number,
  inputCount: number,
  outputCount: number,
): number {
  return getHandleY(side === 'input' ? 'left' : 'right', displayIndex, inputCount, outputCount);
}

function createRecipeLayoutNode(node: RecipeNodeType, parentId?: string): LayoutNodeSpec {
  const meta = getRecipeNodeHandlesMeta(node);
  return {
    id: node.id,
    kind: 'recipe',
    parentId,
    position: node.position,
    width: node.width ?? NODE_CSS_WIDTH,
    height: node.height ?? calculateRecipeNodeHeight(node),
    inputOrder: meta.inputOrder,
    outputOrder: meta.outputOrder,
    commitPortOrder: true,
  };
}

function createExpandedGroupLayoutNode(node: GroupNodeType): LayoutNodeSpec {
  return {
    id: node.id,
    kind: 'expanded-group',
    position: node.position,
    width: node.width ?? EMPTY_GROUP_WIDTH,
    height: node.height ?? EMPTY_GROUP_HEIGHT,
    inputOrder: [],
    outputOrder: [],
    commitPortOrder: false,
  };
}

function createCollapsedGroupLayoutNode(node: GroupNodeType): LayoutNodeSpec {
  const meta = getCollapsedGroupHandlesMeta(node);
  const fallbackHeight = getCollapsedGroupHeight(meta.inputCount, meta.outputCount);
  return {
    id: node.id,
    kind: 'collapsed-group',
    position: node.position,
    width: node.width ?? node.measured?.width ?? NODE_CSS_WIDTH,
    height: node.height ?? node.measured?.height ?? fallbackHeight,
    inputOrder: meta.inputOrder,
    outputOrder: meta.outputOrder,
    commitPortOrder: true,
  };
}

function buildPorts(node: LayoutNodeSpec, inputOrder: number[], outputOrder: number[]) {
  const inputCount = inputOrder.length;
  const outputCount = outputOrder.length;

  const inputPorts = inputOrder.map((handleIndex, displayIndex) => ({
    id: buildHandleId(node.id, 'input', handleIndex),
    properties: { 'port.side': 'WEST', 'port.index': String(displayIndex) },
    x: 0,
    y: getLayoutPortY('input', displayIndex, inputCount, outputCount),
  }));

  const outputPorts = outputOrder.map((handleIndex, displayIndex) => ({
    id: buildHandleId(node.id, 'output', handleIndex),
    properties: { 'port.side': 'EAST', 'port.index': String(displayIndex) },
    x: node.width,
    y: getLayoutPortY('output', displayIndex, inputCount, outputCount),
  }));

  return [...inputPorts, ...outputPorts];
}

function findConnectedComponents(
  nodes: LayoutNodeSpec[],
  edges: LayoutEdgeSpec[],
): Array<Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (let i = 0; i < nodes.length; i++) {
    adjacency.set(nodes[i].id, new Set());
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.parentId || !adjacency.has(node.parentId)) continue;
    adjacency.get(node.id)?.add(node.parentId);
    adjacency.get(node.parentId)?.add(node.id);
  }

  const visited = new Set<string>();
  const components: Array<Set<string>> = [];

  for (let i = 0; i < nodes.length; i++) {
    const startId = nodes[i].id;
    if (visited.has(startId)) continue;

    const component = new Set<string>();
    const stack = [startId];

    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      component.add(id);

      const neighbors = adjacency.get(id);
      if (!neighbors) continue;
      neighbors.forEach((neighborId) => {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      });
    }

    components.push(component);
  }

  return components;
}

function calculateChildrenBounds(children: LayoutComponentResult['layoutedChildren']) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const width = node.width ?? 0;
    const height = node.height ?? 0;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    throw new Error('ELK produced invalid component bounds.');
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getNodePortOrders(
  node: LayoutNodeSpec,
  nodePortOrders: Map<string, { inputOrder: number[]; outputOrder: number[] }> | undefined,
) {
  return (
    nodePortOrders?.get(node.id) ?? {
      inputOrder: createIndexOrder(node.inputOrder.length),
      outputOrder: createIndexOrder(node.outputOrder.length),
    }
  );
}

function buildHierarchicalElkNodes(
  componentNodes: LayoutNodeSpec[],
  portConstraints: 'FIXED_SIDE' | 'FIXED_POS',
  properties: Record<string, string>,
  nodePortOrders?: Map<string, { inputOrder: number[]; outputOrder: number[] }>,
): ElkInputNode[] {
  const componentNodeIds = new Set(componentNodes.map((node) => node.id));
  const childrenByParentId = new Map<string | null, LayoutNodeSpec[]>();

  for (let i = 0; i < componentNodes.length; i++) {
    const node = componentNodes[i];
    const parentId = node.parentId && componentNodeIds.has(node.parentId) ? node.parentId : null;
    const children = childrenByParentId.get(parentId);
    if (children) {
      children.push(node);
    } else {
      childrenByParentId.set(parentId, [node]);
    }
  }

  childrenByParentId.forEach((children) => {
    children.sort((a, b) => a.id.localeCompare(b.id));
  });

  const buildNode = (node: LayoutNodeSpec): ElkInputNode => {
    if (node.kind === 'expanded-group') {
      const children = (childrenByParentId.get(node.id) ?? []).map(buildNode);
      const elkNode: ElkInputNode = {
        id: node.id,
        children,
        properties: {
          ...properties,
          'elk.padding': EXPANDED_GROUP_PADDING,
        },
      };

      if (children.length === 0) {
        elkNode.width = node.width;
        elkNode.height = node.height;
      }

      return elkNode;
    }

    const orders = getNodePortOrders(node, nodePortOrders);
    return {
      id: node.id,
      width: node.width,
      height: node.height,
      ports: buildPorts(node, orders.inputOrder, orders.outputOrder),
      properties: {
        portConstraints,
        'org.eclipse.elk.portConstraints': portConstraints,
      },
    };
  };

  return (childrenByParentId.get(null) ?? []).map(buildNode);
}

interface RouteSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface RouteRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PortMetrics {
  displayIndex: number;
  y: number;
}

function getHandleDisplayIndex(order: number[], handleIndex: number): number {
  const displayIndex = order.indexOf(handleIndex);
  if (displayIndex >= 0) return displayIndex;
  if (order.length === 0) return 0;
  return Math.max(0, Math.min(handleIndex, order.length - 1));
}

function getPortMetrics(
  node: LayoutNodeSpec,
  parsedHandle: NonNullable<ReturnType<typeof parseHandleId>>,
  inputOrders: Map<string, number[]>,
  outputOrders: Map<string, number[]>,
): PortMetrics {
  const inputOrder = inputOrders.get(node.id) ?? node.inputOrder;
  const outputOrder = outputOrders.get(node.id) ?? node.outputOrder;
  const order = parsedHandle.side === 'input' ? inputOrder : outputOrder;
  const displayIndex = getHandleDisplayIndex(order, parsedHandle.index);

  return {
    displayIndex,
    y: getLayoutPortY(parsedHandle.side, displayIndex, inputOrder.length, outputOrder.length),
  };
}

function clampBackwardSourceRail(x: number, sourceX: number): number {
  return Math.max(sourceX + ORTHOGONAL_MIN_SEGMENT_LENGTH, snapX(x));
}

function clampBackwardTargetRail(x: number, targetX: number): number {
  return Math.min(targetX - ORTHOGONAL_MIN_SEGMENT_LENGTH, snapX(x));
}

function buildFourTurnRouteSegments(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  xA: number,
  xB: number,
  midY: number,
): RouteSegment[] {
  return [
    { x1: sourceX, y1: sourceY, x2: xA, y2: sourceY },
    { x1: xA, y1: sourceY, x2: xA, y2: midY },
    { x1: xA, y1: midY, x2: xB, y2: midY },
    { x1: xB, y1: midY, x2: xB, y2: targetY },
    { x1: xB, y1: targetY, x2: targetX, y2: targetY },
  ];
}

function buildTwoTurnRouteSegments(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  midX: number,
): RouteSegment[] {
  return [
    { x1: sourceX, y1: sourceY, x2: midX, y2: sourceY },
    { x1: midX, y1: sourceY, x2: midX, y2: targetY },
    { x1: midX, y1: targetY, x2: targetX, y2: targetY },
  ];
}

function routeLength(segments: RouteSegment[]): number {
  return segments.reduce(
    (sum, segment) =>
      sum + Math.abs(segment.x2 - segment.x1) + Math.abs(segment.y2 - segment.y1),
    0,
  );
}

function horizontalSegmentIntersectsRect(segment: RouteSegment, rect: RouteRect): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  return (
    segment.y1 > rect.y + ROUTE_EPSILON &&
    segment.y1 < rect.y + rect.height - ROUTE_EPSILON &&
    maxX > rect.x + ROUTE_EPSILON &&
    minX < rect.x + rect.width - ROUTE_EPSILON
  );
}

function verticalSegmentIntersectsRect(segment: RouteSegment, rect: RouteRect): boolean {
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);
  return (
    segment.x1 > rect.x + ROUTE_EPSILON &&
    segment.x1 < rect.x + rect.width - ROUTE_EPSILON &&
    maxY > rect.y + ROUTE_EPSILON &&
    minY < rect.y + rect.height - ROUTE_EPSILON
  );
}

function segmentIntersectsRect(segment: RouteSegment, rect: RouteRect): boolean {
  return Math.abs(segment.y1 - segment.y2) < ROUTE_EPSILON
    ? horizontalSegmentIntersectsRect(segment, rect)
    : verticalSegmentIntersectsRect(segment, rect);
}

function isAncestorOf(
  nodeId: string,
  potentialAncestorId: string,
  nodeMap: Map<string, LayoutNodeSpec>,
): boolean {
  let currentId = nodeMap.get(nodeId)?.parentId;
  while (currentId) {
    if (currentId === potentialAncestorId) return true;
    currentId = nodeMap.get(currentId)?.parentId;
  }
  return false;
}

function shouldSkipRouteObstacle(
  obstacleId: string,
  sourceId: string,
  targetId: string,
  nodeMap: Map<string, LayoutNodeSpec>,
): boolean {
  return (
    obstacleId === sourceId ||
    obstacleId === targetId ||
    isAncestorOf(sourceId, obstacleId, nodeMap) ||
    isAncestorOf(targetId, obstacleId, nodeMap)
  );
}

function buildRouteRect(
  id: string,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): RouteRect | null {
  const position = positions.get(id);
  const dimension = dimensions.get(id);
  if (!position || !dimension) return null;

  return {
    id,
    x: position.x,
    y: position.y,
    width: dimension.width,
    height: dimension.height,
  };
}

function getExpandedRouteRect(rect: RouteRect, padding: number): RouteRect {
  return {
    id: rect.id,
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function countRouteCollisions(
  segments: RouteSegment[],
  sourceId: string,
  targetId: string,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): number {
  let collisions = 0;

  componentNodeIds.forEach((nodeId) => {
    if (shouldSkipRouteObstacle(nodeId, sourceId, targetId, nodeMap)) return;

    const rect = buildRouteRect(nodeId, positions, dimensions);
    if (!rect) return;

    const expandedRect = getExpandedRouteRect(rect, ROUTE_OBSTACLE_PADDING);
    for (let i = 0; i < segments.length; i++) {
      if (segmentIntersectsRect(segments[i], expandedRect)) {
        collisions++;
      }
    }
  });

  return collisions;
}

function scoreRoute(
  segments: RouteSegment[],
  sourceId: string,
  targetId: string,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): number {
  const collisions = countRouteCollisions(
    segments,
    sourceId,
    targetId,
    componentNodeIds,
    nodeMap,
    positions,
    dimensions,
  );

  return routeLength(segments) + collisions * ROUTE_COLLISION_PENALTY;
}

function addCandidate(candidates: Set<number>, value: number, snap: (value: number) => number): void {
  if (!Number.isFinite(value)) return;
  candidates.add(snap(value));
}

function nearestCandidates(candidates: Set<number>, preferred: number, limit: number): number[] {
  return [...candidates]
    .filter(Number.isFinite)
    .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
    .slice(0, limit);
}

function addObstacleYCandidates(
  candidates: Set<number>,
  sourceId: string,
  targetId: string,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
  minX: number,
  maxX: number,
): void {
  componentNodeIds.forEach((nodeId) => {
    if (shouldSkipRouteObstacle(nodeId, sourceId, targetId, nodeMap)) return;

    const rect = buildRouteRect(nodeId, positions, dimensions);
    if (!rect) return;
    if (rect.x > maxX || rect.x + rect.width < minX) return;

    addCandidate(candidates, rect.y - GRID_Y, snapY);
    addCandidate(candidates, rect.y + rect.height + GRID_Y, snapY);
  });
}

function chooseFourTurnRoute(
  sourceId: string,
  targetId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceLaneIndex: number,
  targetLaneIndex: number,
  bendPoints: Array<{ x: number; y: number }>,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): Array<{ x: number; y: number }> {
  const sourceLane = Math.min(sourceLaneIndex, MAX_ROUTE_LANE_INDEX);
  const targetLane = Math.min(targetLaneIndex, MAX_ROUTE_LANE_INDEX);
  const preferredXA = clampBackwardSourceRail(
    sourceX + ORTHOGONAL_MIN_SEGMENT_LENGTH + sourceLane * GRID_X,
    sourceX,
  );
  const preferredXB = clampBackwardTargetRail(
    targetX - ORTHOGONAL_MIN_SEGMENT_LENGTH - targetLane * GRID_X,
    targetX,
  );

  const xACandidates = new Set<number>([preferredXA]);
  const xBCandidates = new Set<number>([preferredXB]);
  const yCandidates = new Set<number>();

  addCandidate(yCandidates, (sourceY + targetY) / 2, snapY);

  for (let i = 0; i < bendPoints.length; i++) {
    const point = bendPoints[i];
    if (point.x > sourceX + ORTHOGONAL_MIN_SEGMENT_LENGTH) {
      addCandidate(xACandidates, clampBackwardSourceRail(point.x, sourceX), (value) => value);
    }
    if (point.x < targetX - ORTHOGONAL_MIN_SEGMENT_LENGTH) {
      addCandidate(xBCandidates, clampBackwardTargetRail(point.x, targetX), (value) => value);
    }
    if (i > 0 && i < bendPoints.length - 1) {
      addCandidate(yCandidates, point.y, snapY);
    }
  }

  const sourceRect = buildRouteRect(sourceId, positions, dimensions);
  const targetRect = buildRouteRect(targetId, positions, dimensions);
  if (sourceRect) {
    addCandidate(yCandidates, sourceRect.y - GRID_Y, snapY);
    addCandidate(yCandidates, sourceRect.y + sourceRect.height + GRID_Y, snapY);
  }
  if (targetRect) {
    addCandidate(yCandidates, targetRect.y - GRID_Y, snapY);
    addCandidate(yCandidates, targetRect.y + targetRect.height + GRID_Y, snapY);
  }

  const xAs = nearestCandidates(xACandidates, preferredXA, 5);
  const xBs = nearestCandidates(xBCandidates, preferredXB, 5);
  addObstacleYCandidates(
    yCandidates,
    sourceId,
    targetId,
    componentNodeIds,
    nodeMap,
    positions,
    dimensions,
    Math.min(targetX, preferredXB),
    Math.max(sourceX, preferredXA),
  );
  const midYs = nearestCandidates(yCandidates, (sourceY + targetY) / 2, 14);

  let bestRoute = [
    { x: preferredXA, y: sourceY },
    { x: preferredXA, y: snapY((sourceY + targetY) / 2) },
    { x: preferredXB, y: snapY((sourceY + targetY) / 2) },
    { x: preferredXB, y: targetY },
  ];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let xAIndex = 0; xAIndex < xAs.length; xAIndex++) {
    const xA = xAs[xAIndex];
    for (let xBIndex = 0; xBIndex < xBs.length; xBIndex++) {
      const xB = xBs[xBIndex];
      for (let yIndex = 0; yIndex < midYs.length; yIndex++) {
        const midY = midYs[yIndex];
        const segments = buildFourTurnRouteSegments(
          sourceX,
          sourceY,
          targetX,
          targetY,
          xA,
          xB,
          midY,
        );
        const score = scoreRoute(
          segments,
          sourceId,
          targetId,
          componentNodeIds,
          nodeMap,
          positions,
          dimensions,
        );

        if (score < bestScore) {
          bestScore = score;
          bestRoute = [
            { x: xA, y: sourceY },
            { x: xA, y: midY },
            { x: xB, y: midY },
            { x: xB, y: targetY },
          ];
        }
      }
    }
  }

  return bestRoute;
}

function chooseTwoTurnMidX(
  sourceId: string,
  targetId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  preferredX: number,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): number {
  const candidates = new Set<number>([preferredX]);

  componentNodeIds.forEach((nodeId) => {
    if (shouldSkipRouteObstacle(nodeId, sourceId, targetId, nodeMap)) return;

    const rect = buildRouteRect(nodeId, positions, dimensions);
    if (!rect) return;
    addCandidate(candidates, rect.x - GRID_X, snapX);
    addCandidate(candidates, rect.x + rect.width + GRID_X, snapX);
  });

  let bestX = preferredX;
  let bestScore = Number.POSITIVE_INFINITY;
  const midXs = nearestCandidates(candidates, preferredX, 12);
  for (let i = 0; i < midXs.length; i++) {
    const midX = midXs[i];
    if (midX <= Math.min(sourceX, targetX) || midX >= Math.max(sourceX, targetX)) continue;

    const segments = buildTwoTurnRouteSegments(sourceX, sourceY, targetX, targetY, midX);
    const score = scoreRoute(
      segments,
      sourceId,
      targetId,
      componentNodeIds,
      nodeMap,
      positions,
      dimensions,
    );
    if (score < bestScore) {
      bestScore = score;
      bestX = midX;
    }
  }

  return bestX;
}

function chooseSelfFourTurnRoute(
  edge: LayoutEdgeSpec,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
  inputOrders: Map<string, number[]>,
  outputOrders: Map<string, number[]>,
  componentNodeIds: Set<string>,
): Array<{ x: number; y: number }> | null {
  const node = nodeMap.get(edge.source);
  const position = positions.get(edge.source);
  const dimension = dimensions.get(edge.source);
  if (!node || !position || !dimension) return null;

  const sourceHandle = edge.sourceHandle ?? buildHandleId(edge.source, 'output', 0);
  const targetHandle = edge.targetHandle ?? buildHandleId(edge.target, 'input', 0);
  const sourceParsed = parseHandleId(sourceHandle);
  const targetParsed = parseHandleId(targetHandle);
  if (!sourceParsed || !targetParsed) return null;

  const sourceMetrics = getPortMetrics(node, sourceParsed, inputOrders, outputOrders);
  const targetMetrics = getPortMetrics(node, targetParsed, inputOrders, outputOrders);
  const sourceX = position.x + dimension.width;
  const targetX = position.x;
  const sourceY = position.y + sourceMetrics.y;
  const targetY = position.y + targetMetrics.y;
  const sourceLane = Math.min(sourceMetrics.displayIndex, MAX_ROUTE_LANE_INDEX);
  const targetLane = Math.min(targetMetrics.displayIndex, MAX_ROUTE_LANE_INDEX);
  const xA = clampBackwardSourceRail(
    sourceX + ORTHOGONAL_MIN_SEGMENT_LENGTH + sourceLane * GRID_X,
    sourceX,
  );
  const xB = clampBackwardTargetRail(
    targetX - ORTHOGONAL_MIN_SEGMENT_LENGTH - targetLane * GRID_X,
    targetX,
  );

  const yCandidates = new Set<number>();
  addCandidate(yCandidates, position.y - GRID_Y, snapY);
  addCandidate(yCandidates, position.y - GRID_Y * 2, snapY);
  addCandidate(yCandidates, position.y + dimension.height + GRID_Y, snapY);
  addCandidate(yCandidates, position.y + dimension.height + GRID_Y * 2, snapY);
  addObstacleYCandidates(
    yCandidates,
    edge.source,
    edge.target,
    componentNodeIds,
    nodeMap,
    positions,
    dimensions,
    xB,
    xA,
  );

  let bestMidY = snapY(position.y - GRID_Y);
  let bestScore = Number.POSITIVE_INFINITY;
  const midYs = nearestCandidates(yCandidates, sourceY, 12);

  for (let i = 0; i < midYs.length; i++) {
    const midY = midYs[i];
    const segments = buildFourTurnRouteSegments(sourceX, sourceY, targetX, targetY, xA, xB, midY);
    const score = scoreRoute(
      segments,
      edge.source,
      edge.target,
      componentNodeIds,
      nodeMap,
      positions,
      dimensions,
    );

    if (score < bestScore) {
      bestScore = score;
      bestMidY = midY;
    }
  }

  return [
    { x: xA, y: sourceY },
    { x: xA, y: bestMidY },
    { x: xB, y: bestMidY },
    { x: xB, y: targetY },
  ];
}

function collectPortOrders(
  children: LayoutedNode[] | undefined,
  nodePortOrders: Map<string, { inputOrder: number[]; outputOrder: number[] }>,
): void {
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childPorts = child.ports ?? [];
    const inputs: Array<{ index: number; y: number }> = [];
    const outputs: Array<{ index: number; y: number }> = [];

    for (let j = 0; j < childPorts.length; j++) {
      const port = childPorts[j];
      const parsed = parseHandleId(port.id);
      if (!parsed) continue;

      if (parsed.side === 'input') {
        inputs.push({ index: parsed.index, y: port.y ?? 0 });
      } else if (parsed.side === 'output') {
        outputs.push({ index: parsed.index, y: port.y ?? 0 });
      }
    }

    if (inputs.length > 0 || outputs.length > 0) {
      inputs.sort((a, b) => a.y - b.y);
      outputs.sort((a, b) => a.y - b.y);

      nodePortOrders.set(child.id, {
        inputOrder: inputs.map((item) => item.index),
        outputOrder: outputs.map((item) => item.index),
      });
    }

    collectPortOrders(child.children, nodePortOrders);
  }
}

function collectLayoutedNodePlacements(
  children: LayoutedNode[] | undefined,
  placements: Map<string, LayoutedNodePlacement>,
  offsetX = 0,
  offsetY = 0,
): void {
  if (!children) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const x = offsetX + (child.x ?? 0);
    const y = offsetY + (child.y ?? 0);

    placements.set(child.id, {
      id: child.id,
      x,
      y,
      width: child.width ?? 0,
      height: child.height ?? 0,
      ports: child.ports,
    });

    collectLayoutedNodePlacements(child.children, placements, x, y);
  }
}

async function layoutComponent(
  componentNodes: LayoutNodeSpec[],
  componentEdges: LayoutEdgeSpec[],
  edgePath: EdgePathStyle,
): Promise<{
  children: LayoutComponentResult['layoutedChildren'];
  edges: LayoutComponentResult['layoutedEdges'];
}> {
  const elkRouting = edgePath === 'straight' ? 'POLYLINE' : 'ORTHOGONAL';

  const nodeXMap = new Map<string, number>();
  const nodeOrderMap = new Map<string, number>();
  for (let i = 0; i < componentNodes.length; i++) {
    const node = componentNodes[i];
    nodeXMap.set(node.id, node.position.x);
    nodeOrderMap.set(node.id, i);
  }

  const elkEdges = componentEdges.map((edge) => {
    const sourceHandle = edge.sourceHandle ?? buildHandleId(edge.source, 'output', 0);
    const targetHandle = edge.targetHandle ?? buildHandleId(edge.target, 'input', 0);

    const sourceX = nodeXMap.get(edge.source);
    const targetX = nodeXMap.get(edge.target);

    const isBackwardByX =
      typeof sourceX === 'number' && typeof targetX === 'number' ? targetX <= sourceX : false;

    const sourceOrder = nodeOrderMap.get(edge.source) ?? 0;
    const targetOrder = nodeOrderMap.get(edge.target) ?? 0;
    const isBackwardByOrder = targetOrder <= sourceOrder;

    const isBackward = isBackwardByX || isBackwardByOrder;

    return {
      id: edge.id,
      sources: [sourceHandle],
      targets: [targetHandle],
      properties: {
        ...(isBackward ? { 'elk.layered.feedbackEdge': 'true' } : {}),
        'elk.layered.priority.straightness': '1000',
      },
    };
  });

  const baseProperties = {
    algorithm: 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': elkRouting,
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.crossingMinimization.hierarchicalSweepiness': '0.7',
    'elk.layered.crossingMinimization.greedySwitchHierarchical.type': 'TWO_SIDED',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
    'elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default': 'NONE',
    'elk.layered.compaction.postCompaction.strategy': 'NONE',
    'elk.layered.spacing.nodeNodeBetweenLayers': edgePath === 'straight' ? '152' : '114',
    'elk.spacing.nodeNode': '39',
    'elk.layered.spacing.edgeNodeBetweenLayers': '38',
    'elk.layered.spacing.edgeEdgeBetweenLayers': edgePath === 'straight' ? '38' : '19',
    'elk.spacing.edgeNode': edgePath === 'orthogonal' ? '38' : '19',
    'elk.layered.feedbackEdges': 'true',
    'elk.padding': '[top=57, left=57, bottom=57, right=57]',
  };

  const elkNodesPass1 = buildHierarchicalElkNodes(
    componentNodes,
    'FIXED_SIDE',
    baseProperties,
  );

  const graphPass1 = {
    id: 'root',
    properties: baseProperties,
    children: elkNodesPass1,
    edges: elkEdges,
  };

  const layoutedPass1 = await elk.layout(graphPass1);

  const nodePortOrders = new Map<string, { inputOrder: number[]; outputOrder: number[] }>();
  collectPortOrders(layoutedPass1.children as LayoutedNode[] | undefined, nodePortOrders);

  const elkNodesPass2 = buildHierarchicalElkNodes(
    componentNodes,
    'FIXED_POS',
    baseProperties,
    nodePortOrders,
  );

  const graphPass2 = {
    id: 'root',
    properties: baseProperties,
    children: elkNodesPass2,
    edges: elkEdges,
  };

  const layoutedPass2 = await elk.layout(graphPass2);
  const children = (layoutedPass2.children ?? []) as LayoutComponentResult['layoutedChildren'];
  const edges = (layoutedPass2.edges ?? []) as LayoutComponentResult['layoutedEdges'];

  return {
    children,
    edges,
  };
}

function packComponents(componentResults: LayoutComponentResult[]) {
  const sorted = [...componentResults].sort((a, b) => b.bounds.width - a.bounds.width);
  const gap = snapX(152);
  const maxRowWidth = Math.max(3000, (sorted[0]?.bounds.width ?? 0) + gap * 2);

  const positions = new Map<number, { offsetX: number; offsetY: number }>();
  let rowX = 0;
  let rowY = 0;
  let rowMaxHeight = 0;

  sorted.forEach((comp, index) => {
    if (rowX > 0 && rowX + comp.bounds.width > maxRowWidth) {
      rowY += snapY(rowMaxHeight + gap);
      rowX = 0;
      rowMaxHeight = 0;
    }

    positions.set(index, { offsetX: rowX, offsetY: rowY });
    rowX += snapX(comp.bounds.width + gap);
    rowMaxHeight = Math.max(rowMaxHeight, comp.bounds.height);
  });

  return { sorted, positions };
}

function clampThreeSegmentX(x: number, sourceX: number, targetX: number): number {
  const minX = Math.min(sourceX, targetX);
  const maxX = Math.max(sourceX, targetX);
  const gap = maxX - minX;

  const margin = Math.min(12, gap / 2);
  const lowerBound = minX + margin;
  const upperBound = maxX - margin;

  if (lowerBound >= upperBound) {
    return (sourceX + targetX) / 2;
  }

  return Math.min(upperBound, Math.max(lowerBound, x));
}

function getSharedHandleComponents(
  edges: Array<{
    edgeId: string;
    sourceHandle: string | undefined;
    targetHandle: string | undefined;
    bestX: number;
  }>,
): string[][] {
  const edgesById = new Map<string, (typeof edges)[number]>();
  const handleToEdgeIds = new Map<string, string[]>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    edgesById.set(edge.edgeId, edge);

    if (edge.sourceHandle) {
      const sourceList = handleToEdgeIds.get(edge.sourceHandle);
      if (sourceList) {
        sourceList.push(edge.edgeId);
      } else {
        handleToEdgeIds.set(edge.sourceHandle, [edge.edgeId]);
      }
    }

    if (edge.targetHandle) {
      const targetList = handleToEdgeIds.get(edge.targetHandle);
      if (targetList) {
        targetList.push(edge.edgeId);
      } else {
        handleToEdgeIds.set(edge.targetHandle, [edge.edgeId]);
      }
    }
  }

  const visitedEdges = new Set<string>();
  const visitedHandles = new Set<string>();
  const components: string[][] = [];

  for (let i = 0; i < edges.length; i++) {
    const startId = edges[i].edgeId;
    if (visitedEdges.has(startId)) continue;

    const component: string[] = [];
    const stack = [startId];

    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || visitedEdges.has(id)) continue;
      visitedEdges.add(id);
      component.push(id);

      const edge = edgesById.get(id);
      if (!edge) continue;

      const handles = [edge.sourceHandle, edge.targetHandle];
      for (let handleIndex = 0; handleIndex < handles.length; handleIndex++) {
        const handleId = handles[handleIndex];
        if (!handleId || visitedHandles.has(handleId)) continue;
        visitedHandles.add(handleId);

        const connectedEdgeIds = handleToEdgeIds.get(handleId);
        if (!connectedEdgeIds) continue;
        for (let j = 0; j < connectedEdgeIds.length; j++) {
          const neighborEdgeId = connectedEdgeIds[j];
          if (!visitedEdges.has(neighborEdgeId)) {
            stack.push(neighborEdgeId);
          }
        }
      }
    }

    components.push(component);
  }

  return components;
}

async function layoutGraph(
  layoutNodes: LayoutNodeSpec[],
  layoutEdges: LayoutEdgeSpec[],
  edgePath: EdgePathStyle,
): Promise<LayoutGraphResult> {
  if (layoutNodes.length === 0) {
    return {
      positions: new Map(),
      dimensions: new Map(),
      inputOrders: new Map(),
      outputOrders: new Map(),
      edgeUpdates: new Map(),
    };
  }

  const components = findConnectedComponents(layoutNodes, layoutEdges);
  const nodeMap = new Map(layoutNodes.map((node) => [node.id, node]));
  const edgeMap = new Map(layoutEdges.map((edge) => [edge.id, edge]));

  const nodeIdToComponentIndex = new Map<string, number>();
  for (let i = 0; i < components.length; i++) {
    const componentNodeIds = components[i];
    componentNodeIds.forEach((id) => {
      nodeIdToComponentIndex.set(id, i);
    });
  }

  const componentEdgeLists: LayoutEdgeSpec[][] = Array.from(
    { length: components.length },
    () => [],
  );
  for (let i = 0; i < layoutEdges.length; i++) {
    const edge = layoutEdges[i];
    const sourceComponent = nodeIdToComponentIndex.get(edge.source);
    const targetComponent = nodeIdToComponentIndex.get(edge.target);
    if (sourceComponent !== undefined && sourceComponent === targetComponent) {
      componentEdgeLists[sourceComponent].push(edge);
    }
  }

  const componentResults: LayoutComponentResult[] = await Promise.all(
    components.map(async (componentNodeIds, componentIndex) => {
      const componentNodes = [...componentNodeIds]
        .map((id) => nodeMap.get(id))
        .filter((node): node is LayoutNodeSpec => !!node);
      componentNodes.sort((a, b) => a.id.localeCompare(b.id));

      const componentEdges = componentEdgeLists[componentIndex];
      componentEdges.sort((a, b) => a.id.localeCompare(b.id));

      try {
        const { children: layoutedChildren, edges: layoutedEdges } = await layoutComponent(
          componentNodes,
          componentEdges,
          edgePath,
        );

        return {
          layoutedChildren,
          layoutedEdges,
          bounds: calculateChildrenBounds(layoutedChildren),
        };
      } catch (error) {
        console.error('ELK layout failed for component:', error);
        const fallbackChildren = componentNodes
          .map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
            width: node.width,
            height: node.height,
          }));

        return {
          layoutedChildren: fallbackChildren,
          layoutedEdges: [],
          bounds: calculateChildrenBounds(fallbackChildren),
        };
      }
    }),
  );

  const { sorted, positions } = packComponents(componentResults);

  const finalPositions = new Map<string, { x: number; y: number }>();
  const finalDimensions = new Map<string, { width: number; height: number }>();
  const finalInputOrders = new Map<string, number[]>();
  const finalOutputOrders = new Map<string, number[]>();

  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;

    const placements = new Map<string, LayoutedNodePlacement>();
    collectLayoutedNodePlacements(comp.layoutedChildren, placements);

    placements.forEach((elkNode) => {
      finalPositions.set(elkNode.id, snapToGrid(tx(elkNode.x), ty(elkNode.y)));
      finalDimensions.set(elkNode.id, {
        width: elkNode.width,
        height: elkNode.height,
      });

      const layoutedPorts = elkNode.ports ?? [];
      const inputs: Array<{ index: number; y: number }> = [];
      const outputs: Array<{ index: number; y: number }> = [];

      for (let j = 0; j < layoutedPorts.length; j++) {
        const port = layoutedPorts[j];
        const parsed = parseHandleId(port.id);
        if (!parsed) continue;

        if (parsed.side === 'input') {
          inputs.push({ index: parsed.index, y: port.y ?? 0 });
        } else if (parsed.side === 'output') {
          outputs.push({ index: parsed.index, y: port.y ?? 0 });
        }
      }

      inputs.sort((a, b) => a.y - b.y);
      outputs.sort((a, b) => a.y - b.y);

      const nodeSpec = nodeMap.get(elkNode.id);
      if (nodeSpec?.commitPortOrder) {
        finalInputOrders.set(
          elkNode.id,
          inputs.map((item) => item.index),
        );
        finalOutputOrders.set(
          elkNode.id,
          outputs.map((item) => item.index),
        );
      }
    });
  });

  const edgeUpdates = new Map<string, EdgeUpdate>();

  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;
    const placements = new Map<string, LayoutedNodePlacement>();
    collectLayoutedNodePlacements(comp.layoutedChildren, placements);

    const forwardEdgesToProcess: Array<{
      edgeId: string;
      sourceId: string;
      targetId: string;
      sourceHandle: string;
      targetHandle: string;
      sourceX: number;
      targetX: number;
      sourceY: number;
      targetY: number;
      bestX: number;
    }> = [];

    for (let i = 0; i < comp.layoutedEdges.length; i++) {
      const elkEdge = comp.layoutedEdges[i];
      const layoutEdge = edgeMap.get(elkEdge.id);
      if (!layoutEdge) continue;

      if (edgePath === 'bezier' || edgePath === 'straight') {
        edgeUpdates.set(layoutEdge.id, { clearControlPoints: true });
        continue;
      }

      if (edgePath !== 'orthogonal') {
        continue;
      }

      const section = elkEdge.sections?.[0];
      if (!section?.bendPoints || section.bendPoints.length === 0) continue;

      const containerOffset =
        elkEdge.container && elkEdge.container !== 'root'
          ? placements.get(elkEdge.container)
          : undefined;
      const containerX = containerOffset?.x ?? 0;
      const containerY = containerOffset?.y ?? 0;

      const bendPoints = section.bendPoints.map((point) => ({
        x: tx(point.x + containerX),
        y: ty(point.y + containerY),
      }));

      const sourceHandle = layoutEdge.sourceHandle ?? buildHandleId(layoutEdge.source, 'output', 0);
      const targetHandle = layoutEdge.targetHandle ?? buildHandleId(layoutEdge.target, 'input', 0);
      const sourceParsed = sourceHandle ? parseHandleId(sourceHandle) : null;
      const targetParsed = targetHandle ? parseHandleId(targetHandle) : null;
      const sourcePos = finalPositions.get(layoutEdge.source);
      const targetPos = finalPositions.get(layoutEdge.target);
      const sourceNode = nodeMap.get(layoutEdge.source);
      const targetNode = nodeMap.get(layoutEdge.target);
      if (!sourceParsed || !targetParsed || !sourcePos || !targetPos || !sourceNode || !targetNode) {
        continue;
      }

      const sourceX = sourcePos.x + sourceNode.width;
      const targetX = targetPos.x;
      const sourceMetrics = getPortMetrics(
        sourceNode,
        sourceParsed,
        finalInputOrders,
        finalOutputOrders,
      );
      const targetMetrics = getPortMetrics(
        targetNode,
        targetParsed,
        finalInputOrders,
        finalOutputOrders,
      );
      const sourceY = sourcePos.y + sourceMetrics.y;
      const targetY = targetPos.y + targetMetrics.y;
      const isBackwardEdge = targetX < sourceX;
      const componentNodeIds = new Set(placements.keys());

      if (isBackwardEdge) {
        edgeUpdates.set(layoutEdge.id, {
          orthogonalTurns: chooseFourTurnRoute(
            layoutEdge.source,
            layoutEdge.target,
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourceMetrics.displayIndex,
            targetMetrics.displayIndex,
            bendPoints,
            componentNodeIds,
            nodeMap,
            finalPositions,
            finalDimensions,
          ),
        });
      } else {
        let bestX = bendPoints[0].x;
        let bestSpan = 0;

        for (let bendIndex = 0; bendIndex < bendPoints.length - 1; bendIndex++) {
          const current = bendPoints[bendIndex];
          const next = bendPoints[bendIndex + 1];
          if (Math.abs(current.x - next.x) >= 1) continue;

          const span = Math.abs(next.y - current.y);
          if (span <= bestSpan) continue;

          bestSpan = span;
          bestX = current.x;
        }

        forwardEdgesToProcess.push({
          edgeId: layoutEdge.id,
          sourceId: layoutEdge.source,
          targetId: layoutEdge.target,
          sourceHandle,
          targetHandle,
          sourceX,
          targetX,
          sourceY,
          targetY,
          bestX,
        });
      }
    }

    const gapGroups = new Map<string, typeof forwardEdgesToProcess>();
    const componentNodeIds = new Set(placements.keys());
    for (let i = 0; i < forwardEdgesToProcess.length; i++) {
      const fe = forwardEdgesToProcess[i];
      const key = `${fe.sourceX}_${fe.targetX}`;
      let list = gapGroups.get(key);
      if (!list) {
        list = [];
        gapGroups.set(key, list);
      }
      list.push(fe);
    }

    gapGroups.forEach((gapEdges, key) => {
      const parts = key.split('_');
      const sourceX = parseFloat(parts[0]);
      const targetX = parseFloat(parts[1]);

      const components = getSharedHandleComponents(gapEdges);

      const edgeMapForGap = new Map(gapEdges.map((e) => [e.edgeId, e]));
      const groups = components.map((component) => {
        const avgBestX =
          component.reduce((sum, id) => sum + (edgeMapForGap.get(id)?.bestX ?? 0), 0) /
          component.length;
        return {
          component,
          avgBestX,
        };
      });

      groups.sort((a, b) => a.avgBestX - b.avgBestX);

      const coords = groups.map((g) => clampThreeSegmentX(snapX(g.avgBestX), sourceX, targetX));

      for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (let i = 0; i < coords.length - 1; i++) {
          if (coords[i + 1] < coords[i] + 15) {
            coords[i + 1] = clampThreeSegmentX(coords[i] + 15, sourceX, targetX);
            changed = true;
          }
        }
        for (let i = coords.length - 1; i > 0; i--) {
          if (coords[i] < coords[i - 1] + 15) {
            coords[i - 1] = clampThreeSegmentX(coords[i] - 15, sourceX, targetX);
            changed = true;
          }
        }
        if (!changed) break;
      }

      groups.forEach((g, idx) => {
        const assignedX = coords[idx];
        g.component.forEach((edgeId) => {
          const edgeData = edgeMapForGap.get(edgeId);
          if (!edgeData) return;

          const routedX = chooseTwoTurnMidX(
            edgeData.sourceId,
            edgeData.targetId,
            edgeData.sourceX,
            edgeData.sourceY,
            edgeData.targetX,
            edgeData.targetY,
            assignedX,
            componentNodeIds,
            nodeMap,
            finalPositions,
            finalDimensions,
          );

          edgeUpdates.set(edgeId, {
            orthogonalTurns: [
              { x: routedX, y: edgeData.sourceY },
              { x: routedX, y: edgeData.targetY },
            ],
          });
        });
      });
    });
  });

  return {
    positions: finalPositions,
    dimensions: finalDimensions,
    inputOrders: finalInputOrders,
    outputOrders: finalOutputOrders,
    edgeUpdates,
  };
}

function applyIndexOrder<T>(values: T[], order: number[] | undefined): T[] {
  if (!order || order.length !== values.length) return values;

  const seen = new Set<number>();
  const ordered: T[] = [];
  for (let i = 0; i < order.length; i++) {
    const index = order[i];
    if (index < 0 || index >= values.length || seen.has(index)) return values;
    seen.add(index);
    ordered.push(values[index]);
  }

  return ordered;
}

function applyEdgeUpdate(edge: Edge, update: EdgeUpdate): Edge {
  const nextData: Record<string, unknown> = {
    ...(edge.data as Record<string, unknown> | undefined),
  };

  if (update.clearControlPoints) {
    delete nextData.controlPoints;
  }

  if (update.orthogonalTurns && update.orthogonalTurns.length > 0) {
    nextData.orthogonalTurns = update.orthogonalTurns;
  } else if ('orthogonalTurns' in nextData) {
    delete nextData.orthogonalTurns;
  }

  return {
    ...edge,
    data: nextData,
  };
}

function applyExpandedGroupBounds(
  nodes: readonly CanvasNode[],
  expandedGroupIds: ReadonlySet<string>,
): CanvasNode[] {
  if (expandedGroupIds.size === 0) return nodes as CanvasNode[];

  const boundsByGroupId = computeGroupBoundsByGroupId(nodes, expandedGroupIds);
  let changed = false;
  const nextNodes = new Array<CanvasNode>(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isGroupNode(node) || node.data.collapsed || !expandedGroupIds.has(node.id)) {
      nextNodes[i] = node;
      continue;
    }

    const bounds = boundsByGroupId.get(node.id);
    if (!bounds) {
      nextNodes[i] = node;
      continue;
    }

    if (
      node.position.x === bounds.x &&
      node.position.y === bounds.y &&
      node.width === bounds.width &&
      node.height === bounds.height
    ) {
      nextNodes[i] = node;
      continue;
    }

    changed = true;
    nextNodes[i] = {
      ...node,
      position: { x: bounds.x, y: bounds.y },
      width: bounds.width,
      height: bounds.height,
    };
  }

  return changed ? nextNodes : (nodes as CanvasNode[]);
}

export async function autoLayout(
  nodes: CanvasNode[],
  edges: Edge[],
  options: AutoLayoutOptions = {},
): Promise<{ nodes: CanvasNode[]; edges: Edge[] }> {
  if (!nodes || nodes.length === 0) {
    return { nodes, edges };
  }

  const edgePath = options.edgePath ?? 'orthogonal';
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groupNodes = nodes.filter(isGroupNode);
  const groupMap = new Map(groupNodes.map((node) => [node.id, node]));

  const layoutNodes: LayoutNodeSpec[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (isGroupNode(node)) {
      layoutNodes.push(
        node.data.collapsed
          ? createCollapsedGroupLayoutNode(node)
          : createExpandedGroupLayoutNode(node),
      );
      continue;
    }

    if (!isRecipeNode(node) || node.hidden) continue;

    const groupNode = node.data.groupId ? groupMap.get(node.data.groupId) : undefined;
    const parentId = groupNode && !groupNode.data.collapsed ? groupNode.id : undefined;
    layoutNodes.push(createRecipeLayoutNode(node, parentId));
  }

  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const layoutEdges: LayoutEdgeSpec[] = [];
  const selfEdges: LayoutEdgeSpec[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.hidden) continue;
    if (!layoutNodeIds.has(edge.source) || !layoutNodeIds.has(edge.target)) continue;

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (isGroupNode(sourceNode) && !sourceNode.data.collapsed) continue;
    if (isGroupNode(targetNode) && !targetNode.data.collapsed) continue;

    const layoutEdge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    };

    if (edge.source === edge.target) {
      selfEdges.push(layoutEdge);
      continue;
    }

    layoutEdges.push(layoutEdge);
  }

  if (layoutNodes.length === 0) {
    return { nodes, edges };
  }

  layoutNodes.sort((a, b) => a.id.localeCompare(b.id));
  layoutEdges.sort((a, b) => a.id.localeCompare(b.id));

  const layout = await layoutGraph(layoutNodes, layoutEdges, edgePath);
  const finalPositions = new Map<string, { x: number; y: number }>();
  const finalInputOrders = new Map<string, number[]>();
  const finalOutputOrders = new Map<string, number[]>();
  const finalGroupDimensions = new Map<string, { width: number; height: number }>();
  const collapsedGroupDeltas = new Map<string, { dx: number; dy: number }>();

  for (let i = 0; i < layoutNodes.length; i++) {
    const layoutNode = layoutNodes[i];
    const position = layout.positions.get(layoutNode.id);
    if (!position) continue;

    finalPositions.set(layoutNode.id, position);

    if (layoutNode.kind === 'recipe') {
      const inputOrder = layout.inputOrders.get(layoutNode.id);
      const outputOrder = layout.outputOrders.get(layoutNode.id);
      if (inputOrder) finalInputOrders.set(layoutNode.id, inputOrder);
      if (outputOrder) finalOutputOrders.set(layoutNode.id, outputOrder);
      continue;
    }

    finalGroupDimensions.set(
      layoutNode.id,
      layout.dimensions.get(layoutNode.id) ?? {
        width: layoutNode.width,
        height: layoutNode.height,
      },
    );

    const groupNode = groupMap.get(layoutNode.id);
    if (groupNode?.data.collapsed) {
      collapsedGroupDeltas.set(layoutNode.id, {
        dx: position.x - groupNode.position.x,
        dy: position.y - groupNode.position.y,
      });
    }
  }

  const edgeUpdates = new Map(layout.edgeUpdates);
  const layoutNodeMap = new Map(layoutNodes.map((node) => [node.id, node]));
  const componentNodeIds = new Set(layoutNodeIds);
  const expandedGroupIds = new Set(
    groupNodes.filter((node) => !node.data.collapsed).map((node) => node.id),
  );

  for (let i = 0; i < selfEdges.length; i++) {
    const edge = selfEdges[i];

    if (edgePath === 'bezier' || edgePath === 'straight') {
      edgeUpdates.set(edge.id, { clearControlPoints: true });
      continue;
    }
    if (edgePath !== 'orthogonal') continue;

    const orthogonalTurns = chooseSelfFourTurnRoute(
      edge,
      layoutNodeMap,
      layout.positions,
      layout.dimensions,
      layout.inputOrders,
      layout.outputOrders,
      componentNodeIds,
    );
    if (orthogonalTurns) {
      edgeUpdates.set(edge.id, { orthogonalTurns });
    }
  }

  const updatedNodes = nodes.map((node) => {
    if (isRecipeNode(node)) {
      let position = finalPositions.get(node.id);
      if (!position && node.hidden && node.data.groupId) {
        const delta = collapsedGroupDeltas.get(node.data.groupId);
        if (delta) {
          position = snapToGrid(node.position.x + delta.dx, node.position.y + delta.dy);
        }
      }

      const inputOrder = finalInputOrders.get(node.id) ?? node.data.inputOrder;
      const outputOrder = finalOutputOrders.get(node.id) ?? node.data.outputOrder;

      if (
        !position &&
        inputOrder === node.data.inputOrder &&
        outputOrder === node.data.outputOrder
      ) {
        return node;
      }

      return {
        ...node,
        position: position ?? node.position,
        data: {
          ...node.data,
          inputOrder,
          outputOrder,
        },
      };
    }

    if (!isGroupNode(node)) return node;

    const position = finalPositions.get(node.id);
    const dimensions = finalGroupDimensions.get(node.id);

    if (!node.data.collapsed) {
      if (!position && !dimensions) return node;
      return {
        ...node,
        position: position ?? node.position,
        width: dimensions?.width ?? node.width,
        height: dimensions?.height ?? node.height,
      };
    }

    const inputProxyHandleIds = applyIndexOrder(
      node.data.inputProxyHandleIds,
      layout.inputOrders.get(node.id),
    );
    const outputProxyHandleIds = applyIndexOrder(
      node.data.outputProxyHandleIds,
      layout.outputOrders.get(node.id),
    );

    return {
      ...node,
      position: position ?? node.position,
      width: dimensions?.width ?? node.width,
      height: dimensions?.height ?? node.height,
      data: {
        ...node.data,
        inputProxyHandleIds,
        outputProxyHandleIds,
      },
    };
  });

  const boundedNodes = applyExpandedGroupBounds(updatedNodes, expandedGroupIds);

  const updatedEdges = edges.map((edge) => {
    const update = edgeUpdates.get(edge.id);
    return update ? applyEdgeUpdate(edge, update) : edge;
  });

  return { nodes: boundedNodes, edges: updatedEdges };
}
