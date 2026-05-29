import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { EdgePathStyle } from '../stores/useEdgeThemeStore';
import { getRecipe } from '../data/lookup';
import type { RecipeNodeData } from '../types/nodes';
import {
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
  RECT_GAP,
  RECT_HEIGHT,
  SNAP_GRID,
} from '../components/shared/layoutConstants';
import { buildHandleId, parseHandleId } from './idGenerator';

const IO_COLUMN_TOP_PAD = 17;
const HANDLE_STEP = RECT_HEIGHT + RECT_GAP;

const GRID_X = SNAP_GRID[0];
const GRID_Y = SNAP_GRID[1];

const snapToGrid = (x: number, y: number) => ({
  x: Math.round(x / GRID_X) * GRID_X,
  y: Math.round(y / GRID_Y) * GRID_Y,
});

const snapX = (x: number) => Math.round(x / GRID_X) * GRID_X;
const snapY = (y: number) => Math.round(y / GRID_Y) * GRID_Y;

const elk = new ELK();

interface AutoLayoutOptions {
  edgePath?: EdgePathStyle;
}

interface NodeHandlesMeta {
  inputOrder: number[];
  outputOrder: number[];
  inputCount: number;
  outputCount: number;
}

interface LayoutComponentResult {
  layoutedChildren: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  layoutedEdges: Array<{
    id: string;
    sections?: Array<{
      bendPoints?: Array<{ x: number; y: number }>;
    }>;
  }>;
  bounds: { x: number; y: number; width: number; height: number };
}

interface EdgeUpdate {
  clearControlPoints?: boolean;
  orthogonalTurns?: Array<{ x: number; y: number }>;
}

function getNodeHandlesMeta(node: Node<RecipeNodeData>): NodeHandlesMeta {
  const recipe = getRecipe(node.data.recipeId);
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

function calculateNodeHeight(node: Node<RecipeNodeData>): number {
  const { inputCount, outputCount } = getNodeHandlesMeta(node);
  const maxCount = Math.max(inputCount, outputCount, 1);
  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  return BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
}

/**
 * Handle Y relative to a node's top edge. Mirrors RecipeNodeIO handle placement.
 */
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

function findConnectedComponents(
  nodes: Node<RecipeNodeData>[],
  edges: Edge[],
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

async function layoutComponent(
  componentNodes: Node<RecipeNodeData>[],
  componentEdges: Edge[],
  edgePath: EdgePathStyle,
): Promise<{
  children: LayoutComponentResult['layoutedChildren'];
  edges: LayoutComponentResult['layoutedEdges'];
}> {
  const elkRouting = edgePath === 'straight' ? 'POLYLINE' : 'ORTHOGONAL';

  const elkNodes = componentNodes.map((node) => {
    const { inputOrder, outputOrder, inputCount, outputCount } = getNodeHandlesMeta(node);

    const inputPorts = inputOrder.map((handleIndex, displayIndex) => ({
      id: buildHandleId(node.id, 'input', handleIndex),
      properties: { 'port.side': 'WEST', 'port.index': String(displayIndex) },
      x: 0,
      y: getHandleY('left', displayIndex, inputCount, outputCount),
    }));

    const outputPorts = outputOrder.map((handleIndex, displayIndex) => ({
      id: buildHandleId(node.id, 'output', handleIndex),
      properties: { 'port.side': 'EAST', 'port.index': String(displayIndex) },
      x: NODE_CSS_WIDTH,
      y: getHandleY('right', displayIndex, inputCount, outputCount),
    }));

    return {
      id: node.id,
      width: NODE_CSS_WIDTH,
      height: calculateNodeHeight(node),
      ports: [...inputPorts, ...outputPorts],
      properties: { portConstraints: 'FIXED_POS' },
    };
  });

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

  const graph = {
    id: 'root',
    properties: {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': elkRouting,
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
      'elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default': 'NODE_HEIGHT',
      'elk.layered.compaction.postCompaction.strategy': 'NONE',
      'elk.layered.spacing.nodeNodeBetweenLayers': edgePath === 'straight' ? '152' : '114',
      'elk.spacing.nodeNode': '39',
      'elk.layered.spacing.edgeNodeBetweenLayers': '38',
      'elk.layered.spacing.edgeEdgeBetweenLayers': edgePath === 'straight' ? '38' : '19',
      'elk.spacing.edgeNode': edgePath === 'orthogonal' ? '38' : '19',
      'elk.layered.feedbackEdges': 'true',
      'elk.padding': '[top=57, left=57, bottom=57, right=57]',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph);
  const children = (layouted.children ?? []) as LayoutComponentResult['layoutedChildren'];
  const edges = (layouted.edges ?? []) as LayoutComponentResult['layoutedEdges'];

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

export async function autoLayout(
  nodes: Node<RecipeNodeData>[],
  edges: Edge[],
  options: AutoLayoutOptions = {},
): Promise<{ nodes: Node<RecipeNodeData>[]; edges: Edge[] }> {
  if (!nodes || nodes.length === 0) {
    return { nodes, edges };
  }

  const edgePath = options.edgePath ?? 'orthogonal';
  const components = findConnectedComponents(nodes, edges);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));

  const componentResults: LayoutComponentResult[] = await Promise.all(
    components.map(async (componentNodeIds) => {
      const componentNodes = [...componentNodeIds]
        .map((id) => nodeMap.get(id))
        .filter((node): node is Node<RecipeNodeData> => !!node);

      const componentEdges = edges.filter(
        (edge) => componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target),
      );

      try {
        const { children: layoutedChildren, edges: layoutedEdges } = await layoutComponent(
          componentNodes,
          componentEdges,
          edgePath,
        );

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < layoutedChildren.length; i++) {
          const node = layoutedChildren[i];
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

        return {
          layoutedChildren,
          layoutedEdges,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        };
      } catch (error) {
        console.error('ELK layout failed for component:', error);
        return {
          layoutedChildren: componentNodes.map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
            width: NODE_CSS_WIDTH,
            height: calculateNodeHeight(node),
          })),
          layoutedEdges: [],
          bounds: { x: 0, y: 0, width: NODE_CSS_WIDTH, height: 200 },
        };
      }
    }),
  );

  const { sorted, positions } = packComponents(componentResults);

  const finalPositions = new Map<string, { x: number; y: number }>();
  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;

    for (let i = 0; i < comp.layoutedChildren.length; i++) {
      const elkNode = comp.layoutedChildren[i];
      finalPositions.set(elkNode.id, snapToGrid(tx(elkNode.x), ty(elkNode.y)));
    }
  });

  const edgeUpdates = new Map<string, EdgeUpdate>();

  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;

    for (let i = 0; i < comp.layoutedEdges.length; i++) {
      const elkEdge = comp.layoutedEdges[i];
      const originalEdge = edgeMap.get(elkEdge.id);
      if (!originalEdge) continue;

      if (edgePath === 'bezier') {
        edgeUpdates.set(elkEdge.id, { clearControlPoints: true });
        continue;
      }

      if (edgePath !== 'orthogonal') {
        continue;
      }

      const section = elkEdge.sections?.[0];
      if (!section?.bendPoints || section.bendPoints.length === 0) continue;

      const bendPoints = section.bendPoints.map((point) => ({
        x: tx(point.x),
        y: ty(point.y),
      }));

      const sourceHandle = originalEdge.sourceHandle;
      const targetHandle = originalEdge.targetHandle;
      const sourceParsed = sourceHandle ? parseHandleId(sourceHandle) : null;
      const targetParsed = targetHandle ? parseHandleId(targetHandle) : null;
      const sourcePos = finalPositions.get(originalEdge.source);
      const targetPos = finalPositions.get(originalEdge.target);
      if (!sourceParsed || !targetParsed || !sourcePos || !targetPos) continue;

      const sourceX = sourcePos.x + NODE_CSS_WIDTH;
      const targetX = targetPos.x;
      const isBackwardEdge = targetX < sourceX;

      if (isBackwardEdge) {
        const middleBendPoints = bendPoints.slice(1, -1);
        if (middleBendPoints.length === 0) continue;

        const midY =
          middleBendPoints.reduce((sum, point) => sum + point.y, 0) / middleBendPoints.length;

        const xA = snapX(sourceX + 12);
        const xB = snapX(targetX - 12);
        const snappedMidY = snapY(midY);

        edgeUpdates.set(elkEdge.id, {
          orthogonalTurns: [
            { x: xA, y: sourcePos.y },
            { x: xA, y: snappedMidY },
            { x: xB, y: snappedMidY },
            { x: xB, y: targetPos.y },
          ],
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

        const midX = snapX(bestX);
        edgeUpdates.set(elkEdge.id, {
          orthogonalTurns: [
            { x: midX, y: sourcePos.y },
            { x: midX, y: targetPos.y },
          ],
        });
      }
    }
  });

  const updatedNodes = nodes.map((node) => {
    const position = finalPositions.get(node.id);
    if (!position) return node;
    return { ...node, position };
  });

  const updatedEdges = edges.map((edge) => {
    const update = edgeUpdates.get(edge.id);
    if (!update) return edge;

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
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}
