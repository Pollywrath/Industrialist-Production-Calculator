// Auto Layout System for Production Graphs
// Automatically arranges nodes from left to right (upstream to downstream)
// with intelligent positioning to avoid overlaps and minimize edge crossings

// Constants from CustomNode.jsx
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const BASE_INFO_HEIGHT = 120;
const NODE_WIDTH = 380;

// Layout configuration
const HORIZONTAL_SPACING = 200; // Space between layers (left to right)
const VERTICAL_SPACING = 100;   // Minimum space between nodes in same layer
const LOOP_OFFSET = 150;        // Extra spacing for loop back-edges

/**
 * Calculate the height of a node based on its input/output counts
 */
const calculateNodeHeight = (node) => {
  const recipe = node.data?.recipe;
  if (!recipe) return BASE_INFO_HEIGHT + 100; // Default fallback
  
  const leftCount = recipe.inputs?.length || 0;
  const rightCount = recipe.outputs?.length || 0;
  const maxCount = Math.max(leftCount, rightCount, 1);
  
  // From CustomNode: 12px top + 12px bottom padding for columns
  const ioColumnPadding = 24;
  const ioAreaHeight = (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + ioColumnPadding;
  const bottomPadding = 12;
  
  return BASE_INFO_HEIGHT + ioAreaHeight + bottomPadding;
};

/**
 * Tarjan's algorithm to find strongly connected components (loops)
 */
const findStronglyConnectedComponents = (nodes, edges) => {
  const graph = new Map();
  const nodeIds = nodes.map(n => n.id);
  
  // Build adjacency list
  nodeIds.forEach(id => graph.set(id, []));
  edges.forEach(edge => {
    if (graph.has(edge.source)) {
      graph.get(edge.source).push(edge.target);
    }
  });
  
  let index = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  
  const strongConnect = (nodeId) => {
    indices.set(nodeId, index);
    lowLinks.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);
    
    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId), lowLinks.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId), indices.get(neighbor)));
      }
    }
    
    if (lowLinks.get(nodeId) === indices.get(nodeId)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== nodeId);
      
      if (scc.length > 0) {
        sccs.push(scc);
      }
    }
  };
  
  for (const nodeId of nodeIds) {
    if (!indices.has(nodeId)) {
      strongConnect(nodeId);
    }
  }
  
  return sccs;
};

/**
 * Build a condensed graph where each SCC is treated as a single node
 */
const buildCondensedGraph = (nodes, edges, sccs) => {
  const nodeToSCC = new Map();
  sccs.forEach((scc, index) => {
    scc.forEach(nodeId => nodeToSCC.set(nodeId, index));
  });
  
  const sccGraph = new Map();
  const sccInDegree = new Map();
  
  sccs.forEach((_, index) => {
    sccGraph.set(index, new Set());
    sccInDegree.set(index, 0);
  });
  
  edges.forEach(edge => {
    const sourceSCC = nodeToSCC.get(edge.source);
    const targetSCC = nodeToSCC.get(edge.target);
    
    // Only add edges between different SCCs
    if (sourceSCC !== targetSCC && sourceSCC !== undefined && targetSCC !== undefined) {
      if (!sccGraph.get(sourceSCC).has(targetSCC)) {
        sccGraph.get(sourceSCC).add(targetSCC);
        sccInDegree.set(targetSCC, sccInDegree.get(targetSCC) + 1);
      }
    }
  });
  
  return { sccGraph, sccInDegree, nodeToSCC };
};

/**
 * Assign layers using topological sort on the condensed graph
 */
const assignLayers = (nodes, edges, sccs, nodeToSCC) => {
  const layers = new Map();
  const sccLayers = new Map();
  
  // Build condensed graph
  const { sccGraph, sccInDegree } = buildCondensedGraph(nodes, edges, sccs);
  
  // Topological sort on SCCs using Kahn's algorithm
  const queue = [];
  sccInDegree.forEach((degree, sccIndex) => {
    if (degree === 0) {
      queue.push({ sccIndex, layer: 0 });
      sccLayers.set(sccIndex, 0);
    }
  });
  
  let maxLayer = 0;
  
  while (queue.length > 0) {
    const { sccIndex, layer } = queue.shift();
    
    const neighbors = sccGraph.get(sccIndex);
    neighbors.forEach(neighborSCC => {
      const currentDegree = sccInDegree.get(neighborSCC);
      sccInDegree.set(neighborSCC, currentDegree - 1);
      
      const neighborLayer = Math.max(sccLayers.get(neighborSCC) || 0, layer + 1);
      sccLayers.set(neighborSCC, neighborLayer);
      maxLayer = Math.max(maxLayer, neighborLayer);
      
      if (sccInDegree.get(neighborSCC) === 0) {
        queue.push({ sccIndex: neighborSCC, layer: neighborLayer });
      }
    });
  }
  
  // Assign layers to individual nodes
  nodes.forEach(node => {
    const sccIndex = nodeToSCC.get(node.id);
    const layer = sccLayers.get(sccIndex) || 0;
    layers.set(node.id, layer);
  });
  
  return { layers, maxLayer };
};

/**
 * Organize nodes within each layer to minimize crossings
 */
const organizeNodesInLayers = (nodes, layers, maxLayer, edges) => {
  const layerNodes = new Map();
  
  // Group nodes by layer
  for (let i = 0; i <= maxLayer; i++) {
    layerNodes.set(i, []);
  }
  
  nodes.forEach(node => {
    const layer = layers.get(node.id);
    layerNodes.get(layer).push(node);
  });
  
  // Build adjacency for ordering
  const outgoingEdges = new Map();
  const incomingEdges = new Map();
  
  nodes.forEach(node => {
    outgoingEdges.set(node.id, []);
    incomingEdges.set(node.id, []);
  });
  
  edges.forEach(edge => {
    if (outgoingEdges.has(edge.source)) {
      outgoingEdges.get(edge.source).push(edge.target);
    }
    if (incomingEdges.has(edge.target)) {
      incomingEdges.get(edge.target).push(edge.source);
    }
  });
  
  // Order nodes in each layer to minimize crossings
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerNodes.get(layer);
    
    if (nodesInLayer.length <= 1) continue;
    
    // Calculate barycenter (average position of connected nodes)
    const barycenters = nodesInLayer.map(node => {
      const incoming = incomingEdges.get(node.id) || [];
      const outgoing = outgoingEdges.get(node.id) || [];
      const connected = [...incoming, ...outgoing];
      
      if (connected.length === 0) return 0;
      
      const sum = connected.reduce((acc, connectedId) => {
        const connectedLayer = layers.get(connectedId);
        return acc + (connectedLayer || 0);
      }, 0);
      
      return sum / connected.length;
    });
    
    // Sort by barycenter
    const indexed = nodesInLayer.map((node, index) => ({ node, barycenter: barycenters[index] }));
    indexed.sort((a, b) => a.barycenter - b.barycenter);
    
    layerNodes.set(layer, indexed.map(item => item.node));
  }
  
  return layerNodes;
};

/**
 * Calculate positions for all nodes
 */
const calculatePositions = (layerNodes, maxLayer) => {
  const positions = new Map();
  const layerHeights = new Map();
  
  // Calculate total height needed for each layer
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerNodes.get(layer);
    const totalHeight = nodesInLayer.reduce((sum, node, index) => {
      const nodeHeight = calculateNodeHeight(node);
      return sum + nodeHeight + (index > 0 ? VERTICAL_SPACING : 0);
    }, 0);
    layerHeights.set(layer, totalHeight);
  }
  
  // Position nodes
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerNodes.get(layer);
    const layerHeight = layerHeights.get(layer);
    
    let currentY = -layerHeight / 2; // Center the layer vertically
    const x = layer * (NODE_WIDTH + HORIZONTAL_SPACING);
    
    nodesInLayer.forEach(node => {
      const nodeHeight = calculateNodeHeight(node);
      
      positions.set(node.id, {
        x,
        y: currentY
      });
      
      currentY += nodeHeight + VERTICAL_SPACING;
    });
  }
  
  return positions;
};

/**
 * Detect and handle loops for better positioning
 */
const handleLoops = (nodes, edges, sccs, positions) => {
  // Identify loops (SCCs with more than one node)
  const loops = sccs.filter(scc => scc.length > 1);
  
  loops.forEach(loop => {
    // Find edges entering and leaving the loop
    const loopNodeSet = new Set(loop);
    const entryPoints = new Set();
    const exitPoints = new Set();
    
    edges.forEach(edge => {
      const sourceInLoop = loopNodeSet.has(edge.source);
      const targetInLoop = loopNodeSet.has(edge.target);
      
      if (!sourceInLoop && targetInLoop) {
        entryPoints.add(edge.target);
      }
      if (sourceInLoop && !targetInLoop) {
        exitPoints.add(edge.source);
      }
    });
    
    // Group loop nodes closer together
    const loopPositions = loop.map(nodeId => positions.get(nodeId)).filter(p => p);
    
    if (loopPositions.length > 0) {
      const avgX = loopPositions.reduce((sum, pos) => sum + pos.x, 0) / loopPositions.length;
      const avgY = loopPositions.reduce((sum, pos) => sum + pos.y, 0) / loopPositions.length;
      
      // Tighten loop nodes around their center
      loop.forEach(nodeId => {
        const currentPos = positions.get(nodeId);
        if (currentPos) {
          const dx = currentPos.x - avgX;
          const dy = currentPos.y - avgY;
          
          positions.set(nodeId, {
            x: avgX + dx * 0.7, // Pull 30% closer to center
            y: avgY + dy * 0.7
          });
        }
      });
    }
  });
  
  return positions;
};

/**
 * Main auto layout function
 */
export const autoLayout = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }
  
  // Step 1: Find strongly connected components (loops)
  const sccs = findStronglyConnectedComponents(nodes, edges);
  
  // Step 2: Build node to SCC mapping
  const nodeToSCC = new Map();
  sccs.forEach((scc, index) => {
    scc.forEach(nodeId => nodeToSCC.set(nodeId, index));
  });
  
  // Step 3: Assign layers using topological sort
  const { layers, maxLayer } = assignLayers(nodes, edges, sccs, nodeToSCC);
  
  // Step 4: Organize nodes within layers
  const layerNodes = organizeNodesInLayers(nodes, layers, maxLayer, edges);
  
  // Step 5: Calculate positions
  let positions = calculatePositions(layerNodes, maxLayer);
  
  // Step 6: Handle loops for better positioning
  positions = handleLoops(nodes, edges, sccs, positions);
  
  // Step 7: Apply positions to nodes
  const updatedNodes = nodes.map(node => {
    const position = positions.get(node.id);
    if (position) {
      return {
        ...node,
        position: {
          x: position.x,
          y: position.y
        }
      };
    }
    return node;
  });
  
  return updatedNodes;
};