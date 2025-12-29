const EPSILON = 1e-15;

/**
 * Find all outputs that could help supply a deficient input through connection chains
 * This includes both direct connections and indirect paths through competing consumers
 */
const findOutputsForDeficientInput = (graph, flows, targetNodeId, targetInputIndex) => {
  const candidates = new Map(); // outputKey -> { nodeId, outputIndex, maxFlow }
  const visited = new Set();
  
  const targetInput = graph.nodes[targetNodeId]?.inputs[targetInputIndex];
  if (!targetInput) return candidates;
  
  const productId = targetInput.productId;
  const productData = graph.products[productId];
  if (!productData) return candidates;
  
  // BFS to find all outputs that could potentially help
  const queue = [{ nodeId: targetNodeId, inputIndex: targetInputIndex, productId }];
  visited.add(`${targetNodeId}:${targetInputIndex}`);
  
  while (queue.length > 0) {
    const { nodeId, inputIndex, productId: currentProductId } = queue.shift();
    
    // Find all outputs directly connected to this input
    const connections = graph.products[currentProductId]?.connections.filter(
      conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
    ) || [];
    
    connections.forEach(conn => {
      const sourceNode = graph.nodes[conn.sourceNodeId];
      if (!sourceNode) return;
      
      const outputKey = `${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
      const outputFlow = flows.byNode[conn.sourceNodeId]?.outputFlows[conn.sourceOutputIndex];
      
      if (outputFlow) {
        // This output directly connects to our path
        candidates.set(outputKey, {
          nodeId: conn.sourceNodeId,
          outputIndex: conn.sourceOutputIndex,
          maxFlow: outputFlow.produced
        });
        
        // Now find other inputs that this output also feeds (competing consumers)
        const sourceOutput = sourceNode.outputs[conn.sourceOutputIndex];
        if (!sourceOutput) return;
        
        const allConnectionsFromThisOutput = graph.products[sourceOutput.productId]?.connections.filter(
          c => c.sourceNodeId === conn.sourceNodeId && c.sourceOutputIndex === conn.sourceOutputIndex
        ) || [];
        
        allConnectionsFromThisOutput.forEach(competingConn => {
          // Skip if it's the same input we're already looking at
          if (competingConn.targetNodeId === nodeId && competingConn.targetInputIndex === inputIndex) return;
          
          const competingKey = `${competingConn.targetNodeId}:${competingConn.targetInputIndex}`;
          if (visited.has(competingKey)) return;
          
          // This competing consumer might be fed by other outputs - trace those too
          visited.add(competingKey);
          
          const competingInput = graph.nodes[competingConn.targetNodeId]?.inputs[competingConn.targetInputIndex];
          if (competingInput) {
            queue.push({
              nodeId: competingConn.targetNodeId,
              inputIndex: competingConn.targetInputIndex,
              productId: competingInput.productId
            });
          }
        });
      }
    });
  }
  
  return candidates;
};

/**
 * Find all inputs that could consume excess from an output through connection chains
 */
const findInputsForExcessOutput = (graph, flows, sourceNodeId, sourceOutputIndex) => {
  const candidates = new Map(); // inputKey -> { nodeId, inputIndex }
  const visited = new Set();
  
  const sourceOutput = graph.nodes[sourceNodeId]?.outputs[sourceOutputIndex];
  if (!sourceOutput) return candidates;
  
  const productId = sourceOutput.productId;
  const productData = graph.products[productId];
  if (!productData) return candidates;
  
  // BFS to find all inputs that could potentially consume this excess
  const queue = [{ nodeId: sourceNodeId, outputIndex: sourceOutputIndex, productId }];
  visited.add(`${sourceNodeId}:${sourceOutputIndex}`);
  
  while (queue.length > 0) {
    const { nodeId, outputIndex, productId: currentProductId } = queue.shift();
    
    // Find all inputs directly connected to this output
    const connections = graph.products[currentProductId]?.connections.filter(
      conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outputIndex
    ) || [];
    
    connections.forEach(conn => {
      const targetNode = graph.nodes[conn.targetNodeId];
      if (!targetNode) return;
      
      const inputKey = `${conn.targetNodeId}:${conn.targetInputIndex}`;
      const inputFlow = flows.byNode[conn.targetNodeId]?.inputFlows[conn.targetInputIndex];
      
      if (inputFlow) {
        candidates.set(inputKey, {
          nodeId: conn.targetNodeId,
          inputIndex: conn.targetInputIndex
        });
        
        // Find other outputs that also feed this input (alternative suppliers)
        const targetInput = targetNode.inputs[conn.targetInputIndex];
        if (!targetInput) return;
        
        const allConnectionsToThisInput = graph.products[targetInput.productId]?.connections.filter(
          c => c.targetNodeId === conn.targetNodeId && c.targetInputIndex === conn.targetInputIndex
        ) || [];
        
        allConnectionsToThisInput.forEach(altConn => {
          if (altConn.sourceNodeId === nodeId && altConn.sourceOutputIndex === outputIndex) return;
          
          const altKey = `${altConn.sourceNodeId}:${altConn.sourceOutputIndex}`;
          if (visited.has(altKey)) return;
          
          visited.add(altKey);
          
          const altOutput = graph.nodes[altConn.sourceNodeId]?.outputs[altConn.sourceOutputIndex];
          if (altOutput) {
            queue.push({
              nodeId: altConn.sourceNodeId,
              outputIndex: altConn.sourceOutputIndex,
              productId: altOutput.productId
            });
          }
        });
      }
    });
  }
  
  return candidates;
};

/**
 * Calculate machine count adjustment suggestions based on connection topology
 */
export const calculateSuggestions = (graph, flows) => {
  const suggestions = [];
  
  // Find all deficient inputs and trace which outputs could help
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const nodeFlows = flows.byNode[nodeId];
    if (!nodeFlows) return;
    
    node.inputs.forEach((input, inputIndex) => {
      const inputFlow = nodeFlows.inputFlows[inputIndex];
      if (!inputFlow) return;
      
      const shortage = inputFlow.needed - inputFlow.connected;
      if (shortage <= EPSILON) return;
      
      // Find all outputs that could help this deficient input
      const candidateOutputs = findOutputsForDeficientInput(graph, flows, nodeId, inputIndex);
      
      candidateOutputs.forEach((outputInfo, outputKey) => {
        const outputNode = graph.nodes[outputInfo.nodeId];
        if (!outputNode) return;
        
        const currentMachineCount = outputNode.machineCount || 0;
        if (currentMachineCount <= 0) return;
        
        let cycleTime = outputNode.cycleTime;
        if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
        
        const output = outputNode.outputs[outputInfo.outputIndex];
        const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
        const ratePerMachine = outputNode.isMineshaftDrill ? quantity : quantity / cycleTime;
        
        if (typeof ratePerMachine !== 'number' || ratePerMachine <= EPSILON) return;
        
        // Calculate how much this output needs to increase
        // Limited by the shortage and the bottleneck in the path
        const outputFlow = flows.byNode[outputInfo.nodeId]?.outputFlows[outputInfo.outputIndex];
        if (!outputFlow) return;
        
        const currentUtilization = outputFlow.connected / (outputFlow.produced || 1);
        
        // Only suggest if this output is heavily utilized (> 95%) or already at capacity
        if (currentUtilization > 0.95 || Math.abs(outputFlow.produced - outputFlow.connected) < EPSILON) {
          const increase = shortage / ratePerMachine;
          const newCount = currentMachineCount + increase;
          
          suggestions.push({
            nodeId: outputInfo.nodeId,
            handleType: 'output',
            handleIndex: outputInfo.outputIndex,
            productId: output.productId,
            adjustmentType: 'increase',
            reason: 'connected_shortage',
            currentFlow: outputFlow.produced,
            targetFlow: outputFlow.produced + shortage,
            deltaFlow: shortage,
            currentMachineCount,
            suggestedMachineCount: newCount,
            machineDelta: increase
          });
        }
      });
      
      // Also suggest decreasing this input's consumer to match available supply
      const ratePerMachine = node.isMineshaftDrill ? input.quantity : input.quantity / (node.cycleTime || 1);
      if (typeof ratePerMachine === 'number' && ratePerMachine > EPSILON) {
        const reduction = shortage / ratePerMachine;
        const newCount = (node.machineCount || 0) - reduction;
        
        if (newCount > EPSILON) {
          suggestions.push({
            nodeId,
            handleType: 'input',
            handleIndex: inputIndex,
            productId: input.productId,
            adjustmentType: 'decrease',
            reason: 'shortage',
            currentFlow: inputFlow.connected,
            targetFlow: inputFlow.connected,
            deltaFlow: -shortage,
            currentMachineCount: node.machineCount || 0,
            suggestedMachineCount: newCount,
            machineDelta: -reduction
          });
        }
      }
    });
  });
  
  // Find all excess outputs and trace which inputs could consume them
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const nodeFlows = flows.byNode[nodeId];
    if (!nodeFlows) return;
    
    const currentMachineCount = node.machineCount || 0;
    if (currentMachineCount <= 0) return;
    
    let cycleTime = node.cycleTime;
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
    
    node.outputs.forEach((output, outputIndex) => {
      const outputFlow = nodeFlows.outputFlows[outputIndex];
      if (!outputFlow) return;
      
      const excess = outputFlow.produced - outputFlow.connected;
      if (excess <= EPSILON) return;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      if (typeof ratePerMachine !== 'number' || ratePerMachine <= EPSILON) return;
      
      // Suggest decreasing this output
      const reduction = excess / ratePerMachine;
      const newCount = currentMachineCount - reduction;
      
      if (newCount > EPSILON) {
        suggestions.push({
          nodeId,
          handleType: 'output',
          handleIndex: outputIndex,
          productId: output.productId,
          adjustmentType: 'decrease',
          reason: 'excess',
          currentFlow: outputFlow.produced,
          targetFlow: outputFlow.connected,
          deltaFlow: -excess,
          currentMachineCount,
          suggestedMachineCount: newCount,
          machineDelta: -reduction
        });
      }
    });
  });
  
  // Round all machine counts to 15 decimal places
  suggestions.forEach(s => {
    s.suggestedMachineCount = Math.round(s.suggestedMachineCount * 1e15) / 1e15;
    s.machineDelta = Math.round(s.machineDelta * 1e15) / 1e15;
  });
  
  return suggestions;
};

/**
 * Find suggestion for a specific handle
 */
export const getSuggestionForHandle = (suggestions, nodeId, handleType, handleIndex) => {
  return suggestions.find(s => 
    s.nodeId === nodeId && 
    s.handleType === handleType && 
    s.handleIndex === handleIndex
  );
};

/**
 * Get all suggestions for a specific node
 */
export const getSuggestionsForNode = (suggestions, nodeId) => {
  return suggestions.filter(s => s.nodeId === nodeId);
};

/**
 * Check if a handle has any suggestions
 */
export const hasHandleSuggestion = (suggestions, nodeId, handleType, handleIndex) => {
  return suggestions.some(s => 
    s.nodeId === nodeId && 
    s.handleType === handleType && 
    s.handleIndex === handleIndex
  );
};