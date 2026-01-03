/**
 * Compute Machines Solver
 * Automatically adjusts machine counts to balance production for target recipes
 */

import { buildProductionGraph } from './graphBuilder';
import { solveProductionNetwork } from './productionSolver';

const EPSILON = 1e-10;
const MAX_ITERATIONS = 50;

// Debug mode
let DEBUG_MODE = false;
let lastDebugInfo = null;

export const setComputeDebugMode = (enabled) => { DEBUG_MODE = enabled; };
export const getLastComputeDebugInfo = () => lastDebugInfo;

/**
 * Calculate metrics for a node to aid in decision making
 */
const calculateNodeMetrics = (node) => {
  if (!node) return null;
  
  const recipe = node.recipe;
  if (!recipe) return null;
  
  const machineCount = node.machineCount || 0;
  
  // Calculate power
  let power = 0;
  const powerConsumption = recipe.power_consumption;
  if (typeof powerConsumption === 'number') {
    power = powerConsumption * machineCount;
  } else if (typeof powerConsumption === 'object' && powerConsumption?.max) {
    power = powerConsumption.max * machineCount;
  }
  
  // Calculate pollution
  let pollution = 0;
  const pollutionValue = recipe.pollution;
  if (typeof pollutionValue === 'number') {
    pollution = pollutionValue * machineCount;
  }
  
  // Count outputs (to determine if multi-output)
  const outputCount = recipe.outputs?.length || 0;
  
  return { machineCount, power, pollution, outputCount };
};

/**
 * Find all upstream nodes that feed into a target recursively
 */
const findUpstreamNodes = (nodeId, graph, targetNodeIds, visited = new Set(), result = new Set()) => {
  if (visited.has(nodeId)) return result;
  visited.add(nodeId);
  
  const node = graph.nodes[nodeId];
  if (!node) return result;
  
  node.inputs.forEach(input => {
    const connections = graph.products[input.productId]?.connections.filter(
      conn => conn.targetNodeId === nodeId
    ) || [];
    
    connections.forEach(conn => {
      const sourceId = conn.sourceNodeId;
      if (!targetNodeIds.has(sourceId) && !visited.has(sourceId)) {
        result.add(sourceId);
        findUpstreamNodes(sourceId, graph, targetNodeIds, visited, result);
      }
    });
  });
  
  return result;
};

/**
 * Main compute function - adjusts machine counts to balance production
 */
export const computeMachines = (nodes, edges, targetProducts) => {
  const debugInfo = {
    iterations: [],
    totalIterations: 0,
    converged: false,
    finalUpdates: new Map(),
    targetNodeIds: targetProducts.map(t => t.recipeBoxId),
    graphTopology: {}
  };
  
  if (DEBUG_MODE) {
    console.log('%c[Compute Machines Start]', 'color: #4a9eff; font-weight: bold');
    console.log(`Targets: ${targetProducts.length}`);
  }
  
  // Start with current nodes
  let currentNodes = [...nodes];
  const targetNodeIds = new Set(targetProducts.map(t => t.recipeBoxId));
  
  // Build initial graph for topology info
  const initialGraph = buildProductionGraph(currentNodes, edges);
  
  // Capture graph topology for debugging
  Object.keys(initialGraph.nodes).forEach(nodeId => {
    const node = initialGraph.nodes[nodeId];
    const nodeData = currentNodes.find(n => n.id === nodeId);
    
    debugInfo.graphTopology[nodeId] = {
      name: node.recipe?.name || 'Unknown',
      machineCount: node.machineCount || 0,
      inputs: node.inputs.map((input, idx) => {
        // Find all connections to this input
        const connections = initialGraph.products[input.productId]?.connections.filter(
          conn => conn.targetNodeId === nodeId && conn.targetInputIndex === idx
        ) || [];
        
        return {
          productId: input.productId,
          rate: input.rate,
          suppliers: connections.map(conn => {
            const sourceNode = initialGraph.nodes[conn.sourceNodeId];
            return {
              nodeId: conn.sourceNodeId,
              nodeName: sourceNode?.recipe?.name || 'Unknown',
              rate: conn.sourceRate
            };
          })
        };
      }),
      outputs: node.outputs.map((output, idx) => {
        // Find all connections from this output
        const connections = initialGraph.products[output.productId]?.connections.filter(
          conn => conn.sourceNodeId === nodeId && conn.sourceOutputIndex === idx
        ) || [];
        
        return {
          productId: output.productId,
          rate: output.rate,
          consumers: connections.map(conn => {
            const targetNode = initialGraph.nodes[conn.targetNodeId];
            return {
              nodeId: conn.targetNodeId,
              nodeName: targetNode?.recipe?.name || 'Unknown',
              rate: conn.targetRate
            };
          })
        };
      })
    };
  });
  
  let iteration = 0;
  let hasChanges = true;
  let noChangeIterations = 0;
  const MAX_NO_CHANGE_ITERATIONS = 3; // Stop if no changes for 3 iterations in a row
  
  while (hasChanges && iteration < MAX_ITERATIONS && noChangeIterations < MAX_NO_CHANGE_ITERATIONS) {
    iteration++;
    hasChanges = false;
    
    const iterationDebug = {
      iteration,
      updates: [],
      suggestions: []
    };
    
    // Build fresh graph and calculate flows with current node counts
    const graph = buildProductionGraph(currentNodes, edges);
    
    // Recalculate solution with current state
    const currentSolution = solveProductionNetwork(currentNodes, edges, { skipTemperature: true });
    const suggestions = currentSolution.suggestions || [];
    
    iterationDebug.suggestions = suggestions.length;
    
    if (suggestions.length === 0) {
      debugInfo.converged = true;
      break;
    }
    
    // Process each target
    const iterationUpdates = new Map();
    
    targetProducts.forEach((target) => {
      const targetNodeId = target.recipeBoxId;
      const targetNode = graph.nodes[targetNodeId];
      if (!targetNode) return;
      
      // Find upstream nodes that feed this target
      const upstreamNodes = findUpstreamNodes(targetNodeId, graph, targetNodeIds);
      
      // CASCADE APPROACH: Process nodes in layers, closest to target first
      // Build distance map (how many hops from target)
      const distanceFromTarget = new Map();
      distanceFromTarget.set(targetNodeId, 0);
      
      const queue = [targetNodeId];
      const visited = new Set([targetNodeId]);
      
      while (queue.length > 0) {
        const nodeId = queue.shift();
        const distance = distanceFromTarget.get(nodeId);
        const node = graph.nodes[nodeId];
        if (!node) continue;
        
        // Find all nodes that feed into this one
        node.inputs.forEach(input => {
          const connections = graph.products[input.productId]?.connections.filter(
            conn => conn.targetNodeId === nodeId
          ) || [];
          
          connections.forEach(conn => {
            if (!visited.has(conn.sourceNodeId) && upstreamNodes.has(conn.sourceNodeId)) {
              visited.add(conn.sourceNodeId);
              distanceFromTarget.set(conn.sourceNodeId, distance + 1);
              queue.push(conn.sourceNodeId);
            }
          });
        });
      }
      
      // Group nodes by distance (process closest to target first)
      const nodesByDistance = new Map();
      distanceFromTarget.forEach((distance, nodeId) => {
        if (!nodesByDistance.has(distance)) {
          nodesByDistance.set(distance, []);
        }
        nodesByDistance.get(distance).push(nodeId);
      });
      
      // Process each layer, starting from FARTHEST (bottom-up approach)
      // This ensures upstream suppliers are adjusted before downstream consumers
      const distances = Array.from(nodesByDistance.keys()).sort((a, b) => b - a);
      
      for (const distance of distances) {
        const nodesAtDistance = nodesByDistance.get(distance);
        
        // For each node at this distance, check for deficiencies
        for (const nodeId of nodesAtDistance) {
          const node = graph.nodes[nodeId];
          if (!node) continue;
          
          const nodeFlows = currentSolution.flows?.byNode[nodeId];
          if (!nodeFlows) continue;
          
          // Check each input for shortages
          node.inputs.forEach((input, inputIndex) => {
            const inputFlow = nodeFlows.inputFlows[inputIndex];
            if (!inputFlow) return;
            
            const productId = input.productId;
            const productData = graph.products[productId];
            
            // Calculate shortage excluding self-supplied flow
            let connectedFromOthers = 0;
            
            if (productData) {
              const connections = productData.connections.filter(
                conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
              );
              
              connections.forEach(conn => {
                // Only count connections from OTHER nodes (exclude self-loops)
                if (conn.sourceNodeId !== nodeId) {
                  const connectionFlow = currentSolution.flows?.byConnection[conn.id];
                  if (connectionFlow) {
                    connectedFromOthers += connectionFlow.flowRate;
                  }
                }
              });
            }
            
            const shortage = inputFlow.needed - connectedFromOthers;
            if (shortage <= EPSILON) return;
            
            // Check if this shortage is ONLY due to self-loop (no external suppliers at all)
            const hasExternalSuppliers = productData && productData.connections.some(conn =>
              conn.targetNodeId === nodeId && 
              conn.targetInputIndex === inputIndex &&
              conn.sourceNodeId !== nodeId
            );
            
            // If shortage exists but there are no external suppliers, this is a self-loop only input
            // Don't try to scale the node itself to fix its own self-loop
            if (!hasExternalSuppliers) {
              return; // Skip this input - it's self-sufficient by design
            }
            
            // Find suggestions to fix this shortage
            if (!productData) return;
            
            // Collect all possible fixes
            const possibleFixes = [];
            
            // Check which producers are DIRECTLY connected to this consumer
            const directlyConnectedProducers = new Set();
            productData.connections.forEach(conn => {
              if (conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex) {
                directlyConnectedProducers.add(conn.sourceNodeId);
              }
            });
            
            productData.producers.forEach(producer => {
              const producerNode = graph.nodes[producer.nodeId];
              if (!producerNode) return;
              
              // Only consider upstream nodes
              if (!upstreamNodes.has(producer.nodeId)) return;
              
              // Find increase suggestion for this product
              const suggestion = suggestions.find(s => 
                s.nodeId === producer.nodeId &&
                s.productId === productId &&
                s.handleType === 'output' &&
                s.adjustmentType === 'increase'
              );
              
              if (suggestion) {
                const metrics = calculateNodeMetrics(producerNode);
                const isMultiOutput = metrics && metrics.outputCount > 1;
                const isDirectlyConnected = directlyConnectedProducers.has(producer.nodeId);
                
                // Check if there are single-output alternatives
                const hasSingleOutputAlternative = productData.producers.some(p => {
                  const pNode = graph.nodes[p.nodeId];
                  if (!pNode || p.nodeId === producer.nodeId) return false;
                  const pMetrics = calculateNodeMetrics(pNode);
                  return pMetrics && pMetrics.outputCount === 1;
                });
                
                // Skip multi-output if single-output exists UNLESS it's directly connected
                if (isMultiOutput && hasSingleOutputAlternative && !isDirectlyConnected) return;
                
                possibleFixes.push({
                  nodeId: producer.nodeId,
                  suggestion,
                  metrics,
                  isMultiOutput,
                  isDirectlyConnected,
                  shortage
                });
              }
            });
            
            if (possibleFixes.length === 0) return;
            
            // Sort by priority: DIRECTLY CONNECTED FIRST, then single-output > multi-output, then by machine increase
            possibleFixes.sort((a, b) => {
              // Directly connected producers have absolute priority
              if (a.isDirectlyConnected !== b.isDirectlyConnected) {
                return a.isDirectlyConnected ? -1 : 1;
              }
              
              // Single-output first
              if (a.isMultiOutput !== b.isMultiOutput) {
                return a.isMultiOutput ? 1 : -1;
              }
              
              // Then by smallest machine increase
              const aMachineIncrease = a.suggestion.suggestedMachineCount - a.metrics.machineCount;
              const bMachineIncrease = b.suggestion.suggestedMachineCount - b.metrics.machineCount;
              if (Math.abs(aMachineIncrease - bMachineIncrease) > EPSILON) {
                return aMachineIncrease - bMachineIncrease;
              }
              
              // Then by power increase
              const aPowerIncrease = (a.suggestion.suggestedMachineCount - a.metrics.machineCount) * a.metrics.power / a.metrics.machineCount;
              const bPowerIncrease = (b.suggestion.suggestedMachineCount - b.metrics.machineCount) * b.metrics.power / b.metrics.machineCount;
              return aPowerIncrease - bPowerIncrease;
            });
            
            // Apply the best fix
            const bestFix = possibleFixes[0];
            const currentCount = currentNodes.find(n => n.id === bestFix.nodeId)?.data?.machineCount || 0;
            const suggestedCount = bestFix.suggestion.suggestedMachineCount;
            
            if (Math.abs(suggestedCount - currentCount) > EPSILON && suggestedCount > currentCount) {
              const existingUpdate = iterationUpdates.get(bestFix.nodeId);
              // Take the maximum if multiple inputs need this producer
              if (!existingUpdate || suggestedCount > existingUpdate) {
                iterationUpdates.set(bestFix.nodeId, suggestedCount);
                hasChanges = true;
              }
            }
          });
        }
      }
      
      // Also handle input shortages - but only for single-input consumers
      upstreamNodes.forEach(nodeId => {
        const node = graph.nodes[nodeId];
        if (!node) return;
        
        const inputSuggestions = suggestions.filter(s => {
          if (s.nodeId !== nodeId) return false;
          if (s.handleType !== 'input') return false;
          if (s.adjustmentType !== 'increase') return false;
          return true;
        });
        
        // Only process if this is the only consumer of the input products
        inputSuggestions.forEach(inputSuggestion => {
          const productId = inputSuggestion.productId;
          const productData = graph.products[productId];
          if (!productData) return;
          
          // Check if this node is the only consumer of this product in the upstream chain
          const upstreamConsumers = productData.consumers.filter(c => 
            upstreamNodes.has(c.nodeId) || c.nodeId === targetNodeId
          );
          
          if (upstreamConsumers.length === 1 && upstreamConsumers[0].nodeId === nodeId) {
            // This is the only consumer - safe to increase
            const connections = graph.products[productId]?.connections || [];
            
            connections.forEach(conn => {
              if (conn.targetNodeId === nodeId && upstreamNodes.has(conn.sourceNodeId)) {
                const producerId = conn.sourceNodeId;
                
                const producerSuggestions = suggestions.filter(s => 
                  s.nodeId === producerId && 
                  s.productId === productId &&
                  s.handleType === 'output' &&
                  s.adjustmentType === 'increase'
                );
                
                producerSuggestions.forEach(suggestion => {
                  const currentCount = currentNodes.find(n => n.id === producerId)?.data?.machineCount || 0;
                  const suggestedCount = suggestion.suggestedMachineCount;
                  
                  if (Math.abs(suggestedCount - currentCount) > EPSILON) {
                    const existingUpdate = iterationUpdates.get(producerId);
                    if (!existingUpdate || suggestedCount > existingUpdate) {
                      iterationUpdates.set(producerId, suggestedCount);
                      hasChanges = true;
                    }
                  }
                });
              }
            });
          }
        });
      });
    });
    
    // Apply updates for this iteration
    if (iterationUpdates.size > 0) {
      noChangeIterations = 0; // Reset counter when we make changes
      
      iterationUpdates.forEach((newCount, nodeId) => {
        const oldCount = currentNodes.find(n => n.id === nodeId)?.data?.machineCount || 0;
        const nodeName = graph.nodes[nodeId]?.recipe?.name || 'Unknown';
        
        iterationDebug.updates.push({
          nodeId,
          nodeName,
          oldCount,
          newCount
        });
        
        debugInfo.finalUpdates.set(nodeId, newCount);
      });
      
      // Update currentNodes for next iteration
      currentNodes = currentNodes.map(n => {
        const newCount = iterationUpdates.get(n.id);
        return newCount !== undefined
          ? { ...n, data: { ...n.data, machineCount: newCount } }
          : n;
      });
    } else {
      noChangeIterations++; // Increment if no changes this iteration
    }
    
    debugInfo.iterations.push(iterationDebug);
  }
  
  debugInfo.totalIterations = iteration;
  
  // Determine stop reason
  if (debugInfo.converged) {
    debugInfo.stoppedReason = 'converged';
  } else if (!hasChanges || noChangeIterations >= MAX_NO_CHANGE_ITERATIONS) {
    debugInfo.stoppedReason = 'no_changes';
  } else if (iteration >= MAX_ITERATIONS) {
    debugInfo.stoppedReason = 'max_iterations';
  } else {
    debugInfo.stoppedReason = 'unknown';
  }
  
  if (DEBUG_MODE) {
    console.log(`\n%c[Compute Complete] (${iteration} iterations)`, 'color: #4a9eff; font-weight: bold');
    console.log(`Nodes affected: ${debugInfo.finalUpdates.size}`);
    console.log(`Converged: ${debugInfo.converged}`);
    console.log(`Stopped reason: ${debugInfo.stoppedReason}`);
  }
  
  lastDebugInfo = debugInfo;
  
  return {
    success: debugInfo.finalUpdates.size > 0,
    updates: debugInfo.finalUpdates,
    converged: debugInfo.converged,
    iterations: iteration,
    debugInfo
  };
};