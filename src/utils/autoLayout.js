import ELK from 'elkjs/lib/elk.bundled.js';

// Must match constants in CustomNode.jsx and App.jsx
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const BASE_INFO_HEIGHT = 117;
const NODE_WIDTH = 380;
const IO_COLUMN_TOP_PAD = 17;
const HANDLE_STEP = RECT_HEIGHT + RECT_GAP; // 52px per handle slot

// Grid constants — must match App.jsx (GRID_SIZE_X = NODE_WIDTH/20, GRID_SIZE_Y = HANDLE_STEP/4)
const GRID_X = 19;
const GRID_Y = 13;
const snapToGrid = (x, y) => ({
  x: Math.round(x / GRID_X) * GRID_X,
  y: Math.round(y / GRID_Y) * GRID_Y,
});
const snapX = (x) => Math.round(x / GRID_X) * GRID_X;

const elk = new ELK();

const calculateNodeHeight = (node) => {
  const recipe = node.data?.recipe;
  if (!recipe) return BASE_INFO_HEIGHT + 100;
  const maxCount = Math.max(recipe.inputs?.length || 0, recipe.outputs?.length || 0, 1);
  const ioColumnPadding = 34; // 17px top + 17px bottom
  const ioAreaHeight = (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + ioColumnPadding;
  return BASE_INFO_HEIGHT + ioAreaHeight + 13;
};

/**
 * Calculate handle Y relative to the node's top edge.
 * Exactly mirrors CustomNode.jsx NodeHandle's topPosition formula,
 * including vertical centering of the shorter column.
 */
const getHandleY = (side, index, inputCount, outputCount) => {
  const maxCount = Math.max(inputCount, outputCount);
  const sideCount = side === 'left' ? inputCount : outputCount;
  const verticalOffset = ((maxCount - sideCount) * HANDLE_STEP) / 2;
  return BASE_INFO_HEIGHT + IO_COLUMN_TOP_PAD + verticalOffset + (index * HANDLE_STEP) + (RECT_HEIGHT / 2);
};

// Groups nodes into islands of connected nodes so each island is laid out independently
const findConnectedComponents = (nodes, edges) => {
  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.id, new Set()));
  edges.forEach(e => {
    if (adjacency.has(e.source) && adjacency.has(e.target)) {
      adjacency.get(e.source).add(e.target);
      adjacency.get(e.target).add(e.source);
    }
  });

  const visited = new Set();
  const components = [];
  nodes.forEach(node => {
    if (visited.has(node.id)) return;
    const component = new Set();
    const stack = [node.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      component.add(id);
      adjacency.get(id)?.forEach(neighbor => {
        if (!visited.has(neighbor)) stack.push(neighbor);
      });
    }
    components.push(component);
  });
  return components;
};

const layoutComponent = async (componentNodes, componentEdges, edgeSettings = {}) => {
  const edgePath = edgeSettings.edgePath || 'orthogonal';

  // Bezier edges use ORTHOGONAL routing so ELK produces clean geometric waypoints.
  // Those waypoints are discarded anyway — we only use ELK's node placement to
  // minimise crossings, and catmullRom draws a natural S-curve between positioned nodes.
  const elkRouting = edgePath === 'straight' ? 'POLYLINE' : 'ORTHOGONAL';

  const elkNodes = componentNodes.map(node => {
    const width = NODE_WIDTH;
    const height = calculateNodeHeight(node);
    const recipe = node.data?.recipe;
    const inputCount = recipe?.inputs?.length || 0;
    const outputCount = recipe?.outputs?.length || 0;

    const inputPorts = Array.from({ length: inputCount }, (_, i) => ({
      id: `${node.id}__left-${i}`,
      properties: { 'port.side': 'WEST', 'port.index': String(i) },
      x: 0,
      y: getHandleY('left', i, inputCount, outputCount),
    }));
    const outputPorts = Array.from({ length: outputCount }, (_, i) => ({
      id: `${node.id}__right-${i}`,
      properties: { 'port.side': 'EAST', 'port.index': String(i) },
      x: width,
      y: getHandleY('right', i, inputCount, outputCount),
    }));

    return {
      id: node.id,
      width,
      height,
      ports: [...inputPorts, ...outputPorts],
      properties: { 'portConstraints': 'FIXED_POS' },
    };
  });

  // Mark backward edges so ELK routes them as feedback edges
  const nodeLayerMap = new Map();
  componentNodes.forEach((node, i) => nodeLayerMap.set(node.id, i));

  const elkEdges = componentEdges.map(edge => {
    const sourceIdx = nodeLayerMap.get(edge.source) ?? 0;
    const targetIdx = nodeLayerMap.get(edge.target) ?? 0;
    return {
      id: edge.id,
      sources: [`${edge.source}__${edge.sourceHandle || 'right-0'}`],
      targets: [`${edge.target}__${edge.targetHandle || 'left-0'}`],
      properties: {
        ...(targetIdx <= sourceIdx ? { 'elk.layered.feedbackEdge': 'true' } : {}),
        'elk.layered.priority.straightness': '1000'
      },
    };
  });

  const graph = {
    id: 'root',
    properties: {
      'algorithm': 'layered',
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
  return {
    children: layouted.children || [],
    edges: layouted.edges || [],
  };
};

// Packs multiple disconnected components into rows, widest first
const packComponents = (componentResults) => {
  const sorted = [...componentResults].sort((a, b) => b.bounds.width - a.bounds.width);
  const GAP = snapX(152);
  const MAX_ROW_WIDTH = Math.max(3000, (sorted[0]?.bounds.width || 0) + GAP * 2);

  const positions = new Map();
  let rowX = 0, rowY = 0, rowMaxHeight = 0;

  sorted.forEach((comp, i) => {
    if (rowX > 0 && rowX + comp.bounds.width > MAX_ROW_WIDTH) {
      rowY += snapX(rowMaxHeight + GAP); // snap row Y advance
      rowX = 0;
      rowMaxHeight = 0;
    }
    positions.set(i, { offsetX: rowX, offsetY: rowY });
    rowX += snapX(comp.bounds.width + GAP); // snap next column X
    rowMaxHeight = Math.max(rowMaxHeight, comp.bounds.height);
  });

  return { sorted, positions };
};

export const autoLayout = async (nodes, edges, edgeSettings = {}) => {
  if (!nodes || nodes.length === 0) return { nodes, edges };

  const edgePath = edgeSettings.edgePath || 'orthogonal';
  const components = findConnectedComponents(nodes, edges);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const edgeMap = new Map(edges.map(e => [e.id, e]));

  const componentResults = await Promise.all(
    components.map(async (componentNodeIds) => {
      const componentNodes = [...componentNodeIds].map(id => nodeMap.get(id));
      const componentEdges = edges.filter(
        e => componentNodeIds.has(e.source) && componentNodeIds.has(e.target)
      );

      try {
        const { children: layoutedChildren, edges: layoutedEdges } =
          await layoutComponent(componentNodes, componentEdges, edgeSettings);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layoutedChildren.forEach(n => {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + n.width);
          maxY = Math.max(maxY, n.y + n.height);
        });

        return {
          layoutedChildren,
          layoutedEdges,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        };
      } catch (err) {
        console.error('ELK layout failed for component:', err);
        return {
          layoutedChildren: componentNodes.map(n => ({
            id: n.id, x: n.position.x, y: n.position.y,
            width: NODE_WIDTH, height: calculateNodeHeight(n),
          })),
          layoutedEdges: [],
          bounds: { x: 0, y: 0, width: NODE_WIDTH, height: 200 },
        };
      }
    })
  );

  const { sorted, positions } = packComponents(componentResults);

  // Build final node positions, snapped to the 19×13 grid
  const finalPositions = new Map();
  sorted.forEach((comp, i) => {
    const { offsetX, offsetY } = positions.get(i);
    comp.layoutedChildren.forEach(elkNode => {
      const raw = {
        x: elkNode.x - comp.bounds.x + offsetX,
        y: elkNode.y - comp.bounds.y + offsetY,
      };
      finalPositions.set(elkNode.id, snapToGrid(raw.x, raw.y));
    });
  });

  // Derive edge data from ELK bend points.
  // Orthogonal: extract midpoint for the draggable segment handle.
  // Bezier: clear all manual waypoints — ELK node placement already minimises
  // crossings and catmullRom produces a clean default S-curve.
  const edgeUpdates = new Map();

  sorted.forEach((comp, i) => {
    const { offsetX, offsetY } = positions.get(i);
    const tx = (x) => x - comp.bounds.x + offsetX;
    const ty = (y) => y - comp.bounds.y + offsetY;

    comp.layoutedEdges.forEach(elkEdge => {
      const originalEdge = edgeMap.get(elkEdge.id);
      if (!originalEdge) return;

      if (edgePath === 'bezier') {
        edgeUpdates.set(elkEdge.id, { bezierPoints: [], orthoMidX: undefined, orthoMidY: undefined });
        return;
      }

      if (edgePath === 'orthogonal') {
        const section = elkEdge.sections?.[0];
        if (!section) return;
        const bendPoints = (section.bendPoints || []).map(p => ({ x: tx(p.x), y: ty(p.y) }));
        if (bendPoints.length === 0) return;

        const sourcePos = finalPositions.get(originalEdge.source);
        const targetPos = finalPositions.get(originalEdge.target);
        if (!sourcePos || !targetPos) return;

        const sourceX = sourcePos.x + NODE_WIDTH;
        const targetX = targetPos.x;
        const isBackwardEdge = targetX < sourceX;

        if (isBackwardEdge) {
          // Middle bend points give the Y of the horizontal bypass segment
          const middleBendPoints = bendPoints.slice(1, -1);
          if (middleBendPoints.length > 0) {
            const midY = middleBendPoints.reduce((s, p) => s + p.y, 0) / middleBendPoints.length;
            edgeUpdates.set(elkEdge.id, { orthoMidY: Math.round(midY / GRID_Y) * GRID_Y, orthoMidX: undefined });
          }
        } else {
          // Find the dominant vertical segment in ELK's bend points.
          // ELK routes edges through channels between layers; the longest
          // vertical span identifies the primary channel to use as midX.
          let bestX = bendPoints[0].x;
          let bestSpan = 0;
          for (let i = 0; i < bendPoints.length - 1; i++) {
            if (Math.abs(bendPoints[i].x - bendPoints[i + 1].x) < 1) {
              const span = Math.abs(bendPoints[i + 1].y - bendPoints[i].y);
              if (span > bestSpan) {
                bestSpan = span;
                bestX = bendPoints[i].x;
              }
            }
          }
          edgeUpdates.set(elkEdge.id, { orthoMidX: snapX(bestX), orthoMidY: undefined });
        }
      }
    });
  });

  const updatedNodes = nodes.map(node => {
    const pos = finalPositions.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });

  const updatedEdges = edges.map(edge => {
    const update = edgeUpdates.get(edge.id);
    return update ? { ...edge, data: { ...edge.data, ...update } } : edge;
  });

  return { nodes: updatedNodes, edges: updatedEdges };
};