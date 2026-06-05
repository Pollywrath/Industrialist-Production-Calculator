import type { Edge } from '@xyflow/react';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { EdgePathStyle } from '../stores/useEdgeThemeStore';
import { getRecipe } from '../data/lookup';
import { isRecipeNode } from '../types/nodes';
import type { CanvasNode, RecipeNodeType } from '../types/nodes';
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

interface LayoutComponentResult {
  layoutedChildren: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ports?: Array<{
      id: string;
      x: number;
      y: number;
    }>;
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

function getNodeHandlesMeta(node: RecipeNodeType): NodeHandlesMeta {
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

function calculateNodeHeight(node: RecipeNodeType): number {
  const { inputCount, outputCount } = getNodeHandlesMeta(node);
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

function findConnectedComponents(
  nodes: RecipeNodeType[],
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
  componentNodes: RecipeNodeType[],
  componentEdges: Edge[],
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
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
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

  const elkNodesPass1 = componentNodes.map((node) => {
    const { inputCount, outputCount } = getNodeHandlesMeta(node);

    const deterministicInputOrder = Array.from({ length: inputCount }, (_, i) => i);
    const deterministicOutputOrder = Array.from({ length: outputCount }, (_, i) => i);

    const inputPorts = deterministicInputOrder.map((handleIndex, displayIndex) => ({
      id: buildHandleId(node.id, 'input', handleIndex),
      properties: { 'port.side': 'WEST', 'port.index': String(displayIndex) },
      x: 0,
      y: getHandleY('left', displayIndex, inputCount, outputCount),
    }));

    const outputPorts = deterministicOutputOrder.map((handleIndex, displayIndex) => ({
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
      properties: {
        portConstraints: 'FIXED_SIDE',
        'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
      },
    };
  });

  const graphPass1 = {
    id: 'root',
    properties: baseProperties,
    children: elkNodesPass1,
    edges: elkEdges,
  };

  const layoutedPass1 = await elk.layout(graphPass1);

  const nodePortOrders = new Map<string, { inputOrder: number[]; outputOrder: number[] }>();
  (layoutedPass1.children ?? []).forEach((child) => {
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

    inputs.sort((a, b) => a.y - b.y);
    outputs.sort((a, b) => a.y - b.y);

    nodePortOrders.set(child.id, {
      inputOrder: inputs.map((item) => item.index),
      outputOrder: outputs.map((item) => item.index),
    });
  });

  const elkNodesPass2 = componentNodes.map((node) => {
    const { inputCount, outputCount } = getNodeHandlesMeta(node);
    const optimized = nodePortOrders.get(node.id) ?? {
      inputOrder: Array.from({ length: inputCount }, (_, i) => i),
      outputOrder: Array.from({ length: outputCount }, (_, i) => i),
    };

    const inputPorts = optimized.inputOrder.map((handleIndex, displayIndex) => ({
      id: buildHandleId(node.id, 'input', handleIndex),
      properties: { 'port.side': 'WEST', 'port.index': String(displayIndex) },
      x: 0,
      y: getHandleY('left', displayIndex, inputCount, outputCount),
    }));

    const outputPorts = optimized.outputOrder.map((handleIndex, displayIndex) => ({
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
      properties: {
        portConstraints: 'FIXED_POS',
        'org.eclipse.elk.portConstraints': 'FIXED_POS',
      },
    };
  });

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

export async function autoLayout(
  nodes: CanvasNode[],
  edges: Edge[],
  options: AutoLayoutOptions = {},
): Promise<{ nodes: CanvasNode[]; edges: Edge[] }> {
  if (!nodes || nodes.length === 0) {
    return { nodes, edges };
  }

  const recipeNodes = nodes.filter(isRecipeNode);
  if (recipeNodes.length === 0) {
    return { nodes, edges };
  }

  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const recipeEdges = edges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );

  const edgePath = options.edgePath ?? 'orthogonal';
  const components = findConnectedComponents(recipeNodes, recipeEdges);
  const nodeMap = new Map(recipeNodes.map((node) => [node.id, node]));
  const edgeMap = new Map(recipeEdges.map((edge) => [edge.id, edge]));

  const nodeIdToComponentIndex = new Map<string, number>();
  for (let i = 0; i < components.length; i++) {
    const componentNodeIds = components[i];
    componentNodeIds.forEach((id) => {
      nodeIdToComponentIndex.set(id, i);
    });
  }

  const componentEdgeLists: Edge[][] = Array.from({ length: components.length }, () => []);
  for (let i = 0; i < recipeEdges.length; i++) {
    const edge = recipeEdges[i];
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
        .filter((node): node is RecipeNodeType => !!node);
      componentNodes.sort((a, b) => a.id.localeCompare(b.id));

      const componentEdges = componentEdgeLists[componentIndex];
      componentEdges.sort((a, b) => a.id.localeCompare(b.id));

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
  const finalInputOrders = new Map<string, number[]>();
  const finalOutputOrders = new Map<string, number[]>();

  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;

    for (let i = 0; i < comp.layoutedChildren.length; i++) {
      const elkNode = comp.layoutedChildren[i];
      finalPositions.set(elkNode.id, snapToGrid(tx(elkNode.x), ty(elkNode.y)));

      const layoutedPorts = elkNode.ports ?? [];
      const inputs: Array<{ index: number; y: number }> = [];
      const outputs: Array<{ index: number; y: number }> = [];

      for (let j = 0; j < layoutedPorts.length; j++) {
        const port = layoutedPorts[j];
        const parsed = parseHandleId(port.id);
        if (!parsed) continue;

        if (parsed.side === 'input') {
          inputs.push({ index: parsed.index, y: port.y });
        } else if (parsed.side === 'output') {
          outputs.push({ index: parsed.index, y: port.y });
        }
      }

      inputs.sort((a, b) => a.y - b.y);
      outputs.sort((a, b) => a.y - b.y);

      finalInputOrders.set(elkNode.id, inputs.map((item) => item.index));
      finalOutputOrders.set(elkNode.id, outputs.map((item) => item.index));
    }
  });

  const edgeUpdates = new Map<string, EdgeUpdate>();

  sorted.forEach((comp, index) => {
    const position = positions.get(index);
    if (!position) return;

    const tx = (x: number) => x - comp.bounds.x + position.offsetX;
    const ty = (y: number) => y - comp.bounds.y + position.offsetY;

    const forwardEdgesToProcess: Array<{
      edgeId: string;
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

      const sourceHandle = originalEdge.sourceHandle ?? buildHandleId(originalEdge.source, 'output', 0);
      const targetHandle = originalEdge.targetHandle ?? buildHandleId(originalEdge.target, 'input', 0);
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

        const xA = snapX(sourceX + 12 + sourceParsed.index * GRID_X);
        const xB = snapX(targetX - 12 - targetParsed.index * GRID_X);
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

        forwardEdgesToProcess.push({
          edgeId: elkEdge.id,
          sourceHandle,
          targetHandle,
          sourceX,
          targetX,
          sourceY: sourcePos.y,
          targetY: targetPos.y,
          bestX,
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

          edgeUpdates.set(edgeId, {
            orthogonalTurns: [
              { x: assignedX, y: edgeData.sourceY },
              { x: assignedX, y: edgeData.targetY },
            ],
          });
        });
      });
    });
  });

  const updatedNodes = nodes.map((node) => {
    if (!isRecipeNode(node)) return node;

    const position = finalPositions.get(node.id);
    if (!position) return node;

    const inputOrder = finalInputOrders.get(node.id) ?? node.data.inputOrder;
    const outputOrder = finalOutputOrders.get(node.id) ?? node.data.outputOrder;

    return {
      ...node,
      position,
      data: {
        ...node.data,
        inputOrder,
        outputOrder,
      },
    };
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
