const EPSILON = 1e-10;

/**
 * Detect if a node is part of a production cycle
 * Returns the loop amplification factor (how much extra production is needed due to the loop)
 */
const detectProductionCycle = (graph, nodeId, productId) => {
  const visited = new Set();
  const path = new Set();
  const cycleNodes = new Set();
  
  const dfs = (currentNode, currentProduct, depth = 0) => {
    if (depth > 50) return false; // Prevent infinite recursion
    
    const key = `${currentNode}:${currentProduct}`;
    
    if (path.has(key)) {
      // Cycle detected - collect all nodes in the cycle
      return true;
    }
    
    if (visited.has(key)) return false;
    
    visited.add(key);
    path.add(key);
    
    const node = graph.nodes[currentNode];
    if (!node) {
      path.delete(key);
      return false;
    }
    
    // Find which inputs consume this product
    node.inputs.forEach((input, inputIndex) => {
      if (input.productId === currentProduct) {
        // This node consumes the product - now check what it produces
        node.outputs.forEach((output, outputIndex) => {
          const connections = graph.products[output.productId]?.connections.filter(
            conn => conn.sourceNodeId === currentNode && conn.sourceOutputIndex === outputIndex
          ) || [];
          
          connections.forEach(conn => {
            const isCycle = dfs(conn.targetNodeId, output.productId, depth + 1);
            if (isCycle) {
              cycleNodes.add(currentNode);
              cycleNodes.add(conn.targetNodeId);
            }
          });
        });
      }
    });
    
    path.delete(key);
    return cycleNodes.size > 0;
  };
  
  dfs(nodeId, productId);
  
  if (cycleNodes.size === 0) {
    return { inCycle: false, amplificationFactor: 1.0 };
  }
  
  // Calculate amplification factor for the cycle
  // For each node in the cycle, calculate net production/consumption
  let totalLoopGain = 0;
  
  cycleNodes.forEach(cycleNodeId => {
    const cycleNode = graph.nodes[cycleNodeId];
    if (!cycleNode) return;
    
    // Find if this node produces and consumes any products in the cycle
    cycleNode.inputs.forEach(input => {
      const matchingOutput = cycleNode.outputs.find(out => out.productId === input.productId);
      if (matchingOutput) {
        // This node has a product that loops back
        const inputRate = cycleNode.isMineshaftDrill 
          ? input.quantity 
          : input.quantity / (cycleNode.cycleTime || 1);
        
        const quantity = matchingOutput.originalQuantity !== undefined 
          ? matchingOutput.originalQuantity 
          : matchingOutput.quantity;
        const outputRate = cycleNode.isMineshaftDrill 
          ? quantity 
          : quantity / (cycleNode.cycleTime || 1);
        
        if (outputRate > EPSILON) {
          // Loop gain = how much of output feeds back as input
          totalLoopGain += inputRate / outputRate;
        }
      }
    });
  });
  
  // Amplification factor = 1 / (1 - loop_gain)
  // If loop_gain approaches 1, amplification approaches infinity
  const loopGain = Math.min(totalLoopGain / cycleNodes.size, 0.95); // Cap at 0.95 for stability
  const amplificationFactor = 1 / (1 - loopGain);
  
  return { 
    inCycle: true, 
    amplificationFactor,
    cycleNodes: Array.from(cycleNodes)
  };
};

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
      
      // DEBUG: Log candidate outputs
      if (shortage > 0.1) {
        console.log(`[Suggestions] Node ${nodeId} input ${inputIndex} (${input.productId}) has shortage ${shortage.toFixed(4)}`);
        console.log(`  Found ${candidateOutputs.size} candidate outputs:`, Array.from(candidateOutputs.keys()));
      }
      
      candidateOutputs.forEach((outputInfo, outputKey) => {
        const outputNode = graph.nodes[outputInfo.nodeId];
        if (!outputNode) return;
        
        const currentMachineCount = outputNode.machineCount || 0;
        if (currentMachineCount <= 0) return;
        
        let cycleTime = outputNode.cycleTime;
        if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
        
        const output = outputNode.outputs[outputInfo.outputIndex];
        if (!output) return;
        
        const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
        if (typeof quantity !== 'number') return;
        
        const ratePerMachine = outputNode.isMineshaftDrill ? quantity : quantity / cycleTime;
        
        if (typeof ratePerMachine !== 'number' || ratePerMachine <= EPSILON) return;
        
        // Calculate how much this output needs to increase to supply the deficient input
        const outputFlow = flows.byNode[outputInfo.nodeId]?.outputFlows[outputInfo.outputIndex];
        if (!outputFlow) return;
        
        // Check if this node is part of a production cycle
        const producerNode = graph.nodes[outputInfo.nodeId];
        const cycleInfo = detectProductionCycle(graph, outputInfo.nodeId, output.productId);
        
        let increase;
        if (cycleInfo.inCycle && producerNode) {
          // Node is part of a multi-node cycle - apply amplification factor
          const baseIncrease = shortage / ratePerMachine;
          increase = baseIncrease * cycleInfo.amplificationFactor;
        } else {
          // Check for simple self-feeding
          const isSelfFeeding = producerNode?.inputs.some(inp => inp.productId === output.productId);
          
          if (isSelfFeeding && producerNode) {
            // Self-feeding loop detected - need to account for increased consumption
            const selfInput = producerNode.inputs.find(inp => inp.productId === output.productId);
            if (selfInput) {
              const inputRatePerMachine = producerNode.isMineshaftDrill 
                ? selfInput.quantity 
                : selfInput.quantity / (producerNode.cycleTime || 1);
              
              // Net production per machine = output - input
              const netRatePerMachine = ratePerMachine - inputRatePerMachine;
              
              if (netRatePerMachine > EPSILON) {
                increase = shortage / netRatePerMachine;
              } else {
                return;
              }
            } else {
              increase = shortage / ratePerMachine;
            }
          } else {
            // Normal case - not in cycle or self-feeding
            increase = shortage / ratePerMachine;
          }
        }
        
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
          machineDelta: increase,
          inCycle: cycleInfo.inCycle,
          cycleAmplification: cycleInfo.amplificationFactor
        });
      });
      
      // Also suggest decreasing this input's consumer to match available supply
      const ratePerMachine = node.isMineshaftDrill ? input.quantity : input.quantity / (node.cycleTime || 1);
      if (typeof ratePerMachine === 'number' && ratePerMachine > EPSILON) {
        // Check if this is a self-feeding decrease
        const isSelfFeeding = node.outputs.some(out => out.productId === input.productId);
        
        let reduction;
        if (isSelfFeeding) {
          // Self-feeding - need to account for reduced production as well
          const selfOutput = node.outputs.find(out => out.productId === input.productId);
          if (selfOutput) {
            const quantity = selfOutput.originalQuantity !== undefined ? selfOutput.originalQuantity : selfOutput.quantity;
            const outputRatePerMachine = node.isMineshaftDrill ? quantity : quantity / (node.cycleTime || 1);
            
            // Net consumption per machine = input - output
            const netConsumptionPerMachine = ratePerMachine - outputRatePerMachine;
            
            if (netConsumptionPerMachine > EPSILON) {
              // This node is a net consumer - reducing it helps
              reduction = shortage / netConsumptionPerMachine;
            } else {
              // This node is a net producer - don't suggest reduction
              return;
            }
          } else {
            reduction = shortage / ratePerMachine;
          }
        } else {
          reduction = shortage / ratePerMachine;
        }
        
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
            machineDelta: -reduction,
            isSelfFeeding
          });
        }
      }
    });
  });
  
  // Find all excess outputs and suggest both decreasing producers and increasing consumers
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
      
      // Suggest decreasing this output (producer)
      // Check for self-feeding
      const isSelfFeeding = node.inputs.some(inp => inp.productId === output.productId);
      
      let reduction;
      if (isSelfFeeding) {
        // Self-feeding - account for reduced consumption too
        const selfInput = node.inputs.find(inp => inp.productId === output.productId);
        if (selfInput) {
          const inputRatePerMachine = node.isMineshaftDrill 
            ? selfInput.quantity 
            : selfInput.quantity / (node.cycleTime || 1);
          
          const netRatePerMachine = ratePerMachine - inputRatePerMachine;
          
          if (netRatePerMachine > EPSILON) {
            reduction = excess / netRatePerMachine;
          } else {
            // Can't reduce excess via this node
            return;
          }
        } else {
          reduction = excess / ratePerMachine;
        }
      } else {
        reduction = excess / ratePerMachine;
      }
      
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
          machineDelta: -reduction,
          isSelfFeeding
        });
      }
      
      // Find all inputs this output feeds and suggest increasing those consumers
      const productId = output.productId;
      const connections = graph.products[productId]?.connections.filter(
        conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outputIndex
      ) || [];
      
      connections.forEach(conn => {
        const consumerNode = graph.nodes[conn.targetNodeId];
        if (!consumerNode) return;
        
        const consumerMachineCount = consumerNode.machineCount || 0;
        if (consumerMachineCount <= 0) return;
        
        let consumerCycleTime = consumerNode.cycleTime;
        if (typeof consumerCycleTime !== 'number' || consumerCycleTime <= 0) consumerCycleTime = 1;
        
        const consumerInput = consumerNode.inputs[conn.targetInputIndex];
        if (!consumerInput) return;
        
        const consumerRatePerMachine = consumerNode.isMineshaftDrill 
          ? consumerInput.quantity 
          : consumerInput.quantity / consumerCycleTime;
        
        if (typeof consumerRatePerMachine !== 'number' || consumerRatePerMachine <= EPSILON) return;
        
        // Check if THIS SPECIFIC input is self-fed (not just if node has any self-feeding loop)
        const selfFeedingConnection = graph.products[consumerInput.productId]?.connections.find(
          c => c.sourceNodeId === conn.targetNodeId && 
               c.targetNodeId === conn.targetNodeId && 
               c.targetInputIndex === conn.targetInputIndex
        );
        const isSelfFeeding = !!selfFeedingConnection;
        
        let increase;
        if (isSelfFeeding) {
          // Self-feeding consumer - account for increased production
          const selfOutput = consumerNode.outputs.find(out => out.productId === consumerInput.productId);
          if (selfOutput) {
            const quantity = selfOutput.originalQuantity !== undefined ? selfOutput.originalQuantity : selfOutput.quantity;
            const outputRatePerMachine = consumerNode.isMineshaftDrill 
              ? quantity 
              : quantity / (consumerNode.cycleTime || 1);
            
            // Net consumption per machine = input - output
            const netConsumptionPerMachine = consumerRatePerMachine - outputRatePerMachine;
            
            if (netConsumptionPerMachine > EPSILON) {
              increase = excess / netConsumptionPerMachine;
            } else {
              // This node doesn't net consume - skip suggestion
              return;
            }
          } else {
            increase = excess / consumerRatePerMachine;
          }
        } else {
          increase = excess / consumerRatePerMachine;
        }
        
        const newConsumerCount = consumerMachineCount + increase;
        
        suggestions.push({
          nodeId: conn.targetNodeId,
          handleType: 'input',
          handleIndex: conn.targetInputIndex,
          productId: consumerInput.productId,
          adjustmentType: 'increase',
          reason: 'excess_available',
          currentFlow: flows.byNode[conn.targetNodeId]?.inputFlows[conn.targetInputIndex]?.connected || 0,
          targetFlow: (flows.byNode[conn.targetNodeId]?.inputFlows[conn.targetInputIndex]?.connected || 0) + excess,
          deltaFlow: excess,
          currentMachineCount: consumerMachineCount,
          suggestedMachineCount: newConsumerCount,
          machineDelta: increase,
          isSelfFeeding
        });
      });
    });
  });
  
  // Round all machine counts to 20 decimal places for repeating decimals, otherwise 10
  suggestions.forEach(s => {
    // Check if value has repeating pattern by comparing 10 vs 20 decimal precision
    const at10 = Math.round(s.suggestedMachineCount * 1e10) / 1e10;
    const at20 = Math.round(s.suggestedMachineCount * 1e20) / 1e20;
    const hasRepeating = Math.abs(at20 - at10) > 1e-12;
    
    s.suggestedMachineCount = hasRepeating 
      ? Math.round(s.suggestedMachineCount * 1e20) / 1e20
      : Math.round(s.suggestedMachineCount * 1e10) / 1e10;
    
    const deltaAt10 = Math.round(s.machineDelta * 1e10) / 1e10;
    const deltaAt20 = Math.round(s.machineDelta * 1e20) / 1e20;
    const deltaHasRepeating = Math.abs(deltaAt20 - deltaAt10) > 1e-12;
    
    s.machineDelta = deltaHasRepeating
      ? Math.round(s.machineDelta * 1e20) / 1e20
      : Math.round(s.machineDelta * 1e10) / 1e10;
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