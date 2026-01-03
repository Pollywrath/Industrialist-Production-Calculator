import { HEAT_SOURCES } from '../utils/temperatureHandler';

const EPSILON = 1e-10;

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
 * Detect if a node is part of a feedback loop
 */
const detectLoop = (nodeId, graph, visited = new Set(), path = new Set()) => {
  if (path.has(nodeId)) return true; // Loop detected
  if (visited.has(nodeId)) return false;
  
  visited.add(nodeId);
  path.add(nodeId);
  
  const node = graph.nodes[nodeId];
  if (!node) return false;
  
  // Check all outputs' consumers
  for (const output of node.outputs) {
    const connections = graph.products[output.productId]?.connections.filter(
      conn => conn.sourceNodeId === nodeId
    ) || [];
    
    for (const conn of connections) {
      if (detectLoop(conn.targetNodeId, graph, visited, path)) {
        return true;
      }
    }
  }
  
  path.delete(nodeId);
  return false;
};

/**
 * Check if an output feeds back to the same node through a loop
 * Uses path-based cycle detection
 */
const checkOutputFeedsLoop = (startNodeId, outputIndex, graph) => {
  const startNode = graph.nodes[startNodeId];
  if (!startNode) return false;
  
  const output = startNode.outputs[outputIndex];
  if (!output) return false;
  
  console.log(`[Loop Check START] Node ${startNodeId} output ${outputIndex} (${output.productId})`);
  
  // BFS to trace all paths from this output
  const queue = [{ nodeId: startNodeId, outputIndex, depth: 0 }];
  const visited = new Set(); // Nodes we've fully explored
  
  while (queue.length > 0) {
    const { nodeId, outputIndex: outIdx, depth } = queue.shift();
    
    const node = graph.nodes[nodeId];
    if (!node) continue;
    
    const nodeOutput = node.outputs[outIdx];
    if (!nodeOutput) continue;
    
    const productData = graph.products[nodeOutput.productId];
    if (!productData) continue;
    
    const visitKey = `${nodeId}:${outIdx}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    
    // Find all consumers of this output
    const connections = productData.connections.filter(
      conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outIdx
    );
    
    console.log(`${'  '.repeat(depth)}[Depth ${depth}] Node ${nodeId} output ${outIdx} (${nodeOutput.productId}): ${connections.length} consumers`);
    
    for (const conn of connections) {
      const consumer = graph.nodes[conn.targetNodeId];
      if (!consumer) continue;
      
      console.log(`${'  '.repeat(depth + 1)}Consumer: ${conn.targetNodeId} (${consumer.recipe?.name || 'Unknown'})`);
      
      // Check if this consumer is the start node (loop detected!)
      if (conn.targetNodeId === startNodeId) {
        console.log(`${'  '.repeat(depth + 1)}âœ… LOOP DETECTED: Consumer IS the start node!`);
        return true;
      }
      
      // Add all outputs of this consumer to the queue
      for (let i = 0; i < consumer.outputs.length; i++) {
        queue.push({ nodeId: conn.targetNodeId, outputIndex: i, depth: depth + 1 });
      }
    }
  }
  
  console.log(`  âŒ No loop detected after full traversal`);
  return false;
};

/**
 * Check if a consumer is part of the loop chain (helper for equilibrium)
 */
const isConsumerInLoopChain = (startNodeId, consumerNodeId, graph) => {
  // BFS from consumer to see if it leads back to start
  const queue = [consumerNodeId];
  const visited = new Set([consumerNodeId]);
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = graph.nodes[nodeId];
    if (!node) continue;
    
    // Check all outputs of this node
    for (let i = 0; i < node.outputs.length; i++) {
      const output = node.outputs[i];
      const productData = graph.products[output.productId];
      if (!productData) continue;
      
      const connections = productData.connections.filter(
        conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === i
      );
      
      for (const conn of connections) {
        // If this connects back to start, it's in the loop!
        if (conn.targetNodeId === startNodeId) {
          return true;
        }
        
        // Continue searching
        if (!visited.has(conn.targetNodeId)) {
          visited.add(conn.targetNodeId);
          queue.push(conn.targetNodeId);
        }
      }
    }
  }
  
  return false;
};

/**
 * Calculate loop equilibrium for an output with external + internal demand
 */
const calculateOutputLoopEquilibrium = (nodeId, outputIndex, externalDemand, graph, flows) => {
  const node = graph.nodes[nodeId];
  if (!node) return externalDemand;
  
  const output = node.outputs[outputIndex];
  if (!output) return externalDemand;
  
  const outputFlow = flows.byNode[nodeId]?.outputFlows[outputIndex];
  if (!outputFlow) return externalDemand;
  
  const productData = graph.products[output.productId];
  if (!productData) return externalDemand;
  
  console.log(`[Loop Equilibrium] Node ${nodeId} output ${outputIndex} (${output.productId}), external demand: ${externalDemand.toFixed(4)}`);
  
  // Find connections from this output
  const connections = productData.connections.filter(
    conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outputIndex
  );
  
  let currentLoopDemand = 0;
  let currentExternalDemand = 0;
  let externalConsumers = 0;
  let loopConsumers = 0;
  
  for (const conn of connections) {
    const consumer = graph.nodes[conn.targetNodeId];
    if (!consumer) continue;
    
    const consumerInputFlow = flows.byNode[conn.targetNodeId]?.inputFlows[conn.targetInputIndex];
    if (!consumerInputFlow) continue;
    
    console.log(`  Consumer ${conn.targetNodeId}: needs ${consumerInputFlow.needed.toFixed(4)}/s`);
    
    // Check if this consumer is part of the loop chain
    const inLoopChain = isConsumerInLoopChain(nodeId, conn.targetNodeId, graph);
    
    if (inLoopChain) {
      currentLoopDemand += consumerInputFlow.needed;
      loopConsumers++;
      console.log(`    âœ… Part of loop chain! Loop demand: ${consumerInputFlow.needed.toFixed(4)}/s`);
    } else {
      currentExternalDemand += consumerInputFlow.needed;
      externalConsumers++;
      console.log(`    âŒ External consumer (not in loop)`);
    }
  }
  
  console.log(`  Loop consumers: ${loopConsumers}, External consumers: ${externalConsumers}`);
  console.log(`  Current loop demand: ${currentLoopDemand.toFixed(4)}/s, Current external: ${currentExternalDemand.toFixed(4)}/s`);
  console.log(`  NEW external demand (shortage): ${externalDemand.toFixed(4)}/s`);
  
  // ONLY apply equilibrium if this output has BOTH loop AND external consumers
  if (loopConsumers > 0 && externalConsumers > 0) {
    // The shortage represents NEW demand that needs to be met
    // Current state: producing enough for currentLoopDemand + currentExternalDemand
    // New state: need to produce enough for currentLoopDemand + currentExternalDemand + newExternalDemand
    
    const totalCurrentProduction = outputFlow.produced;
    
    // Calculate what fraction of current production goes to the loop
    const loopRatio = totalCurrentProduction > EPSILON ? currentLoopDemand / totalCurrentProduction : 0;
    
    console.log(`  Loop ratio: ${(loopRatio * 100).toFixed(2)}% of current production`);
    
    if (loopRatio > 0.05) { // Any significant loop (>5%)
      // Calculate current external production (what's going to non-loop consumers)
      const currentExternalProduction = totalCurrentProduction - currentLoopDemand;
      
      // New external production needed = current external + new shortage
      const newExternalProduction = currentExternalProduction + externalDemand;
      
      // Apply equilibrium formula: P_total = P_external / (1 - loop_ratio)
      const newTotalProduction = newExternalProduction / (1 - loopRatio);
      
      // The ADDITIONAL production needed beyond current
      const additionalProduction = newTotalProduction - totalCurrentProduction;
      
      console.log(`  Current external production: ${currentExternalProduction.toFixed(4)}/s`);
      console.log(`  New external production: ${newExternalProduction.toFixed(4)}/s`);
      console.log(`  Equilibrium: new total production = ${newTotalProduction.toFixed(4)}/s`);
      console.log(`  Current production = ${totalCurrentProduction.toFixed(4)}/s`);
      console.log(`  Additional needed: ${additionalProduction.toFixed(4)}/s`);
      return additionalProduction;
    }
    
    // Small loop, just use the shortage directly
    console.log(`  Small loop ratio, using shortage directly`);
    return externalDemand;
  }
  
  console.log(`  No loop adjustment needed`);
  return externalDemand;
};

/**
 * Calculate machine count adjustment suggestions based on connection topology
 */
export const calculateSuggestions = (graph, flows) => {
  const suggestions = [];
  
  // Find all deficient inputs
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const nodeFlows = flows.byNode[nodeId];
    if (!nodeFlows) return;
    
    node.inputs.forEach((input, inputIndex) => {
      const inputFlow = nodeFlows.inputFlows[inputIndex];
      if (!inputFlow) return;
      
      const shortage = inputFlow.needed - inputFlow.connected;
      if (shortage <= EPSILON) return;
      
      const productId = input.productId;
      
      // Find all outputs that could help through complex graph (keep old logic)
      const candidateOutputs = findOutputsForDeficientInput(graph, flows, nodeId, inputIndex);
      
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
        
        // Check if this output feeds a loop
        const feedsLoop = checkOutputFeedsLoop(outputInfo.nodeId, outputInfo.outputIndex, graph);
        
        // Calculate adjusted shortage accounting for loop equilibrium
        const adjustedShortage = feedsLoop
          ? calculateOutputLoopEquilibrium(outputInfo.nodeId, outputInfo.outputIndex, shortage, graph, flows)
          : shortage;
        
        console.log(`[Suggestion] Node ${outputInfo.nodeId} output ${outputInfo.outputIndex}: shortage=${shortage.toFixed(4)}, adjusted=${adjustedShortage.toFixed(4)}, feedsLoop=${feedsLoop}`);
        
        const increase = adjustedShortage / ratePerMachine;
        const newCount = currentMachineCount + increase;
        
        console.log(`  Current machines: ${currentMachineCount.toFixed(4)}, Suggested: ${newCount.toFixed(4)} (increase: ${increase.toFixed(4)})`);
        
        // Check if this supplier has other outputs that would be affected
        const hasConstrainedOutputs = outputNode.outputs.length > 1 && outputNode.outputs.some((otherOutput, idx) => {
          if (idx === outputInfo.outputIndex) return false;
          
          const otherProductData = graph.products[otherOutput.productId];
          if (!otherProductData) return false;
          
          // Check if other output has connected consumers without alternatives
          const hasConsumers = otherProductData.connections.some(
            c => c.sourceNodeId === outputInfo.nodeId && c.sourceOutputIndex === idx
          );
          
          if (!hasConsumers) return false;
          
          // Check if those consumers have no alternatives
          return otherProductData.connections.some(c => {
            if (c.sourceNodeId !== outputInfo.nodeId || c.sourceOutputIndex !== idx) return false;
            
            const alternatives = otherProductData.connections.filter(
              alt => alt.targetNodeId === c.targetNodeId &&
                     alt.targetInputIndex === c.targetInputIndex &&
                     alt.sourceNodeId !== outputInfo.nodeId
            );
            
            return alternatives.length === 0;
          });
        });
        
        suggestions.push({
          nodeId: outputInfo.nodeId,
          handleType: 'output',
          handleIndex: outputInfo.outputIndex,
          productId: output.productId,
          adjustmentType: 'increase',
          reason: feedsLoop ? 'loop_demand' : 'connected_shortage',
          currentFlow: outputFlow.produced,
          targetFlow: outputFlow.produced + adjustedShortage,
          deltaFlow: adjustedShortage,
          currentMachineCount,
          suggestedMachineCount: newCount,
          machineDelta: increase,
          hasConstrainedOutputs,
          isMultiOutput: outputNode.outputs.length > 1
        });
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
      
      // Check if this output feeds a loop and has external consumers
      const feedsLoop = checkOutputFeedsLoop(nodeId, outputIndex, graph);
      
      let adjustedExcess = excess;
      
      if (feedsLoop) {
        // Calculate how much we can safely reduce while maintaining loop
        const productData = graph.products[output.productId];
        if (productData) {
          const connections = productData.connections.filter(
            conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === outputIndex
          );
          
          let currentLoopDemand = 0;
          let currentExternalDemand = 0;
          let externalConsumers = 0;
          
          for (const conn of connections) {
            const consumer = graph.nodes[conn.targetNodeId];
            if (!consumer) continue;
            
            const consumerInputFlow = flows.byNode[conn.targetNodeId]?.inputFlows[conn.targetInputIndex];
            if (!consumerInputFlow) continue;
            
            const inLoopChain = isConsumerInLoopChain(nodeId, conn.targetNodeId, graph);
            
            if (inLoopChain) {
              currentLoopDemand += consumerInputFlow.needed;
            } else {
              currentExternalDemand += consumerInputFlow.needed;
              externalConsumers++;
            }
          }
          
          // Only apply equilibrium if there are both loop and external consumers
          if (currentLoopDemand > EPSILON && externalConsumers > 0) {
            const totalCurrentProduction = outputFlow.produced;
            const loopRatio = totalCurrentProduction > EPSILON ? currentLoopDemand / totalCurrentProduction : 0;
            
            if (loopRatio > 0.05) {
              // Calculate equilibrium for reduction
              // Current external production (what's actually going external)
              const currentExternalProduction = totalCurrentProduction - currentLoopDemand;
              
              // We want to reduce external by 'excess' amount
              const newExternalProduction = currentExternalProduction - excess;
              
              // New total production needed to maintain loop
              const newTotalProduction = newExternalProduction / (1 - loopRatio);
              
              // The reduction we can safely make
              const safeReduction = totalCurrentProduction - newTotalProduction;
              adjustedExcess = safeReduction;
              
              console.log(`[Excess Loop Equilibrium] Node ${nodeId} output ${outputIndex}`);
              console.log(`  Loop ratio: ${(loopRatio * 100).toFixed(2)}%`);
              console.log(`  Current production: ${totalCurrentProduction.toFixed(4)}/s`);
              console.log(`  Raw excess: ${excess.toFixed(4)}/s`);
              console.log(`  Adjusted excess (with loop): ${adjustedExcess.toFixed(4)}/s`);
            }
          }
        }
      }
      
      // Suggest decreasing this output (producer)
      const reduction = adjustedExcess / ratePerMachine;
      const newCount = currentMachineCount - reduction;
      
      if (newCount > EPSILON) {
        suggestions.push({
          nodeId,
          handleType: 'output',
          handleIndex: outputIndex,
          productId: output.productId,
          adjustmentType: 'decrease',
          reason: feedsLoop ? 'excess_with_loop' : 'excess',
          currentFlow: outputFlow.produced,
          targetFlow: outputFlow.produced - adjustedExcess,
          deltaFlow: -adjustedExcess,
          currentMachineCount,
          suggestedMachineCount: newCount,
          machineDelta: -reduction
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
        
        const increase = excess / consumerRatePerMachine;
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
          machineDelta: increase
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