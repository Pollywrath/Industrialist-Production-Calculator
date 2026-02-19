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
  return BASE_INFO_HEIGHT + ioAreaHeight + 12;
};

const getHandleY = (index) => {
  const ioColumnPadding = 24;
  const ioAreaTop = BASE_INFO_HEIGHT + ioColumnPadding / 2;
  return ioAreaTop + index * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
};

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
      y: getHandleY(i),
    }));
    const outputPorts = Array.from({ length: outputCount }, (_, i) => ({
      id: `${node.id}__right-${i}`,
      properties: { 'port.side': 'EAST', 'port.index': i },
      x: width,
      y: getHandleY(i),
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
  return {
    children: layouted.children || [],
    edges: layouted.edges || [],
  };
};

const packComponents = (componentResults) => {
  const sorted = [...componentResults].sort((a, b) => b.bounds.width - a.bounds.width);
  const GAP = 200;
  const MAX_ROW_WIDTH = Math.max(3000, (sorted[0]?.bounds.width || 0) + GAP * 2);

  const positions = new Map();
  let rowX = 0, rowY = 0, rowMaxHeight = 0;

  sorted.forEach((comp, i) => {
    if (rowX > 0 && rowX + comp.bounds.width > MAX_ROW_WIDTH) {
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
          nodeIds: componentNodeIds,
          layoutedChildren,
          layoutedEdges,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        };
      } catch (err) {
        console.error('ELK layout failed for component:', err);
        return {
          nodeIds: componentNodeIds,
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

  // Build final node positions
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

  // Extract edge routing data from ELK bend points
  const edgeUpdates = new Map();

  sorted.forEach((comp, i) => {
    const { offsetX, offsetY } = positions.get(i);
    const tx = (x) => x - comp.bounds.x + offsetX;
    const ty = (y) => y - comp.bounds.y + offsetY;

    comp.layoutedEdges.forEach(elkEdge => {
      const section = elkEdge.sections?.[0];
      if (!section) return;

      const bendPoints = (section.bendPoints || []).map(p => ({ x: tx(p.x), y: ty(p.y) }));
      if (bendPoints.length === 0) return;

      const originalEdge = edgeMap.get(elkEdge.id);
      if (!originalEdge) return;

      const sourceNodeData = nodeMap.get(originalEdge.source);
      const targetNodeData = nodeMap.get(originalEdge.target);
      if (!sourceNodeData || !targetNodeData) return;

      const sourcePos = finalPositions.get(originalEdge.source);
      const targetPos = finalPositions.get(originalEdge.target);
      if (!sourcePos || !targetPos) return;

      const sourceHandleIdx = parseInt(originalEdge.sourceHandle?.split('-')[1] || '0');
      const targetHandleIdx = parseInt(originalEdge.targetHandle?.split('-')[1] || '0');
      const sourceX = sourcePos.x + NODE_WIDTH;
      const sourceY = sourcePos.y + getHandleY(sourceHandleIdx);
      const targetX = targetPos.x;
      const targetY = targetPos.y + getHandleY(targetHandleIdx);

      if (edgePath === 'orthogonal') {
        // Average x of bend points = position of the vertical segment
        const midX = bendPoints.reduce((s, p) => s + p.x, 0) / bendPoints.length;
        edgeUpdates.set(elkEdge.id, { orthoMidX: midX, bezierOffset: undefined });
      } else if (edgePath === 'bezier') {
        // Average bend point relative to the direct line midpoint
        const avgX = bendPoints.reduce((s, p) => s + p.x, 0) / bendPoints.length;
        const avgY = bendPoints.reduce((s, p) => s + p.y, 0) / bendPoints.length;
        edgeUpdates.set(elkEdge.id, {
          bezierOffset: {
            x: avgX - (sourceX + targetX) / 2,
            y: avgY - (sourceY + targetY) / 2,
          },
          orthoMidX: undefined,
        });
      }
    });
  });

  const updatedNodes = nodes.map(node => {
    const pos = finalPositions.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });

  const updatedEdges = edges.map(edge => {
    const update = edgeUpdates.get(edge.id);
    if (!update) return edge;
    return { ...edge, data: { ...edge.data, ...update } };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
};