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
  
  // Count inputs (to determine if extractor/pure resource node)
  const inputCount = recipe.inputs?.length || 0;
  
  return { machineCount, power, pollution, outputCount, inputCount };
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
    graphTopology: {},
    beforeState: null,
    afterState: null
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
  
  // Capture before state
  const initialSolution = solveProductionNetwork(currentNodes, edges, { skipTemperature: true });
  debugInfo.beforeState = {
    excess: initialSolution.excess || [],
    deficiency: initialSolution.deficiency || []
  };
  
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
      
      // FIRST: Check if the target itself needs adjustment (has excess outputs or deficient inputs)
      const thisTargetNode = graph.nodes[targetNodeId];
      const thisTargetFlows = currentSolution.flows?.byNode[targetNodeId];
      
      if (thisTargetNode && thisTargetFlows) {
        // Check for excess outputs that should scale target DOWN
        let hasExcessOutputs = false;
        let maxOutputExcessRatio = 0;
        
        thisTargetNode.outputs.forEach((output, outputIndex) => {
          const outputFlow = thisTargetFlows.outputFlows[outputIndex];
          if (!outputFlow) return;
          
          const excess = outputFlow.produced - outputFlow.connected;
          if (excess > EPSILON && outputFlow.produced > EPSILON) {
            hasExcessOutputs = true;
            const excessRatio = excess / outputFlow.produced;
            maxOutputExcessRatio = Math.max(maxOutputExcessRatio, excessRatio);
          }
        });
        
        // If target has significant excess (>10% overproduction), scale it DOWN
        if (hasExcessOutputs && maxOutputExcessRatio > 0.1) {
          const currentCount = currentNodes.find(n => n.id === targetNodeId)?.data?.machineCount || 0;
          const scaleFactor = 1 - maxOutputExcessRatio;
          const newCount = currentCount * scaleFactor;
          
          if (newCount > EPSILON && Math.abs(newCount - currentCount) > EPSILON) {
            iterationUpdates.set(targetNodeId, newCount);
            hasChanges = true;
            
            // Skip processing this target's upstream - we adjusted the target itself
            return;
          }
        }
      }
      
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
      
      // Process each layer, starting from CLOSEST to target (distance 0 = target itself)
      const distances = Array.from(nodesByDistance.keys()).sort((a, b) => a - b);
      
      for (const distance of distances) {
        const nodesAtDistance = nodesByDistance.get(distance);
        
        // For each node at this distance, check for deficiencies
        for (const nodeId of nodesAtDistance) {
          const node = graph.nodes[nodeId];
          if (!node) continue;
          
          const nodeFlows = currentSolution.flows?.byNode[nodeId];
          if (!nodeFlows) continue;
          
          // Calculate supply ratio for each input (bottleneck detection)
          const inputSupplyRatios = node.inputs.map((input, idx) => {
            const inputFlow = nodeFlows.inputFlows[idx];
            if (!inputFlow || inputFlow.needed <= EPSILON) return 1.0;
            return inputFlow.connected / inputFlow.needed;
          });
          
          // Find bottleneck ratio (minimum supply ratio)
          const bottleneckRatio = Math.min(...inputSupplyRatios);
          
          // Only process inputs that are bottlenecks (within 1% of minimum ratio AND < 99% supplied)
          const bottleneckIndices = inputSupplyRatios
            .map((ratio, idx) => ({ ratio, idx }))
            .filter(item => item.ratio < 0.99 && item.ratio <= bottleneckRatio * 1.01)
            .map(item => item.idx);
          
          // Process each bottleneck input
          bottleneckIndices.forEach(inputIndex => {
            const input = node.inputs[inputIndex];
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
            
            // Collect all possible fixes - ONLY from directly connected producers
            const possibleFixes = [];
            
            // Check which producers are DIRECTLY connected to this consumer
            const directlyConnectedProducers = new Set();
            productData.connections.forEach(conn => {
              if (conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex) {
                directlyConnectedProducers.add(conn.sourceNodeId);
              }
            });
            
            // ONLY consider directly connected producers in the upstream chain
            productData.producers.forEach(producer => {
              const producerNode = graph.nodes[producer.nodeId];
              if (!producerNode) return;
              
              // Only consider nodes that are directly connected OR in upstream chain
              const isDirectlyConnected = directlyConnectedProducers.has(producer.nodeId);
              const isUpstream = upstreamNodes.has(producer.nodeId);
              
              if (!isDirectlyConnected && !isUpstream) return;
              
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
                
                // For multi-output nodes: analyze which outputs are primary vs byproducts
                let hasConstrainingOutputs = false;
                let isPrimaryOutput = false;
                let byproductScore = 0;
                let hasExtractorAlternative = false;
                
                // Check if this product has extractor alternatives (single-output, no-input producers)
                if (productData) {
                  hasExtractorAlternative = productData.producers.some(p => {
                    if (p.nodeId === producer.nodeId) return false; // Not itself
                    const pNode = graph.nodes[p.nodeId];
                    if (!pNode) return false;
                    const pMetrics = calculateNodeMetrics(pNode);
                    // Extractor: single output, no inputs
                    return pMetrics && pMetrics.outputCount === 1 && pMetrics.inputCount === 0;
                  });
                }
                
                if (isMultiOutput) {
                  const outputFlows = currentSolution.flows?.byNode[producer.nodeId]?.outputFlows || [];
                  const thisOutputIndex = producerNode.outputs.findIndex(o => o.productId === productId);
                  const thisOutput = producerNode.outputs[thisOutputIndex];
                  const thisOutputFlow = outputFlows[thisOutputIndex];
                  
                  if (thisOutput && thisOutputFlow) {
                    // Calculate relative demand for this output (how much is being consumed)
                    const thisConnectedRatio = thisOutputFlow.produced > EPSILON 
                      ? thisOutputFlow.connected / thisOutputFlow.produced 
                      : 0;
                    
                    // Check all OTHER outputs to identify primary vs byproduct
                    let maxOtherConnectedRatio = 0;
                    let hasOtherHighDemandOutput = false;
                    let otherOutputsWithoutExtractors = [];
                    
                    producerNode.outputs.forEach((output, idx) => {
                      if (output.productId === productId) return; // Skip the product we're analyzing
                      
                      const outputFlow = outputFlows[idx];
                      if (!outputFlow) return;
                      
                      const otherProductData = graph.products[output.productId];
                      if (otherProductData) {
                        // Check if this other product has connected consumers
                        const hasConnectedConsumers = otherProductData.connections.some(conn =>
                          conn.sourceNodeId === producer.nodeId
                        );
                        
                        if (hasConnectedConsumers) {
                          hasConstrainingOutputs = true;
                          
                          // Calculate relative demand for this other output
                          const otherConnectedRatio = outputFlow.produced > EPSILON
                            ? outputFlow.connected / outputFlow.produced
                            : 0;
                          
                          maxOtherConnectedRatio = Math.max(maxOtherConnectedRatio, otherConnectedRatio);
                          
                          // Check if this other output has extractor alternatives
                          const otherHasExtractor = otherProductData.producers.some(p => {
                            if (p.nodeId === producer.nodeId) return false;
                            const pNode = graph.nodes[p.nodeId];
                            if (!pNode) return false;
                            const pMetrics = calculateNodeMetrics(pNode);
                            return pMetrics && pMetrics.outputCount === 1 && pMetrics.inputCount === 0;
                          });
                          
                          if (!otherHasExtractor) {
                            otherOutputsWithoutExtractors.push(output.productId);
                          }
                          
                          // If other output has significantly higher demand, it's the primary
                          if (otherConnectedRatio > thisConnectedRatio + 0.2) {
                            hasOtherHighDemandOutput = true;
                          }
                        }
                      }
                    });
                    
                    // This output is primary if it has highest demand ratio
                    isPrimaryOutput = thisConnectedRatio >= maxOtherConnectedRatio - 0.1;
                    
                    // Byproduct score: high if this output has low relative demand compared to others
                    // Score from 0 (primary) to 1 (clear byproduct)
                    if (maxOtherConnectedRatio > EPSILON) {
                      byproductScore = Math.max(0, Math.min(1, 
                        (maxOtherConnectedRatio - thisConnectedRatio) / maxOtherConnectedRatio
                      ));
                    }
                    
                    // CRITICAL RULE: If this product has an extractor alternative AND
                    // there are other outputs WITHOUT extractor alternatives, SKIP this producer
                    // Let the extractor fill this gap while this producer focuses on other outputs
                    if (hasExtractorAlternative && otherOutputsWithoutExtractors.length > 0) {
                      return; // Don't scale for products with extractor alternatives
                    }
                    
                    // Secondary rule: If this is clearly a byproduct (other outputs have much higher demand), skip it
                    if (byproductScore > 0.5 && hasOtherHighDemandOutput) {
                      return; // Don't scale this producer for a byproduct
                    }
                  }
                }
                
                // Check if there are single-output alternatives that are also connected
                const hasSingleOutputAlternative = productData.producers.some(p => {
                  if (p.nodeId === producer.nodeId) return false;
                  const pNode = graph.nodes[p.nodeId];
                  if (!pNode) return false;
                  const pMetrics = calculateNodeMetrics(pNode);
                  const isSingleOutput = pMetrics && pMetrics.outputCount === 1;
                  const pIsConnected = directlyConnectedProducers.has(p.nodeId);
                  return isSingleOutput && (pIsConnected || upstreamNodes.has(p.nodeId));
                });
                
                // Skip multi-output if:
                // 1. It has constraining outputs AND this is not the primary output
                // 2. Single-output alternative exists
                // 3. Not directly connected
                if (isMultiOutput && hasConstrainingOutputs && !isPrimaryOutput && 
                    hasSingleOutputAlternative && !isDirectlyConnected) {
                  return;
                }
                
                possibleFixes.push({
                  nodeId: producer.nodeId,
                  suggestion,
                  metrics,
                  isMultiOutput,
                  isDirectlyConnected,
                  hasConstrainingOutputs,
                  isPrimaryOutput,
                  byproductScore,
                  hasExtractorAlternative,
                  shortage
                });
              }
            });
            
            if (possibleFixes.length === 0) return;
            
            // Sort by priority: use primary outputs, prefer constrained multi-output, minimize extractors
            possibleFixes.sort((a, b) => {
              // 1. Directly connected producers have absolute priority
              if (a.isDirectlyConnected !== b.isDirectlyConnected) {
                return a.isDirectlyConnected ? -1 : 1;
              }
              
              // 2. Nodes WITHOUT extractor alternatives for this product should be prioritized
              // (Force multi-output nodes to focus on products that can't be extracted)
              if (a.hasExtractorAlternative !== b.hasExtractorAlternative) {
                return a.hasExtractorAlternative ? 1 : -1; // No extractor = higher priority
              }
              
              // 3. Primary outputs of multi-output nodes FIRST (not byproducts)
              if (a.isPrimaryOutput !== b.isPrimaryOutput) {
                return a.isPrimaryOutput ? -1 : 1;
              }
              
              // 4. Lower byproduct score = higher priority (primary outputs over byproducts)
              const byproductDiff = (a.byproductScore || 0) - (b.byproductScore || 0);
              if (Math.abs(byproductDiff) > 0.1) {
                return byproductDiff; // Lower score (more primary) first
              }
              
              // 5. Among similar outputs: prefer those with inputs over pure extractors
              const aIsExtractor = a.metrics.inputCount === 0;
              const bIsExtractor = b.metrics.inputCount === 0;
              if (aIsExtractor !== bIsExtractor) {
                return aIsExtractor ? 1 : -1; // Non-extractors first
              }
              
              // 6. Single-output > unconstrained multi-output (for non-primary outputs)
              if (!a.hasConstrainingOutputs && !b.hasConstrainingOutputs) {
                if (a.isMultiOutput !== b.isMultiOutput) {
                  return a.isMultiOutput ? 1 : -1;
                }
              }
              
              // 7. Smallest machine increase
              const aMachineIncrease = a.suggestion.suggestedMachineCount - a.metrics.machineCount;
              const bMachineIncrease = b.suggestion.suggestedMachineCount - b.metrics.machineCount;
              if (Math.abs(aMachineIncrease - bMachineIncrease) > EPSILON) {
                return aMachineIncrease - bMachineIncrease;
              }
              
              // 8. Power increase
              const aPowerIncrease = (a.suggestion.suggestedMachineCount - a.metrics.machineCount) * a.metrics.power / Math.max(a.metrics.machineCount, EPSILON);
              const bPowerIncrease = (b.suggestion.suggestedMachineCount - b.metrics.machineCount) * b.metrics.power / Math.max(b.metrics.machineCount, EPSILON);
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
      
      // Handle input shortages with bottleneck awareness
      upstreamNodes.forEach(nodeId => {
        const node = graph.nodes[nodeId];
        if (!node) return;
        
        const nodeFlows = currentSolution.flows?.byNode[nodeId];
        if (!nodeFlows) return;
        
        // Calculate supply ratio for each input (what % of needed is supplied)
        const inputSupplyRatios = node.inputs.map((input, idx) => {
          const inputFlow = nodeFlows.inputFlows[idx];
          if (!inputFlow || inputFlow.needed <= EPSILON) return 1.0;
          return inputFlow.connected / inputFlow.needed;
        });
        
        // Find the bottleneck input (minimum supply ratio)
        const bottleneckRatio = Math.min(...inputSupplyRatios);
        const bottleneckIndices = inputSupplyRatios
          .map((ratio, idx) => ({ ratio, idx }))
          .filter(item => Math.abs(item.ratio - bottleneckRatio) < 0.01) // Within 1% of minimum
          .map(item => item.idx);
        
        // Only process suggestions for bottleneck inputs
        const inputSuggestions = suggestions.filter(s => {
          if (s.nodeId !== nodeId) return false;
          if (s.handleType !== 'input') return false;
          if (s.adjustmentType !== 'increase') return false;
          // Only if this input is a bottleneck
          return bottleneckIndices.includes(s.handleIndex);
        });
        
        // For each bottleneck input, try to increase its producers
        inputSuggestions.forEach(inputSuggestion => {
          const productId = inputSuggestion.productId;
          const productData = graph.products[productId];
          if (!productData) return;
          
          // Find all producers of this bottleneck product
          const connections = productData.connections.filter(conn => 
            conn.targetNodeId === nodeId && 
            conn.targetInputIndex === inputSuggestion.handleIndex
          );
          
          connections.forEach(conn => {
            if (!upstreamNodes.has(conn.sourceNodeId)) return;
            
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
              
              if (Math.abs(suggestedCount - currentCount) > EPSILON && suggestedCount > currentCount) {
                const existingUpdate = iterationUpdates.get(producerId);
                if (!existingUpdate || suggestedCount > existingUpdate) {
                  iterationUpdates.set(producerId, suggestedCount);
                  hasChanges = true;
                }
              }
            });
          });
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
  
  // FINAL PASS: Trim excess from single-output nodes (extractors and simple producers)
  if (!debugInfo.converged && iteration < MAX_ITERATIONS) {
    const finalGraph = buildProductionGraph(currentNodes, edges);
    const finalSolution = solveProductionNetwork(currentNodes, edges, { skipTemperature: true });
    const finalSuggestions = finalSolution.suggestions || [];
    
    if (finalSuggestions.length > 0) {
      const finalIterationDebug = {
        iteration: iteration + 1,
        updates: [],
        suggestions: finalSuggestions.length,
        isFinalCleanup: true
      };
      
      const finalUpdates = new Map();
      
      // Collect all single-output nodes with decrease suggestions (excess producers)
      const singleOutputNodesToTrim = [];
      
      finalSuggestions.forEach(suggestion => {
        if (suggestion.handleType !== 'output' || suggestion.adjustmentType !== 'decrease') return;
        
        const node = finalGraph.nodes[suggestion.nodeId];
        if (!node) return;
        
        const metrics = calculateNodeMetrics(node);
        if (!metrics || metrics.outputCount !== 1) return;
        
        // Check if it's a pure extractor (no inputs)
        const isPureExtractor = metrics.inputCount === 0;
        
        singleOutputNodesToTrim.push({
          suggestion,
          nodeId: suggestion.nodeId,
          isPureExtractor,
          metrics,
          nodeName: node.recipe?.name || 'Unknown'
        });
      });
      
      // Sort: pure extractors first (they're easiest to trim), then other single-output nodes
      singleOutputNodesToTrim.sort((a, b) => {
        if (a.isPureExtractor !== b.isPureExtractor) {
          return a.isPureExtractor ? -1 : 1;
        }
        
        // Among same type, prefer larger reductions (more excess to trim)
        const aReduction = a.metrics.machineCount - a.suggestion.suggestedMachineCount;
        const bReduction = b.metrics.machineCount - b.suggestion.suggestedMachineCount;
        return bReduction - aReduction;
      });
      
      // Apply all single-output trim suggestions
      singleOutputNodesToTrim.forEach(producer => {
        const currentCount = currentNodes.find(n => n.id === producer.nodeId)?.data?.machineCount || 0;
        const suggestedCount = producer.suggestion.suggestedMachineCount;
        
        if (Math.abs(suggestedCount - currentCount) > EPSILON && suggestedCount < currentCount && suggestedCount > EPSILON) {
          finalUpdates.set(producer.nodeId, suggestedCount);
          
          finalIterationDebug.updates.push({
            nodeId: producer.nodeId,
            nodeName: producer.nodeName,
            oldCount: currentCount,
            newCount: suggestedCount,
            isPureExtractor: producer.isPureExtractor,
            trimmedExcess: currentCount - suggestedCount
          });
          
          debugInfo.finalUpdates.set(producer.nodeId, suggestedCount);
        }
      });
      
      // Apply final updates if any
      if (finalUpdates.size > 0) {
        currentNodes = currentNodes.map(n => {
          const newCount = finalUpdates.get(n.id);
          return newCount !== undefined
            ? { ...n, data: { ...n.data, machineCount: newCount } }
            : n;
        });
        
        debugInfo.iterations.push(finalIterationDebug);
        debugInfo.totalIterations = iteration + 1;
        
        // Check if we've converged after final cleanup
        const finalCheckGraph = buildProductionGraph(currentNodes, edges);
        const finalCheckSolution = solveProductionNetwork(currentNodes, edges, { skipTemperature: true });
        
        if (!finalCheckSolution.suggestions || finalCheckSolution.suggestions.length === 0) {
          debugInfo.converged = true;
        }
      }
    }
  }
  
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
  
  // Capture after state
  const finalNodes = currentNodes;
  const finalSolution = solveProductionNetwork(finalNodes, edges, { skipTemperature: true });
  debugInfo.afterState = {
    excess: finalSolution.excess || [],
    deficiency: finalSolution.deficiency || []
  };
  
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