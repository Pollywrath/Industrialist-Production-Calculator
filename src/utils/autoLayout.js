import dagre from 'dagre';

// Constants from CustomNode.jsx
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const BASE_INFO_HEIGHT = 120;
const NODE_WIDTH = 380;

/**
 * Calculate the height of a node based on its input/output counts
 */
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

/**
 * Auto layout using dagre with tree-like branching
 */
export const autoLayout = (nodes, edges) => {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }

  // Create a new directed graph
  const g = new dagre.graphlib.Graph({ multigraph: true });
  
  // Set graph options for tree-like layout
  g.setGraph({
    rankdir: 'LR',              // Left to right layout
    nodesep: 200,     // Vertical spacing
ranksep: 200,     // Horizontal spacing (same as vertical)
edgesep: 100,           // Space between parallel edges
    ranker: 'network-simplex',  // Best quality for minimizing crossings
    acyclicer: 'greedy',        // Handle cycles intelligently
    marginx: 50,
    marginy: 50
  });
  
  // Default edge settings
  g.setDefaultEdgeLabel(() => ({}));
  
  // Add nodes to the graph with their dimensions
  nodes.forEach(node => {
    const width = NODE_WIDTH;
    const height = calculateNodeHeight(node);
    g.setNode(node.id, { width, height });
  });
  
  // Add edges to the graph
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target, { id: edge.id }, edge.id);
  });
  
  // Run dagre layout
  dagre.layout(g);
  
  // Apply the calculated positions to nodes
  const updatedNodes = nodes.map(node => {
    const nodeWithPosition = g.node(node.id);
    
    return {
      ...node,
      position: {
        // dagre centers nodes, so we need to adjust for top-left positioning
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2
      }
    };
  });
  
  return updatedNodes;
};