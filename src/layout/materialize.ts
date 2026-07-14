import type { OrthogonalRouteAnchors } from '../utils/canvas/orthogonalEdgeRouting';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { GRID_X, GRID_Y, getLayoutPortY, snapDimension, snapToGrid } from './constants';
import type {
  CollectedLayoutedEdge,
  LayoutEdgeSpec,
  LayoutNodeSpec,
  LayoutedGraph,
  LayoutedNode,
  LayoutedNodePlacement,
  MaterializedLayoutPass,
} from './types';

export function collectLayoutedNodePlacements(
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

export function collectLayoutedEdges(
  graph: LayoutedGraph | LayoutedNode,
  edges: CollectedLayoutedEdge[],
  offsetX = 0,
  offsetY = 0,
): void {
  const graphEdges = graph.edges ?? [];
  for (let i = 0; i < graphEdges.length; i++) {
    edges.push({ edge: graphEdges[i], offsetX, offsetY });
  }

  const children = graph.children ?? [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    collectLayoutedEdges(child, edges, offsetX + (child.x ?? 0), offsetY + (child.y ?? 0));
  }
}

function getCompletePortOrder(candidate: number[], fallback: number[]): number[] {
  if (candidate.length !== fallback.length) return fallback;

  const fallbackSet = new Set(fallback);
  const seen = new Set<number>();
  for (let i = 0; i < candidate.length; i++) {
    const index = candidate[i];
    if (!fallbackSet.has(index) || seen.has(index)) return fallback;
    seen.add(index);
  }

  return candidate;
}

function collectPortOrders(
  placements: Map<string, LayoutedNodePlacement>,
  nodeMap: Map<string, LayoutNodeSpec>,
  inputOrders: Map<string, number[]>,
  outputOrders: Map<string, number[]>,
): void {
  placements.forEach((placement) => {
    const node = nodeMap.get(placement.id);
    if (!node?.commitPortOrder) return;

    const ports = placement.ports ?? [];
    const inputs: Array<{ index: number; y: number }> = [];
    const outputs: Array<{ index: number; y: number }> = [];

    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      const parsed = parseHandleId(port.id);
      if (!parsed) continue;

      if (parsed.side === 'input') {
        inputs.push({ index: parsed.index, y: port.y ?? 0 });
      } else {
        outputs.push({ index: parsed.index, y: port.y ?? 0 });
      }
    }

    inputs.sort((a, b) => a.y - b.y || a.index - b.index);
    outputs.sort((a, b) => a.y - b.y || a.index - b.index);

    inputOrders.set(
      placement.id,
      getCompletePortOrder(
        inputs.map((input) => input.index),
        node.inputOrder,
      ),
    );
    outputOrders.set(
      placement.id,
      getCompletePortOrder(
        outputs.map((output) => output.index),
        node.outputOrder,
      ),
    );
  });
}

function getHandleDisplayIndex(order: number[], handleIndex: number): number {
  const displayIndex = order.indexOf(handleIndex);
  if (displayIndex >= 0) return displayIndex;
  if (order.length === 0) return 0;
  return Math.max(0, Math.min(handleIndex, order.length - 1));
}

function getPortAnchor(
  node: LayoutNodeSpec,
  handleId: string | undefined,
  fallbackSide: 'input' | 'output',
  position: { x: number; y: number },
  dimension: { width: number; height: number },
  inputOrders: Map<string, number[]>,
  outputOrders: Map<string, number[]>,
): { x: number; y: number } | null {
  const parsed = parseHandleId(handleId ?? buildHandleId(node.id, fallbackSide, 0));
  if (!parsed) return null;

  const inputOrder = inputOrders.get(node.id) ?? node.inputOrder;
  const outputOrder = outputOrders.get(node.id) ?? node.outputOrder;
  const order = parsed.side === 'input' ? inputOrder : outputOrder;
  const displayIndex = getHandleDisplayIndex(order, parsed.index);
  const y =
    position.y + getLayoutPortY(parsed.side, displayIndex, inputOrder.length, outputOrder.length);

  return {
    x: parsed.side === 'output' ? position.x + dimension.width : position.x,
    y,
  };
}

export function getEdgeAnchors(
  edge: LayoutEdgeSpec,
  nodeMap: Map<string, LayoutNodeSpec>,
  positions: Map<string, { x: number; y: number }>,
  dimensions: Map<string, { width: number; height: number }>,
  inputOrders: Map<string, number[]>,
  outputOrders: Map<string, number[]>,
): OrthogonalRouteAnchors | null {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);
  const sourceDimension = dimensions.get(edge.source);
  const targetDimension = dimensions.get(edge.target);

  if (
    !sourceNode ||
    !targetNode ||
    !sourcePosition ||
    !targetPosition ||
    !sourceDimension ||
    !targetDimension
  ) {
    return null;
  }

  const sourceAnchor = getPortAnchor(
    sourceNode,
    edge.sourceHandle,
    'output',
    sourcePosition,
    sourceDimension,
    inputOrders,
    outputOrders,
  );
  const targetAnchor = getPortAnchor(
    targetNode,
    edge.targetHandle,
    'input',
    targetPosition,
    targetDimension,
    inputOrders,
    outputOrders,
  );

  if (!sourceAnchor || !targetAnchor) return null;

  return {
    sourceX: sourceAnchor.x,
    sourceY: sourceAnchor.y,
    targetX: targetAnchor.x,
    targetY: targetAnchor.y,
  };
}

export function materializeLayoutPass(
  layoutNodes: LayoutNodeSpec[],
  layouted: LayoutedGraph,
): MaterializedLayoutPass {
  const nodeMap = new Map(layoutNodes.map((node) => [node.id, node]));
  const placements = new Map<string, LayoutedNodePlacement>();
  collectLayoutedNodePlacements(layouted.children, placements);

  const positions = new Map<string, { x: number; y: number }>();
  const dimensions = new Map<string, { width: number; height: number }>();

  placements.forEach((placement) => {
    const spec = nodeMap.get(placement.id);
    positions.set(placement.id, snapToGrid(placement.x, placement.y));
    dimensions.set(placement.id, {
      width: snapDimension(placement.width, GRID_X, spec?.width ?? GRID_X),
      height: snapDimension(placement.height, GRID_Y, spec?.height ?? GRID_Y),
    });
  });

  const inputOrders = new Map<string, number[]>();
  const outputOrders = new Map<string, number[]>();
  collectPortOrders(placements, nodeMap, inputOrders, outputOrders);

  return {
    layouted,
    layoutNodes,
    nodeMap,
    placements,
    positions,
    dimensions,
    inputOrders,
    outputOrders,
  };
}

export function collectLayoutedPortOrders(
  layoutNodes: LayoutNodeSpec[],
  layouted: LayoutedGraph,
): {
  inputOrders: Map<string, number[]>;
  outputOrders: Map<string, number[]>;
} {
  const nodeMap = new Map(layoutNodes.map((node) => [node.id, node]));
  const placements = new Map<string, LayoutedNodePlacement>();
  collectLayoutedNodePlacements(layouted.children, placements);

  const inputOrders = new Map<string, number[]>();
  const outputOrders = new Map<string, number[]>();
  collectPortOrders(placements, nodeMap, inputOrders, outputOrders);

  return { inputOrders, outputOrders };
}
