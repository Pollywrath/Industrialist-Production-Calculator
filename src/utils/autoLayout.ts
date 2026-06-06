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
  getCollapsedGroupHeight,
} from './groupBounds';
import { buildHandleId, parseHandleId } from './idGenerator';

const IO_COLUMN_TOP_PAD = 17;
const HANDLE_STEP = RECT_HEIGHT + RECT_GAP;

const GRID_X = SNAP_GRID[0];
const GRID_Y = SNAP_GRID[1];
const EXPANDED_GROUP_PADDING = `[top=${GROUP_HEADER_HEIGHT + GROUP_PADDING_Y}, left=${GROUP_PADDING_X}, bottom=${GROUP_PADDING_Y}, right=${GROUP_PADDING_X}]`;

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
  originalEdgeId: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  routable: boolean;
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
  x: number;
  y: number;
  width: number;
  height: number;
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
    width: NODE_CSS_WIDTH,
    height: calculateRecipeNodeHeight(node),
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
    width: node.measured?.width ?? node.width ?? NODE_CSS_WIDTH,
    height: node.measured?.height ?? node.height ?? fallbackHeight,
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
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
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

function isDescendant(
  nodeId: string,
  potentialAncestorId: string,
  nodeMap: Map<string, LayoutNodeSpec>,
): boolean {
  let currentId: string | undefined = nodeId;
  while (currentId) {
    const node = nodeMap.get(currentId);
    if (!node) break;
    if (node.parentId === potentialAncestorId) {
      return true;
    }
    currentId = node.parentId;
  }
  return false;
}

function horizontalSegmentIntersectsRect(
  x1: number,
  x2: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const buffer = 4;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return (
    y >= ry + buffer &&
    y <= ry + rh - buffer &&
    maxX >= rx + buffer &&
    minX <= rx + rw - buffer
  );
}

function verticalSegmentIntersectsRect(
  x: number,
  y1: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const buffer = 4;
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return (
    x >= rx + buffer &&
    x <= rx + rw - buffer &&
    maxY >= ry + buffer &&
    minY <= ry + rh - buffer
  );
}

function checkPathIntersection(
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  sourceId: string,
  targetId: string,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): boolean {
  for (const nodeId of componentNodeIds) {
    if (nodeId === sourceId || nodeId === targetId) continue;

    if (isDescendant(sourceId, nodeId, nodeMap) || isDescendant(targetId, nodeId, nodeMap)) {
      continue;
    }

    const pos = positions.get(nodeId);
    const dim = dimensions.get(nodeId);
    if (!pos || !dim) continue;

    const rx = pos.x;
    const ry = pos.y;
    const rw = dim.width;
    const rh = dim.height;

    for (const seg of segments) {
      const isHorizontal = Math.abs(seg.y1 - seg.y2) < 0.001;
      if (isHorizontal) {
        if (horizontalSegmentIntersectsRect(seg.x1, seg.x2, seg.y1, rx, ry, rw, rh)) {
          return true;
        }
      } else {
        if (verticalSegmentIntersectsRect(seg.x1, seg.y1, seg.y2, rx, ry, rw, rh)) {
          return true;
        }
      }
    }
  }
  return false;
}

function simplifyToFourTurns(
  turns: Array<{ x: number; y: number }>,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceId: string,
  targetId: string,
  componentNodeIds: Set<string>,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
): Array<{ x: number; y: number }> {
  if (turns.length <= 4 && (turns.length === 2 || turns.length === 4 || turns.length === 0)) {
    return turns;
  }

  const xA = turns.length > 0 ? turns[0].x : snapX((sourceX + targetX) / 2);
  const xB = turns.length > 0 ? turns[turns.length - 1].x : snapX((sourceX + targetX) / 2);

  const yCandidates = Array.from(new Set(turns.map((t) => snapY(t.y))));
  if (yCandidates.length === 0) {
    yCandidates.push(snapY((sourceY + targetY) / 2));
  }

  let bestY = yCandidates[0];
  let bestCollisionCount = Number.MAX_SAFE_INTEGER;

  for (const y of yCandidates) {
    const proposedSegments = [
      { x1: sourceX, y1: sourceY, x2: xA, y2: sourceY },
      { x1: xA, y1: sourceY, x2: xA, y2: y },
      { x1: xA, y1: y, x2: xB, y2: y },
      { x1: xB, y1: y, x2: xB, y2: targetY },
      { x1: xB, y1: targetY, x2: targetX, y2: targetY },
    ];

    let collisions = 0;
    for (const nodeId of componentNodeIds) {
      if (nodeId === sourceId || nodeId === targetId) continue;
      if (isDescendant(sourceId, nodeId, nodeMap) || isDescendant(targetId, nodeId, nodeMap)) {
        continue;
      }
      const pos = positions.get(nodeId);
      const dim = dimensions.get(nodeId);
      if (!pos || !dim) continue;

      const rx = pos.x;
      const ry = pos.y;
      const rw = dim.width;
      const rh = dim.height;

      for (const seg of proposedSegments) {
        const isHorizontal = Math.abs(seg.y1 - seg.y2) < 0.001;
        if (isHorizontal) {
          if (horizontalSegmentIntersectsRect(seg.x1, seg.x2, seg.y1, rx, ry, rw, rh)) {
            collisions++;
          }
        } else {
          if (verticalSegmentIntersectsRect(seg.x1, seg.y1, seg.y2, rx, ry, rw, rh)) {
            collisions++;
          }
        }
      }
    }

    if (collisions === 0) {
      bestY = y;
      break;
    }

    if (collisions < bestCollisionCount) {
      bestCollisionCount = collisions;
      bestY = y;
    }
  }

  return [
    { x: xA, y: sourceY },
    { x: xA, y: bestY },
    { x: xB, y: bestY },
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
      width: child.width,
      height: child.height,
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

  const elkNodesPass1 = buildHierarchicalElkNodes(componentNodes, 'FIXED_SIDE', baseProperties);

  const graphPass1 = {
    id: 'root',
    properties: baseProperties,
    children: elkNodesPass1,
    edges: elkEdges,
  };

  const layoutedPass1 = await elk.layout(graphPass1);

  const nodePortOrders = new Map<string, { inputOrder: number[]; outputOrder: number[] }>();
  collectPortOrders(layoutedPass1.children as LayoutedNode[] | undefined, nodePortOrders);

  const elkNodesPass2 = buildHierarchicalElkNodes(componentNodes, 'FIXED_POS', baseProperties, nodePortOrders);

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
        const fallbackChildren = componentNodes.map((node) => ({
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
      originalEdgeId: string;
      sourceHandle: string;
      targetHandle: string;
      sourceX: number;
      targetX: number;
      sourceY: number;
      targetY: number;
      bestX: number;
      bendPoints: Array<{ x: number; y: number }>;
    }> = [];

    for (let i = 0; i < comp.layoutedEdges.length; i++) {
      const elkEdge = comp.layoutedEdges[i];
      const layoutEdge = edgeMap.get(elkEdge.id);
      if (!layoutEdge?.routable) continue;

      if (edgePath === 'bezier') {
        edgeUpdates.set(layoutEdge.originalEdgeId, { clearControlPoints: true });
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
        x: snapX(tx(point.x + containerX)),
        y: snapY(ty(point.y + containerY)),
      }));

      const sourceHandle = layoutEdge.sourceHandle ?? buildHandleId(layoutEdge.source, 'output', 0);
      const targetHandle = layoutEdge.targetHandle ?? buildHandleId(layoutEdge.target, 'input', 0);
      const sourceParsed = sourceHandle ? parseHandleId(sourceHandle) : null;
      const targetParsed = targetHandle ? parseHandleId(targetHandle) : null;
      const sourcePos = finalPositions.get(layoutEdge.source);
      const targetPos = finalPositions.get(layoutEdge.target);
      const sourceNode = nodeMap.get(layoutEdge.source);
      const targetNode = nodeMap.get(layoutEdge.target);
      if (!sourceParsed || !targetParsed || !sourcePos || !targetPos || !sourceNode || !targetNode) continue;

      const sourcePortY = sourcePos.y + getLayoutPortY('output', sourceParsed.index, sourceNode.inputOrder.length, sourceNode.outputOrder.length);
      const targetPortY = targetPos.y + getLayoutPortY('input', targetParsed.index, targetNode.inputOrder.length, targetNode.outputOrder.length);

      const sourceX = sourcePos.x + sourceNode.width;
      const targetX = targetPos.x;
      const isBackwardEdge = targetX < sourceX;

      if (isBackwardEdge) {
        const middleBendPoints = bendPoints.slice(1, -1);
        if (middleBendPoints.length === 0) continue;

        const midY =
          middleBendPoints.reduce((sum, point) => sum + point.y, 0) / middleBendPoints.length;

        const xA = snapX(sourceX + 12 + sourceParsed.index * GRID_X);
        const xB = snapX(targetX - 12 - targetParsed.index * GRID_X);
        const snappedMidY = snapY(midY);

        const proposedTurns = [
          { x: xA, y: sourcePos.y },
          { x: xA, y: snappedMidY },
          { x: xB, y: snappedMidY },
          { x: xB, y: targetPos.y },
        ];

        const proposedSegments = [
          { x1: sourceX, y1: sourcePortY, x2: xA, y2: sourcePortY },
          { x1: xA, y1: sourcePortY, x2: xA, y2: snappedMidY },
          { x1: xA, y1: snappedMidY, x2: xB, y2: snappedMidY },
          { x1: xB, y1: snappedMidY, x2: xB, y2: targetPortY },
          { x1: xB, y1: targetPortY, x2: targetX, y2: targetPortY },
        ];

        const componentNodeIds = new Set(placements.keys());
        const hasIntersection = checkPathIntersection(
          proposedSegments,
          layoutEdge.source,
          layoutEdge.target,
          componentNodeIds,
          nodeMap,
          finalPositions,
          finalDimensions,
        );

        if (hasIntersection) {
          const simplifiedTurns = simplifyToFourTurns(
            bendPoints,
            sourceX,
            sourcePortY,
            targetX,
            targetPortY,
            layoutEdge.source,
            layoutEdge.target,
            componentNodeIds,
            nodeMap,
            finalPositions,
            finalDimensions,
          );
          edgeUpdates.set(layoutEdge.originalEdgeId, {
            orthogonalTurns: simplifiedTurns,
          });
        } else {
          edgeUpdates.set(layoutEdge.originalEdgeId, {
            orthogonalTurns: proposedTurns,
          });
        }
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
          originalEdgeId: layoutEdge.originalEdgeId,
          sourceHandle,
          targetHandle,
          sourceX,
          targetX,
          sourceY: sourcePortY,
          targetY: targetPortY,
          bestX,
          bendPoints,
        });
      }
    }

    const gapGroups = new Map<string, typeof forwardEdgesToProcess>();
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

    const componentNodeIds = new Set(placements.keys());

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

          const proposedSegments = [
            { x1: edgeData.sourceX, y1: edgeData.sourceY, x2: assignedX, y2: edgeData.sourceY },
            { x1: assignedX, y1: edgeData.sourceY, x2: assignedX, y2: edgeData.targetY },
            { x1: assignedX, y1: edgeData.targetY, x2: edgeData.targetX, y2: edgeData.targetY },
          ];

          const layoutEdge = edgeMap.get(edgeId);
          const hasIntersection =
            layoutEdge &&
            checkPathIntersection(
              proposedSegments,
              layoutEdge.source,
              layoutEdge.target,
              componentNodeIds,
              nodeMap,
              finalPositions,
              finalDimensions,
            );

          if (hasIntersection) {
            const simplifiedTurns = simplifyToFourTurns(
              edgeData.bendPoints,
              edgeData.sourceX,
              edgeData.sourceY,
              edgeData.targetX,
              edgeData.targetY,
              layoutEdge.source,
              layoutEdge.target,
              componentNodeIds,
              nodeMap,
              finalPositions,
              finalDimensions,
            );
            edgeUpdates.set(edgeData.originalEdgeId, {
              orthogonalTurns: simplifiedTurns,
            });
          } else {
            edgeUpdates.set(edgeData.originalEdgeId, {
              orthogonalTurns: [
                { x: assignedX, y: edgeData.sourceY },
                { x: assignedX, y: edgeData.targetY },
              ],
            });
          }
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

function getCollapsedGroupIdForRecipe(
  node: CanvasNode | undefined,
  groupMap: Map<string, GroupNodeType>,
): string | null {
  if (!isRecipeNode(node) || !node.data.groupId) return null;
  const groupNode = groupMap.get(node.data.groupId);
  return groupNode?.data.collapsed ? groupNode.id : null;
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

  const outerEdges: LayoutEdgeSpec[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.hidden) continue;

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode || edge.source === edge.target) continue;
    if (isRecipeNode(sourceNode) && sourceNode.hidden) continue;
    if (isRecipeNode(targetNode) && targetNode.hidden) continue;
    if (isGroupNode(sourceNode) && !sourceNode.data.collapsed) continue;
    if (isGroupNode(targetNode) && !targetNode.data.collapsed) continue;

    outerEdges.push({
      id: edge.id,
      originalEdgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      routable: true,
    });
  }

  const outerNodes: LayoutNodeSpec[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (isGroupNode(node)) {
      outerNodes.push(
        node.data.collapsed
          ? createCollapsedGroupLayoutNode(node)
          : createExpandedGroupLayoutNode(node),
      );
      continue;
    }

    if (!isRecipeNode(node) || node.hidden) continue;

    const groupNode = node.data.groupId ? groupMap.get(node.data.groupId) : undefined;
    const parentId = groupNode && !groupNode.data.collapsed ? groupNode.id : undefined;
    outerNodes.push(createRecipeLayoutNode(node, parentId));
  }

  const childCountByGroupId = new Map<string, number>();
  for (let i = 0; i < outerNodes.length; i++) {
    const parentId = outerNodes[i].parentId;
    if (!parentId) continue;
    childCountByGroupId.set(parentId, (childCountByGroupId.get(parentId) ?? 0) + 1);
  }

  for (let i = outerNodes.length - 1; i >= 0; i--) {
    const node = outerNodes[i];
    if (node.kind === 'expanded-group' && !childCountByGroupId.has(node.id)) {
      outerNodes.splice(i, 1);
    }
  }

  if (outerNodes.length === 0) {
    return { nodes, edges };
  }

  outerNodes.sort((a, b) => a.id.localeCompare(b.id));
  outerEdges.sort((a, b) => a.id.localeCompare(b.id));

  const outerLayout = await layoutGraph(outerNodes, outerEdges, edgePath);
  const finalPositions = new Map<string, { x: number; y: number }>();
  const finalInputOrders = new Map<string, number[]>();
  const finalOutputOrders = new Map<string, number[]>();
  const finalGroupDimensions = new Map<string, { width: number; height: number }>();
  const collapsedGroupDeltas = new Map<string, { dx: number; dy: number }>();
  const edgeUpdates = new Map<string, EdgeUpdate>(outerLayout.edgeUpdates);

  for (let i = 0; i < outerNodes.length; i++) {
    const layoutNode = outerNodes[i];
    const position = outerLayout.positions.get(layoutNode.id);
    if (!position) continue;

    finalPositions.set(layoutNode.id, position);

    if (layoutNode.kind === 'recipe') {
      const inputOrder = outerLayout.inputOrders.get(layoutNode.id);
      const outputOrder = outerLayout.outputOrders.get(layoutNode.id);
      if (inputOrder) finalInputOrders.set(layoutNode.id, inputOrder);
      if (outputOrder) finalOutputOrders.set(layoutNode.id, outputOrder);
      continue;
    }

    finalGroupDimensions.set(
      layoutNode.id,
      outerLayout.dimensions.get(layoutNode.id) ?? {
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

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge.hidden || edge.id.startsWith('proxy-')) continue;

    const sourceGroupId = getCollapsedGroupIdForRecipe(nodeMap.get(edge.source), groupMap);
    const targetGroupId = getCollapsedGroupIdForRecipe(nodeMap.get(edge.target), groupMap);
    if (!sourceGroupId && !targetGroupId) continue;
    if (sourceGroupId && sourceGroupId === targetGroupId) continue;

    edgeUpdates.set(edge.id, { clearControlPoints: true });
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
      outerLayout.inputOrders.get(node.id),
    );
    const outputProxyHandleIds = applyIndexOrder(
      node.data.outputProxyHandleIds,
      outerLayout.outputOrders.get(node.id),
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

  const updatedEdges = edges.map((edge) => {
    const update = edgeUpdates.get(edge.id);
    return update ? applyEdgeUpdate(edge, update) : edge;
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}
