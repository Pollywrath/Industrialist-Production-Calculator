/**
 * Machine Count Propagation System  
 * Simplified approach: Calculate exact machines needed based on connection requirements
 */

const EPSILON = 1e-10;

/**
 * Calculate machines needed to produce/consume a given rate
 */
const calculateMachinesForRate = (node, rate, productId, isOutput) => {
  let cycleTime = node.cycleTime;
  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
  
  if (isOutput) {
    // Producing this product
    const output = node.outputs.find(o => o.productId === productId);
    if (!output || typeof output.quantity !== 'number' || output.quantity <= 0) return 0;
    
    const ratePerMachine = node.isMineshaftDrill ? output.quantity : output.quantity / cycleTime;
    return rate / ratePerMachine;
  } else {
    // Consuming this product
    const input = node.inputs.find(i => i.productId === productId);
    if (!input || typeof input.quantity !== 'number' || input.quantity <= 0) return 0;
    
    const ratePerMachine = node.isMineshaftDrill ? input.quantity : input.quantity / cycleTime;
    return rate / ratePerMachine;
  }
};

/**
 * Propagate machine count changes using ratio-based scaling
 */
export const propagateMachineCount = (sourceNodeId, oldMachineCount, newMachineCount, graph, flows) => {
  if (oldMachineCount <= EPSILON) {
    return new Map([[sourceNodeId, newMachineCount]]);
  }
  
  const ratio = newMachineCount / oldMachineCount;
  
  const newCounts = new Map();
  newCounts.set(sourceNodeId, newMachineCount);
  
  const nodeRatios = new Map();
  nodeRatios.set(sourceNodeId, ratio);
  
  // Find all connected nodes using BFS
  const visited = new Set([sourceNodeId]);
  const queue = [sourceNodeId];
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = graph.nodes[nodeId];
    if (!node) continue;
    
    // Add downstream consumers
    node.outputs.forEach(output => {
      const connections = graph.products[output.productId]?.connections.filter(
        conn => conn.sourceNodeId === nodeId
      ) || [];
      connections.forEach(conn => {
        if (!visited.has(conn.targetNodeId)) {
          visited.add(conn.targetNodeId);
          queue.push(conn.targetNodeId);
        }
      });
    });
    
    // Add upstream producers
    node.inputs.forEach(input => {
      const connections = graph.products[input.productId]?.connections.filter(
        conn => conn.targetNodeId === nodeId
      ) || [];
      connections.forEach(conn => {
        if (!visited.has(conn.sourceNodeId)) {
          visited.add(conn.sourceNodeId);
          queue.push(conn.sourceNodeId);
        }
      });
    });
  }
  
  // Multi-pass propagation until convergence
  const MAX_ITERATIONS = 10;
  let iteration = 0;
  let hasChanges = true;
  
  while (hasChanges && iteration < MAX_ITERATIONS) {
    hasChanges = false;
    iteration++;
    
    visited.forEach(nodeId => {
      if (nodeId === sourceNodeId) return;
      
      const node = graph.nodes[nodeId];
      if (!node) return;
      
      const oldCount = node.machineCount || 0;
      if (oldCount <= EPSILON) return;
      
      const ratioVotes = [];
      const requirements = [];
      
      // Check what ratio downstream consumers need
      node.outputs.forEach((output, outputIndex) => {
        const connections = graph.products[output.productId]?.connections.filter(
          conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outputIndex
        ) || [];
        
        connections.forEach(conn => {
          const consumerRatio = nodeRatios.get(conn.targetNodeId);
          if (consumerRatio !== undefined) {
            ratioVotes.push(consumerRatio);
            requirements.push({
              type: 'output',
              productId: output.productId,
              targetNodeId: conn.targetNodeId,
              ratio: consumerRatio
            });
          }
        });
      });
      
      // Check what ratio upstream producers are scaling to
      node.inputs.forEach((input, inputIndex) => {
        const connections = graph.products[input.productId]?.connections.filter(
          conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
        ) || [];
        
        connections.forEach(conn => {
          const producerRatio = nodeRatios.get(conn.sourceNodeId);
          if (producerRatio !== undefined) {
            ratioVotes.push(producerRatio);
            requirements.push({
              type: 'input',
              productId: input.productId,
              sourceNodeId: conn.sourceNodeId,
              ratio: producerRatio
            });
          }
        });
      });
      
      if (ratioVotes.length === 0) return;
      
      // Use the maximum ratio (most demanding requirement)
      const finalRatio = Math.max(...ratioVotes);
      const currentRatio = nodeRatios.get(nodeId) || 1.0;
      
      // Only update if ratio changed significantly
      if (Math.abs(finalRatio - currentRatio) > 0.0001) {
        nodeRatios.set(nodeId, finalRatio);
        const newCount = oldCount * finalRatio;
        newCounts.set(nodeId, newCount);
        hasChanges = true;
      }
    });
  }
  
  return newCounts;
};

/**
 * Propagate from handle - excludes directly connected nodes
 */
export const propagateFromHandle = (sourceNodeId, handleSide, handleIndex, oldMachineCount, newMachineCount, graph, flows) => {
  if (oldMachineCount <= EPSILON) {
    return new Map([[sourceNodeId, newMachineCount]]);
  }
  
  // Get directly connected nodes to exclude
  const node = graph.nodes[sourceNodeId];
  if (!node) return new Map();
  
  const excludeNodeIds = new Set();
  
  if (handleSide === 'left') {
    const input = node.inputs[handleIndex];
    if (input) {
      const connections = graph.products[input.productId]?.connections.filter(
        conn => conn.targetNodeId === sourceNodeId && conn.targetInputIndex === handleIndex
      ) || [];
      connections.forEach(conn => excludeNodeIds.add(conn.sourceNodeId));
    }
  } else {
    const output = node.outputs[handleIndex];
    if (output) {
      const connections = graph.products[output.productId]?.connections.filter(
        conn => conn.sourceNodeId === sourceNodeId && conn.sourceOutputIndex === handleIndex
      ) || [];
      connections.forEach(conn => excludeNodeIds.add(conn.targetNodeId));
    }
  }
  
  // Run normal propagation
  const allResults = propagateMachineCount(sourceNodeId, oldMachineCount, newMachineCount, graph, flows);
  
  // Filter out excluded nodes
  const filteredResults = new Map();
  allResults.forEach((count, nodeId) => {
    if (!excludeNodeIds.has(nodeId)) {
      filteredResults.set(nodeId, count);
    }
  });
  
  return filteredResults;
};

/**
 * Calculate machine count for new connection
 */
export const calculateMachineCountForNewConnection = (newNodeRecipe, targetNode, autoConnect, flows) => {
  if (!autoConnect || !targetNode || !flows) return 1;
  
  const targetNodeFlows = flows.byNode[targetNode.id];
  if (!targetNodeFlows) return 1;
  
  let targetRate = 0;
  
  if (autoConnect.isOutput) {
    const outputFlow = targetNodeFlows.outputFlows[autoConnect.outputIndex];
    if (outputFlow) {
      const excess = outputFlow.produced - outputFlow.connected;
      targetRate = Math.max(0, excess);
    }
  } else {
    const inputFlow = targetNodeFlows.inputFlows[autoConnect.inputIndex];
    if (inputFlow) {
      const shortage = inputFlow.needed - inputFlow.connected;
      targetRate = Math.max(0, shortage);
    }
  }
  
  if (targetRate <= EPSILON) return 0;
  
  let cycleTime = newNodeRecipe.cycle_time;
  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
  
  if (autoConnect.isOutput) {
    const newInput = newNodeRecipe.inputs.find(item => item.product_id === autoConnect.productId);
    if (newInput && typeof newInput.quantity === 'number' && newInput.quantity > 0) {
      const newRatePerMachine = newInput.quantity / cycleTime;
      return targetRate / newRatePerMachine;
    }
  } else {
    const newOutput = newNodeRecipe.outputs.find(item => item.product_id === autoConnect.productId);
    if (newOutput) {
      const quantity = newOutput.originalQuantity !== undefined ? newOutput.originalQuantity : newOutput.quantity;
      if (typeof quantity === 'number' && quantity > 0) {
        const newRatePerMachine = quantity / cycleTime;
        return targetRate / newRatePerMachine;
      }
    }
  }
  
  return 1;
};