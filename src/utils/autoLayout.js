import ELK from 'elkjs/lib/elk.bundled.js';

// Constants from CustomNode.jsx
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const BASE_INFO_HEIGHT = 120;
const NODE_WIDTH = 380;

const elk = new ELK();

const calculateNodeHeight = (node) => {
  const recipe = node.data?.recipe;
  if (!recipe) return BASE_INFO_HEIGHT + 100;

  const leftCount = recipe.inputs?.length || 0;
  const rightCount = recipe.outputs?.length || 0;
  const maxCount = Math.max(leftCount, rightCount, 1);

  const ioColumnPadding = 24;
  const ioAreaHeight = (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + ioColumnPadding;
  const bottomPadding = 12;

  return BASE_INFO_HEIGHT + ioAreaHeight + bottomPadding;
};

const getHandleY = (index, nodeHeight) => {
  const ioColumnPadding = 24;
  const ioAreaTop = BASE_INFO_HEIGHT + ioColumnPadding / 2;
  return ioAreaTop + index * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
};

/**
 * Find all connected components (undirected) in the graph.
 * Returns an array of sets, each set containing node IDs in that component.
 */
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

/**
 * Run ELK layout on a single connected component.
 */
const layoutComponent = async (componentNodes, componentEdges, edgeSettings = {}) => {
  const edgePath = edgeSettings.edgePath || 'orthogonal';
  const elkRouting = { orthogonal: 'ORTHOGONAL', bezier: 'SPLINES', straight: 'POLYLINE' }[edgePath] || 'ORTHOGONAL';
  const nodeNodeSpacing = edgePath === 'straight' ? '260' : '200';
  const layerSpacing = edgePath === 'straight' ? '260' : '200';
  const edgeNodeSpacing = edgePath === 'bezier' ? '80' : '100';

  const elkNodes = componentNodes.map(node => {
    const width = NODE_WIDTH;
    const height = calculateNodeHeight(node);
    const recipe = node.data?.recipe;
    const inputCount = recipe?.inputs?.length || 0;
    const outputCount = recipe?.outputs?.length || 0;

    const inputPorts = Array.from({ length: inputCount }, (_, i) => ({
      id: `${node.id}__left-${i}`,
      properties: { 'port.side': 'WEST', 'port.index': i },
      x: 0,
      y: getHandleY(i, height),
    }));

    const outputPorts = Array.from({ length: outputCount }, (_, i) => ({
      id: `${node.id}__right-${i}`,
      properties: { 'port.side': 'EAST', 'port.index': i },
      x: width,
      y: getHandleY(i, height),
    }));

    return {
      id: node.id,
      width,
      height,
      ports: [...inputPorts, ...outputPorts],
      properties: { 'portConstraints': 'FIXED_POS' },
    };
  });

  const elkEdges = componentEdges.map(edge => ({
    id: edge.id,
    sources: [`${edge.source}__${edge.sourceHandle || 'right-0'}`],
    targets: [`${edge.target}__${edge.targetHandle || 'left-0'}`],
  }));

  const graph = {
    id: 'root',
    properties: {
      'algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': elkRouting,
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.spacing.nodeNodeBetweenLayers': layerSpacing,
      'elk.spacing.nodeNode': nodeNodeSpacing,
      'elk.layered.spacing.edgeNodeBetweenLayers': edgeNodeSpacing,
      'elk.layered.spacing.edgeEdgeBetweenLayers': edgePath === 'straight' ? '40' : '20',
      'elk.padding': '[top=50, left=50, bottom=50, right=50]',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(graph);
  return layouted.children || [];
};

/**
 * Pack laid-out components into a grid, left-to-right wrapping by row height.
 * Components are sorted largest-first so big graphs anchor the layout.
 */
const packComponents = (componentResults) => {
  // Sort by width (widest first) so large graphs don't get pushed to odd positions
  const sorted = [...componentResults].sort((a, b) => b.bounds.width - a.bounds.width);

  const GAP = 200;
  const MAX_ROW_WIDTH = Math.max(
    3000,
    sorted[0]?.bounds.width + GAP * 2
  );

  const positions = new Map(); // componentIndex -> { offsetX, offsetY }
  let rowX = 0;
  let rowY = 0;
  let rowMaxHeight = 0;

  sorted.forEach((comp, i) => {
    if (rowX > 0 && rowX + comp.bounds.width > MAX_ROW_WIDTH) {
      // Wrap to next row
      rowY += rowMaxHeight + GAP;
      rowX = 0;
      rowMaxHeight = 0;
    }
    positions.set(i, { offsetX: rowX, offsetY: rowY });
    rowX += comp.bounds.width + GAP;
    rowMaxHeight = Math.max(rowMaxHeight, comp.bounds.height);
  });

  return { sorted, positions };
};

/**
 * Auto layout using ELK per connected component, then grid-packed.
 */
export const autoLayout = async (nodes, edges, edgeSettings = {}) => {
  if (!nodes || nodes.length === 0) return nodes;

  const components = findConnectedComponents(nodes, edges);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Layout each component independently
  const componentResults = await Promise.all(
    components.map(async (componentNodeIds) => {
      const componentNodes = [...componentNodeIds].map(id => nodeMap.get(id));
      const componentEdges = edges.filter(
        e => componentNodeIds.has(e.source) && componentNodeIds.has(e.target)
      );

      try {
        const layoutedChildren = await layoutComponent(componentNodes, componentEdges, edgeSettings);

        // Compute bounding box of this component's result
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layoutedChildren.forEach(n => {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + n.width);
          maxY = Math.max(maxY, n.y + n.height);
        });

        return {
          nodeIds: componentNodeIds,
          layoutedChildren,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        };
      } catch (err) {
        console.error('ELK layout failed for component:', err);
        // Fall back to original positions for this component
        return {
          nodeIds: componentNodeIds,
          layoutedChildren: componentNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y, width: NODE_WIDTH, height: calculateNodeHeight(n) })),
          bounds: { x: 0, y: 0, width: NODE_WIDTH, height: 200 },
        };
      }
    })
  );

  // Pack components into a grid
  const { sorted, positions } = packComponents(componentResults);

  // Build final node position map
  const finalPositions = new Map();
  sorted.forEach((comp, i) => {
    const { offsetX, offsetY } = positions.get(i);
    comp.layoutedChildren.forEach(elkNode => {
      finalPositions.set(elkNode.id, {
        x: elkNode.x - comp.bounds.x + offsetX,
        y: elkNode.y - comp.bounds.y + offsetY,
      });
    });
  });

  return nodes.map(node => {
    const pos = finalPositions.get(node.id);
    if (!pos) return node;
    return { ...node, position: pos };
  });
};