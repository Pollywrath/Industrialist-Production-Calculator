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
 * Assign layers by working backward from consumers (tree-like branching)
 * Nodes that feed the same consumer are placed in the same layer
 */
const assignLayers = (nodes, edges, sccs, nodeToSCC) => {
  const layers = new Map();
  const sccLayers = new Map();
  
  // Build adjacency lists
  const outgoing = new Map(); // node -> [nodes it feeds]
  const incoming = new Map(); // node -> [nodes that feed it]
  const sccOutgoing = new Map();
  const sccIncoming = new Map();
  
  nodes.forEach(node => {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  });
  
  sccs.forEach((_, index) => {
    sccOutgoing.set(index, new Set());
    sccIncoming.set(index, new Set());
  });
  
  edges.forEach(edge => {
    if (outgoing.has(edge.source)) {
      outgoing.get(edge.source).push(edge.target);
    }
    if (incoming.has(edge.target)) {
      incoming.get(edge.target).push(edge.source);
    }
    
    const sourceSCC = nodeToSCC.get(edge.source);
    const targetSCC = nodeToSCC.get(edge.target);
    if (sourceSCC !== targetSCC && sourceSCC !== undefined && targetSCC !== undefined) {
      sccOutgoing.get(sourceSCC).add(targetSCC);
      sccIncoming.get(targetSCC).add(sourceSCC);
    }
  });
  
  // Find sink SCCs (no outgoing edges to other SCCs)
  const sinks = [];
  sccOutgoing.forEach((outSet, sccIndex) => {
    if (outSet.size === 0) {
      sinks.push(sccIndex);
    }
  });
  
  // Start from sinks and work backward
  // Sinks are at the rightmost layer (highest number)
  const visited = new Set();
  const queue = sinks.map(sccIndex => ({ sccIndex, layer: 0 }));
  
  queue.forEach(item => {
    sccLayers.set(item.sccIndex, item.layer);
    visited.add(item.sccIndex);
  });
  
  let maxLayer = 0;
  
  while (queue.length > 0) {
    const { sccIndex, layer } = queue.shift();
    
    // Process all SCCs that feed into this one
    const suppliers = Array.from(sccIncoming.get(sccIndex) || []);
    
    suppliers.forEach(supplierSCC => {
      if (visited.has(supplierSCC)) {
        // Already visited - update layer to be at least one less than all its consumers
        const currentLayer = sccLayers.get(supplierSCC);
        const consumers = Array.from(sccOutgoing.get(supplierSCC) || []);
        const minConsumerLayer = Math.min(...consumers.map(c => sccLayers.get(c) || 0));
        const newLayer = minConsumerLayer - 1;
        
        if (newLayer < currentLayer) {
          sccLayers.set(supplierSCC, newLayer);
          maxLayer = Math.max(maxLayer, Math.abs(newLayer));
        }
      } else {
        // First time visiting - place one layer before this consumer
        const newLayer = layer - 1;
        sccLayers.set(supplierSCC, newLayer);
        maxLayer = Math.max(maxLayer, Math.abs(newLayer));
        visited.add(supplierSCC);
        queue.push({ sccIndex: supplierSCC, layer: newLayer });
      }
    });
  }
  
  // Handle any unvisited SCCs (disconnected components)
  sccs.forEach((_, sccIndex) => {
    if (!visited.has(sccIndex)) {
      sccLayers.set(sccIndex, -maxLayer - 1);
      maxLayer = maxLayer + 1;
    }
  });
  
  // Normalize layers to start from 0
  const minLayer = Math.min(...Array.from(sccLayers.values()));
  sccLayers.forEach((layer, sccIndex) => {
    sccLayers.set(sccIndex, layer - minLayer);
  });
  
  // Update maxLayer
  maxLayer = Math.max(...Array.from(sccLayers.values()));
  
  // Assign layers to individual nodes
  nodes.forEach(node => {
    const sccIndex = nodeToSCC.get(node.id);
    const layer = sccLayers.get(sccIndex) || 0;
    layers.set(node.id, layer);
  });
  
  return { layers, maxLayer };
};

/**
 * Group nodes by their consumer relationships (tree branches)
 * Nodes that feed the same consumer should be grouped together
 */
const groupNodesByConsumers = (nodes, edges, layers) => {
  const outgoing = new Map();
  nodes.forEach(node => outgoing.set(node.id, []));
  edges.forEach(edge => {
    if (outgoing.has(edge.source)) {
      outgoing.get(edge.source).push(edge.target);
    }
  });
  
  const nodeGroups = new Map();
  
  nodes.forEach(node => {
    const consumers = outgoing.get(node.id) || [];
    const nodeLayer = layers.get(node.id);
    
    // Create a signature based on consumers
    // Nodes feeding the same set of consumers are in the same group
    const consumerSignature = consumers
      .slice()
      .sort()
      .join(',') || `no-consumers-${nodeLayer}`;
    
    if (!nodeGroups.has(consumerSignature)) {
      nodeGroups.set(consumerSignature, []);
    }
    nodeGroups.get(consumerSignature).push(node);
  });
  
  return nodeGroups;
};

/**
 * Organize nodes within each layer based on tree-like branching
 * Groups nodes by what they feed into
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
  
  // Build adjacency
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
  
  // Group nodes by their consumer relationships
  const consumerGroups = groupNodesByConsumers(nodes, edges, layers);
  
  // Assign initial positions based on consumer groups
  const nodePositions = new Map();
  let globalYOffset = 0;
  
  // Process from right to left (consumers first)
  for (let layer = maxLayer; layer >= 0; layer--) {
    const nodesInLayer = layerNodes.get(layer);
    if (nodesInLayer.length === 0) continue;
    
    // Group nodes in this layer by their consumers
    const layerGroups = new Map();
    nodesInLayer.forEach(node => {
      const consumers = (outgoingEdges.get(node.id) || [])
        .filter(targetId => layers.get(targetId) === layer + 1)
        .sort()
        .join(',') || `no-consumers-${layer}`;
      
      if (!layerGroups.has(consumers)) {
        layerGroups.set(consumers, []);
      }
      layerGroups.get(consumers).push(node);
    });
    
    // Sort each group by the median Y position of their consumers
    const sortedGroups = [];
    layerGroups.forEach((groupNodes, signature) => {
      const medianY = groupNodes.reduce((sum, node) => {
        const consumers = outgoingEdges.get(node.id) || [];
        if (consumers.length === 0) return sum;
        
        const consumerYs = consumers
          .map(consumerId => nodePositions.get(consumerId))
          .filter(y => y !== undefined);
        
        if (consumerYs.length === 0) return sum;
        
        consumerYs.sort((a, b) => a - b);
        const mid = Math.floor(consumerYs.length / 2);
        const median = consumerYs.length % 2 === 0
          ? (consumerYs[mid - 1] + consumerYs[mid]) / 2
          : consumerYs[mid];
        
        return sum + median;
      }, 0) / groupNodes.length;
      
      sortedGroups.push({ nodes: groupNodes, medianY: medianY || 0 });
    });
    
    sortedGroups.sort((a, b) => a.medianY - b.medianY);
    
    // Assign positions to nodes in this layer
    let yPosition = 0;
    const orderedNodes = [];
    
    sortedGroups.forEach(group => {
      group.nodes.forEach(node => {
        nodePositions.set(node.id, yPosition);
        orderedNodes.push(node);
        yPosition++;
      });
    });
    
    layerNodes.set(layer, orderedNodes);
  }
  
  return layerNodes;
};

/**
 * Build adjacency maps for positioning
 */
const buildAdjacencyMaps = (nodes, edges) => {
  const outgoing = new Map();
  const incoming = new Map();
  
  nodes.forEach(node => {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  });
  
  edges.forEach(edge => {
    if (outgoing.has(edge.source)) {
      outgoing.get(edge.source).push(edge.target);
    }
    if (incoming.has(edge.target)) {
      incoming.get(edge.target).push(edge.source);
    }
  });
  
  return { outgoing, incoming };
};

/**
 * Calculate positions using tree layout - consumers center on their suppliers
 */
const calculatePositions = (layerNodes, maxLayer, edges, nodes, layers) => {
  const positions = new Map();
  const { outgoing, incoming } = buildAdjacencyMaps(nodes, edges);
  const nodeHeights = new Map();
  
  nodes.forEach(node => {
    nodeHeights.set(node.id, calculateNodeHeight(node));
  });
  
  // Process from right to left (consumers first, then suppliers)
  for (let layer = maxLayer; layer >= 0; layer--) {
    const nodesInLayer = layerNodes.get(layer);
    const x = layer * (NODE_WIDTH + HORIZONTAL_SPACING);
    
    // Separate nodes into groups based on their consumer connections
    const nodeGroups = new Map(); // consumer signature -> nodes
    
    nodesInLayer.forEach(node => {
      const consumers = outgoing.get(node.id) || [];
      
      // Create signature based on consumers
      const signature = consumers.length === 0 
        ? `sink-${node.id}` 
        : consumers.sort().join(',');
      
      if (!nodeGroups.has(signature)) {
        nodeGroups.set(signature, []);
      }
      nodeGroups.get(signature).push(node);
    });
    
    // Position each group
    let groupStartY = 0;
    
    nodeGroups.forEach((groupNodes, signature) => {
      if (signature.startsWith('sink-')) {
        // Sink nodes - just stack them
        groupNodes.forEach(node => {
          const height = nodeHeights.get(node.id);
          positions.set(node.id, { x, y: groupStartY });
          groupStartY += height + VERTICAL_SPACING;
        });
      } else {
        // Nodes that feed into consumers
        const consumers = signature.split(',');
        
        // Calculate total height needed for this group
        const totalHeight = groupNodes.reduce((sum, node, idx) => {
          const height = nodeHeights.get(node.id);
          return sum + height + (idx > 0 ? VERTICAL_SPACING : 0);
        }, 0);
        
        // Get consumer positions to determine where to center this group
        const consumerYs = consumers
          .map(consumerId => {
            const pos = positions.get(consumerId);
            const height = nodeHeights.get(consumerId) || 200;
            return pos ? pos.y + height / 2 : null;
          })
          .filter(y => y !== null);
        
        let groupCenterY;
        if (consumerYs.length > 0) {
          // Center the group on the average of consumer centers
          const avgConsumerY = consumerYs.reduce((a, b) => a + b, 0) / consumerYs.length;
          groupCenterY = avgConsumerY;
        } else {
          // Consumers not positioned yet - use current position
          groupCenterY = groupStartY + totalHeight / 2;
        }
        
        // Position nodes in this group centered around groupCenterY
        let currentY = groupCenterY - totalHeight / 2;
        
        groupNodes.forEach(node => {
          const height = nodeHeights.get(node.id);
          positions.set(node.id, { x, y: currentY });
          currentY += height + VERTICAL_SPACING;
        });
        
        groupStartY = currentY;
      }
    });
  }
  
  return positions;
};

/**
 * Check if two nodes overlap
 */
const nodesOverlap = (pos1, height1, pos2, height2, minSpacing = VERTICAL_SPACING) => {
  const top1 = pos1.y;
  const bottom1 = pos1.y + height1;
  const top2 = pos2.y;
  const bottom2 = pos2.y + height2;
  
  // Add minimum spacing to overlap check
  return (top1 - minSpacing < bottom2) && (bottom1 + minSpacing > top2) && 
         Math.abs(pos1.x - pos2.x) < NODE_WIDTH + 20;
};

/**
 * Simple but effective overlap resolution - just push nodes apart layer by layer
 */
const resolveOverlaps = (nodes, positions, layers, edges) => {
  const nodeHeights = new Map();
  nodes.forEach(node => {
    nodeHeights.set(node.id, calculateNodeHeight(node));
  });
  
  // Group nodes by layer
  const layerGroups = new Map();
  nodes.forEach(node => {
    const layer = layers.get(node.id);
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer).push(node.id);
  });
  
  // Process each layer independently
  layerGroups.forEach((nodeIds, layer) => {
    if (nodeIds.length <= 1) return;
    
    // Create array of node data sorted by Y position
    let layerNodes = nodeIds.map(id => ({
      id,
      pos: positions.get(id),
      height: nodeHeights.get(id)
    })).sort((a, b) => a.pos.y - b.pos.y);
    
    // Multiple passes to resolve all overlaps
    let maxPasses = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let hadOverlap = false;
      
      // Forward pass - push down
      for (let i = 0; i < layerNodes.length - 1; i++) {
        const current = layerNodes[i];
        const next = layerNodes[i + 1];
        
        const currentBottom = current.pos.y + current.height;
        const gap = next.pos.y - currentBottom;
        
        if (gap < VERTICAL_SPACING) {
          // Overlap or too close - push next node down
          const requiredShift = VERTICAL_SPACING - gap;
          next.pos.y += requiredShift;
          positions.set(next.id, { x: next.pos.x, y: next.pos.y });
          hadOverlap = true;
        }
      }
      
      // Backward pass - push up
      for (let i = layerNodes.length - 1; i > 0; i--) {
        const current = layerNodes[i];
        const prev = layerNodes[i - 1];
        
        const prevBottom = prev.pos.y + prev.height;
        const gap = current.pos.y - prevBottom;
        
        if (gap < VERTICAL_SPACING) {
          // Overlap or too close - push prev node up
          const requiredShift = VERTICAL_SPACING - gap;
          prev.pos.y -= requiredShift;
          positions.set(prev.id, { x: prev.pos.x, y: prev.pos.y });
          hadOverlap = true;
        }
      }
      
      // Re-sort for next pass
      layerNodes.sort((a, b) => a.pos.y - b.pos.y);
      
      // If no overlaps found, we're done
      if (!hadOverlap) break;
    }
  });
  
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
    
    // Get loop nodes and their positions
    const loopNodes = loop.map(nodeId => nodes.find(n => n.id === nodeId)).filter(n => n);
    const loopPositions = loop.map(nodeId => positions.get(nodeId)).filter(p => p);
    
    if (loopPositions.length > 0) {
      const avgX = loopPositions.reduce((sum, pos) => sum + pos.x, 0) / loopPositions.length;
      
      // Calculate total height needed for loop nodes
      const nodeHeights = loopNodes.map(node => ({
        id: node.id,
        height: calculateNodeHeight(node),
        pos: positions.get(node.id)
      }));
      
      // Sort by Y position
      nodeHeights.sort((a, b) => a.pos.y - b.pos.y);
      
      // Arrange vertically with proper spacing
      const totalHeight = nodeHeights.reduce((sum, node, index) => 
        sum + node.height + (index > 0 ? VERTICAL_SPACING : 0), 0
      );
      
      let currentY = -totalHeight / 2; // Center vertically
      
      nodeHeights.forEach(node => {
        positions.set(node.id, {
          x: avgX, // Align all loop nodes to same X
          y: currentY
        });
        currentY += node.height + VERTICAL_SPACING;
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
  
  // Step 4: Organize nodes within layers (with multiple optimization passes)
  const layerNodes = organizeNodesInLayers(nodes, layers, maxLayer, edges);
  
  // Step 5: Calculate initial positions (centered on consumers)
  let positions = calculatePositions(layerNodes, maxLayer, edges, nodes, layers);
  
  // Step 6: Handle loops for better positioning
  positions = handleLoops(nodes, edges, sccs, positions);
  
  // Step 7: Resolve overlaps using branch-aware shifting
  positions = resolveOverlaps(nodes, positions, layers, edges);
  
  // Step 8: Apply positions to nodes
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