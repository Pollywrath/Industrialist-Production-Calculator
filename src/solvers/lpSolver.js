/**
 * Linear Programming Solver for Production Networks
 * Automatically adjusts machine counts to balance production for target recipes
 */

import solver from 'javascript-lp-solver';
import { getMachine } from '../data/dataLoader';
import { buildProductionGraph } from './graphBuilder';

const EPSILON = 1e-8;

// Objective weights (in strict priority order)
// Priority tiers (each tier dominates all lower tiers):
// Tier 1 (Critical): Deficiency count and amounts - MUST be zero
// Tier 2 (Important): Model count, excess counts and amounts - should be minimized
// Tier 3 (Optional): Pollution, power, cost - nice to minimize but low priority

// Tier 1: Deficiency (must dominate everything)
const DEFICIENCY_COUNT_WEIGHT = 1e15;      // 1 quadrillion - count of deficient inputs (range: 1-3)
const DEFICIENCY_AMOUNT_WEIGHT = 1e12;     // 1 trillion - amount of each deficiency (range: varies widely)

// Tier 2: Model count and excess (should dominate tier 3)
const MODEL_COUNT_WEIGHT = 1e9;            // 1 billion - model count per machine (range: 3-20, uses ceiling)
const CONNECTED_EXCESS_COUNT_WEIGHT = 1e6; // 1 million - count of connected excess outputs (range: 1-3)
const CONNECTED_EXCESS_AMOUNT_WEIGHT = 1e3;// 1 thousand - amount of connected excess (range: varies)
const UNCONNECTED_EXCESS_COUNT_WEIGHT = 1e5;// 100 thousand - count of unconnected excess (range: 1-3)
const UNCONNECTED_EXCESS_AMOUNT_WEIGHT = 1e2;// 100 - amount of unconnected excess (range: varies)

// Tier 3: Resource optimization (lowest priority)
const POLLUTION_WEIGHT = 10;               // 10 - pollution per machine (range: 0.01-0.4, scales with machine count)
const POWER_WEIGHT = 0.00001;              // 0.00001 - power per machine (range: 150-20M, scales with machine count)
const COST_WEIGHT = 0.000001;              // 0.000001 - cost per machine (range: 80-200M, but mostly 1k-250k)

/**
 * Build LP model for entire production graph
 */
const buildFullGraphModel = (graph, targetNodeIds = new Set()) => {
  const model = {
    optimize: 'total_cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {}
  };
  
  // Create variables for each node's machine count
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = `m_${nodeId}`;
    const currentCount = node.machineCount || 0;
    
    // Calculate machine contribution to objective
    let cycleTime = node.cycleTime;
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
    
    const power = node.recipe.power_consumption;
    let powerValue = 0;
    if (typeof power === 'number') {
      powerValue = power;
    } else if (typeof power === 'object' && power !== null && 'max' in power) {
      powerValue = power.max;
    }
    
    const pollution = node.recipe.pollution;
    const pollutionValue = typeof pollution === 'number' ? pollution : 0;
    
    // Get machine cost
    const machine = getMachine(node.recipe.machine_id);
    const machineCost = machine && typeof machine.cost === 'number' ? machine.cost : 0;
    
    // Calculate input/output count for model count
    const inputOutputCount = (node.recipe.inputs?.length || 0) + (node.recipe.outputs?.length || 0);
    const powerFactor = Math.ceil(powerValue / 1500000) * 2;
    const inputOutputFactor = inputOutputCount * 2;
    const modelCountPerMachine = 1 + powerFactor + inputOutputFactor;
    
    // Weighted contribution to objective
    model.variables[varName] = {
      total_cost: (MODEL_COUNT_WEIGHT * modelCountPerMachine) + 
                  (POWER_WEIGHT * powerValue) + 
                  (POLLUTION_WEIGHT * pollutionValue) + 
                  (COST_WEIGHT * machineCost)
    };
    
    // Add non-negativity constraint (allow 0, but not negative)
    const nonNegConstraintName = `nonneg_${nodeId}`;
    model.constraints[nonNegConstraintName] = { min: 0 };
    model.variables[varName][nonNegConstraintName] = 1;
    
    // Target nodes will have their excess amounts constrained, not machine counts
    // Machine counts can vary to meet downstream demand while maintaining target excess
  });
  
  // Create flow variables for each connection
  graph.connections.forEach(conn => {
    const flowVar = `f_${conn.id}`;
    
    model.variables[flowVar] = {
      total_cost: 0
    };
    
    // Add explicit non-negativity constraint for flow
    const flowNonNegConstraintName = `flow_nonneg_${conn.id}`;
    model.constraints[flowNonNegConstraintName] = { min: 0 };
    model.variables[flowVar][flowNonNegConstraintName] = 1;
  });
  
  // Create excess indicator variables (binary) to count number of outputs with excess
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    node.outputs.forEach((output, outputIndex) => {
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      
      // Determine if this is connected or unconnected to set appropriate count weight
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      const hasConnections = outgoingConnections.length > 0;
      const excessCountWeight = hasConnections ? CONNECTED_EXCESS_COUNT_WEIGHT : UNCONNECTED_EXCESS_COUNT_WEIGHT;
      
      model.variables[excessIndicatorVar] = {
        total_cost: excessCountWeight
      };
      model.ints[excessIndicatorVar] = 1;
      
      // Add constraint to make indicator binary (0 <= indicator <= 1)
      const binaryConstraintName = `binary_${nodeId}_${outputIndex}`;
      model.constraints[binaryConstraintName] = { min: 0, max: 1 };
      model.variables[excessIndicatorVar][binaryConstraintName] = 1;
    });
  });
  
  // Flow conservation constraints for each node
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const isTargetNode = targetNodeIds.has(nodeId);
    
    // For each output handle, create flow conservation constraint with excess slack
    node.outputs.forEach((output, outputIndex) => {
      const constraintName = `flow_out_${nodeId}_${outputIndex}`;
      const slackVar = `excess_${nodeId}_${outputIndex}`;
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      
      // Find all connections from this output
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      
      // Determine if this is connected or unconnected excess
      const hasConnections = outgoingConnections.length > 0;
      const excessAmountWeight = hasConnections ? CONNECTED_EXCESS_AMOUNT_WEIGHT : UNCONNECTED_EXCESS_AMOUNT_WEIGHT;
      
      // Create excess amount slack variable (penalized by amount based on connection status)
      // For target nodes, use a very small weight to allow excess to vary minimally
      const actualExcessWeight = isTargetNode ? 1 : excessAmountWeight;
      model.variables[slackVar] = {
        total_cost: actualExcessWeight,
        [constraintName]: -1
      };
      
      // Link slack to indicator
      const linkConstraintName = `link_excess_${nodeId}_${outputIndex}`;
      model.constraints[linkConstraintName] = { max: 0 };
      
      // Get machine count variable
      const machineVar = `m_${nodeId}`;
      
      // Calculate production rate per machine
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      // M = maximum possible production
      const M = ratePerMachine * 10000;
      
      // Constraint: excess - M * indicator <= 0
      model.variables[slackVar][linkConstraintName] = 1;
      model.variables[excessIndicatorVar][linkConstraintName] = -M;
      
      // Constraint: production_capacity = outgoing_flows + excess_slack
      model.constraints[constraintName] = { equal: 0 };
      
      // Add production capacity term (positive)
      if (!model.variables[machineVar][constraintName]) {
        model.variables[machineVar][constraintName] = 0;
      }
      model.variables[machineVar][constraintName] += ratePerMachine;
      
      // Add outgoing flow terms (negative)
      outgoingConnections.forEach(conn => {
        const flowVar = `f_${conn.id}`;
        if (!model.variables[flowVar][constraintName]) {
          model.variables[flowVar][constraintName] = 0;
        }
        model.variables[flowVar][constraintName] -= 1;
      });
    });
    
    // For each input handle, create flow conservation constraint with deficiency slack
    node.inputs.forEach((input, inputIndex) => {
      // Find all connections to this input
      const incomingConnections = graph.connections.filter(
        c => c.targetNodeId === nodeId && c.targetInputIndex === inputIndex
      );
      
      // Skip unconnected inputs - they don't need to be satisfied
      if (incomingConnections.length === 0) {
        return;
      }
      
      const constraintName = `flow_in_${nodeId}_${inputIndex}`;
      const slackVar = `deficit_${nodeId}_${inputIndex}`;
      
      // Get machine count variable
      const machineVar = `m_${nodeId}`;
      
      // Calculate consumption rate per machine
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      // Create deficiency amount slack variable (heavily penalized by amount)
      model.variables[slackVar] = {
        total_cost: DEFICIENCY_AMOUNT_WEIGHT,
        [constraintName]: 1
      };
      
      // Create deficiency count indicator (binary variable, even more heavily penalized)
      const deficitIndicatorVar = `deficit_indicator_${nodeId}_${inputIndex}`;
      model.variables[deficitIndicatorVar] = {
        total_cost: DEFICIENCY_COUNT_WEIGHT
      };
      model.ints[deficitIndicatorVar] = 1;
      
      // Binary constraint: 0 <= indicator <= 1
      const deficitBinaryConstraintName = `deficit_binary_${nodeId}_${inputIndex}`;
      model.constraints[deficitBinaryConstraintName] = { min: 0, max: 1 };
      model.variables[deficitIndicatorVar][deficitBinaryConstraintName] = 1;
      
      // Link deficit to indicator
      const deficitLinkConstraintName = `deficit_link_${nodeId}_${inputIndex}`;
      model.constraints[deficitLinkConstraintName] = { max: 0 };
      
      // Calculate M = maximum possible deficit
      const M_deficit = ratePerMachine * 10000;
      
      // Constraint: deficit - M * indicator <= 0
      model.variables[slackVar][deficitLinkConstraintName] = 1;
      model.variables[deficitIndicatorVar][deficitLinkConstraintName] = -M_deficit;
      
      // Constraint: incoming_flows + deficiency_slack >= consumption_demand
      model.constraints[constraintName] = { min: 0 };
      
      // Add incoming flow terms (positive)
      incomingConnections.forEach(conn => {
        const flowVar = `f_${conn.id}`;
        if (!model.variables[flowVar][constraintName]) {
          model.variables[flowVar][constraintName] = 0;
        }
        model.variables[flowVar][constraintName] += 1;
      });
      
      // Add consumption demand term (negative)
      if (!model.variables[machineVar][constraintName]) {
        model.variables[machineVar][constraintName] = 0;
      }
      model.variables[machineVar][constraintName] -= ratePerMachine;

      // Add MAXIMUM flow constraint: flow cannot exceed consumption capacity
      const maxFlowConstraintName = `max_flow_in_${nodeId}_${inputIndex}`;
      model.constraints[maxFlowConstraintName] = { max: 0 };
      
      // flow - consumption_capacity <= 0
      incomingConnections.forEach(conn => {
        const flowVar = `f_${conn.id}`;
        if (!model.variables[flowVar][maxFlowConstraintName]) {
          model.variables[flowVar][maxFlowConstraintName] = 0;
        }
        model.variables[flowVar][maxFlowConstraintName] += 1;
      });
      
      // Add consumption capacity (negative, so flow can't exceed it)
      model.variables[machineVar][maxFlowConstraintName] = -ratePerMachine;
    });
  });
  
  // Add minimum excess constraints for target nodes
  targetNodeIds.forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;
    
    // Calculate current excess for each output
    node.outputs.forEach((output, outputIndex) => {
      const machineVar = `m_${nodeId}`;
      const slackVar = `excess_${nodeId}_${outputIndex}`;
      
      // Find all connections from this output
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      
      // Calculate current excess amount
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      const currentProduction = ratePerMachine * (node.machineCount || 0);
      
      // Calculate current connected flow
      let currentConnectedFlow = 0;
      outgoingConnections.forEach(conn => {
        const targetNode = graph.nodes[conn.targetNodeId];
        if (!targetNode) return;
        
        const targetInput = targetNode.inputs[conn.targetInputIndex];
        if (!targetInput) return;
        
        let targetCycleTime = targetNode.cycleTime;
        if (typeof targetCycleTime !== 'number' || targetCycleTime <= 0) targetCycleTime = 1;
        
        const targetQuantity = targetInput.quantity;
        if (typeof targetQuantity !== 'number') return;
        
        const targetRatePerMachine = targetNode.isMineshaftDrill ? targetQuantity : targetQuantity / targetCycleTime;
        const targetDemand = targetRatePerMachine * (targetNode.machineCount || 0);
        
        currentConnectedFlow += Math.min(currentProduction - currentConnectedFlow, targetDemand);
      });
      
      const currentExcess = Math.max(0, currentProduction - currentConnectedFlow);
      
      // Add constraint: excess must be >= current excess
      // This allows the excess to increase but not decrease below target
      const minExcessConstraintName = `min_excess_${nodeId}_${outputIndex}`;
      model.constraints[minExcessConstraintName] = { min: currentExcess };
      model.variables[slackVar][minExcessConstraintName] = 1;
    });
  });
  
  return model;
};

/**
 * Detect unsustainable loops using Tarjan's algorithm for strongly connected components
 */
const detectUnsustainableLoops = (graph) => {
  const nodeIds = Object.keys(graph.nodes);
  const nodeIndex = new Map();
  nodeIds.forEach((id, idx) => nodeIndex.set(id, idx));
  
  const n = nodeIds.length;
  const index = new Int32Array(n).fill(-1);
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack = [];
  let indexCounter = 0;
  const sccs = [];
  
  const strongConnect = (v) => {
    index[v] = indexCounter;
    lowlink[v] = indexCounter;
    indexCounter++;
    stack.push(v);
    onStack[v] = 1;
    
    const nodeId = nodeIds[v];
    const node = graph.nodes[nodeId];
    
    // Check all outputs and their consumers
    node.outputs.forEach(output => {
      const productData = graph.products[output.productId];
      if (!productData) return;
      
      productData.connections.forEach(conn => {
        if (conn.sourceNodeId !== nodeId) return;
        
        const wIndex = nodeIndex.get(conn.targetNodeId);
        if (wIndex === undefined) return;
        
        if (index[wIndex] === -1) {
          strongConnect(wIndex);
          lowlink[v] = Math.min(lowlink[v], lowlink[wIndex]);
        } else if (onStack[wIndex]) {
          lowlink[v] = Math.min(lowlink[v], index[wIndex]);
        }
      });
    });
    
    if (lowlink[v] === index[v]) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = 0;
        scc.push(nodeIds[w]);
      } while (w !== v);
      
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  };
  
  for (let v = 0; v < n; v++) {
    if (index[v] === -1) {
      strongConnect(v);
    }
  }
  
  // Check if any SCC is unsustainable
  const unsustainableLoops = [];
  
  sccs.forEach(scc => {
    const sccSet = new Set(scc);
    
    // Find products that are BOTH produced AND consumed within the loop AND have actual connections
    const loopDependentProducts = new Set();
    
    // Check all connections within the loop
    graph.connections.forEach(conn => {
      const sourceInLoop = sccSet.has(conn.sourceNodeId);
      const targetInLoop = sccSet.has(conn.targetNodeId);
      
      // Only consider connections that are entirely within the loop
      if (sourceInLoop && targetInLoop) {
        const productId = conn.productId;
        loopDependentProducts.add(productId);
      }
    });
    
    // If no loop-dependent products, this cycle is fine
    if (loopDependentProducts.size === 0) {
      return;
    }
    
    // Check if loop has external input sources for ANY loop-dependent product
    // An external source means there's an actual CONNECTION from outside the loop into the loop
    let hasExternalSource = false;
    
    for (const productId of loopDependentProducts) {
      // Check if there are connections bringing this product from outside into the loop
      const hasExternalConnection = graph.connections.some(conn => {
        // Must be the right product
        if (conn.productId !== productId) return false;
        
        // Source must be outside loop, target must be inside loop
        const sourceOutside = !sccSet.has(conn.sourceNodeId);
        const targetInside = sccSet.has(conn.targetNodeId);
        
        return sourceOutside && targetInside;
      });
      
      if (hasExternalConnection) {
        hasExternalSource = true;
        break;
      }
    }
    
    // If the loop has an external source for at least one loop-dependent product, it's sustainable
    if (hasExternalSource) {
      return;
    }
    
    // No external sources - check if loop can be self-sustaining
    let canSelfSustain = true;
    const problematicProducts = [];
    
    for (const productId of loopDependentProducts) {
      // Check if any node in the loop can net-produce this product
      let hasNetProducer = false;
      
      for (const nodeId of scc) {
        const node = graph.nodes[nodeId];
        
        // Calculate per-machine rates
        let cycleTime = node.cycleTime;
        if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
        
        const isMineshaftDrill = node.isMineshaftDrill || node.recipe?.isMineshaftDrill;
        
        // Production rate per machine
        let productionPerMachine = 0;
        node.outputs.forEach(output => {
          if (output.productId === productId) {
            const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
            if (typeof quantity === 'number') {
              productionPerMachine += isMineshaftDrill ? quantity : quantity / cycleTime;
            }
          }
        });
        
        // Consumption rate per machine
        let consumptionPerMachine = 0;
        node.inputs.forEach(input => {
          if (input.productId === productId) {
            if (typeof input.quantity === 'number') {
              consumptionPerMachine += isMineshaftDrill ? input.quantity : input.quantity / cycleTime;
            }
          }
        });
        
        // If this node net-produces (or is neutral), the product can be sustained
        if (productionPerMachine >= consumptionPerMachine - 1e-10) {
          hasNetProducer = true;
          break;
        }
      }
      
      if (!hasNetProducer) {
        canSelfSustain = false;
        problematicProducts.push(productId);
      }
    }
    
    if (!canSelfSustain) {
      unsustainableLoops.push({
        nodes: scc,
        nodeNames: scc.map(id => graph.nodes[id]?.recipe?.name || id),
        problematicProducts
      });
    }
  });
  
  // Check for self-feeding nodes (not already in multi-node SCCs)
  const nodesInSCCs = new Set();
  sccs.forEach(scc => scc.forEach(nodeId => nodesInSCCs.add(nodeId)));
  
  nodeIds.forEach(nodeId => {
    // Skip if already part of a multi-node cycle
    if (nodesInSCCs.has(nodeId)) return;
    
    const node = graph.nodes[nodeId];
    if (!node) return;
    
    // Check if this node feeds itself via actual connections
    const selfFedProducts = new Map();
    
    // Find all self-feeding connections
    graph.connections.forEach(conn => {
      if (conn.sourceNodeId === nodeId && conn.targetNodeId === nodeId) {
        const productId = conn.productId;
        const sourceOutput = node.outputs[conn.sourceOutputIndex];
        const targetInput = node.inputs[conn.targetInputIndex];
        
        if (sourceOutput && targetInput && sourceOutput.productId === productId && targetInput.productId === productId) {
          selfFedProducts.set(productId, {
            inputRate: targetInput.rate,
            outputRate: sourceOutput.rate
          });
        }
      }
    });
    
    if (selfFedProducts.size > 0) {
      let isUnsustainable = false;
      
      for (const [productId, rates] of selfFedProducts) {
        const productData = graph.products[productId];
        const EPSILON = 1e-10;
        
        // If output > input: Always sustainable
        if (rates.outputRate > rates.inputRate + EPSILON) {
          continue;
        }
        
        // If output < input: Need external sources
        if (rates.outputRate < rates.inputRate - EPSILON) {
          const hasExternalProducer = productData.producers.some(
            producer => producer.nodeId !== nodeId
          );
          
          if (!hasExternalProducer) {
            isUnsustainable = true;
            break;
          }
          continue;
        }
        
        // If output == input (net neutral)
        if (Math.abs(rates.outputRate - rates.inputRate) < EPSILON) {
          const hasOtherConsumers = productData.consumers.some(
            consumer => consumer.nodeId !== nodeId
          );
          
          const hasOtherProducers = productData.producers.some(
            producer => producer.nodeId !== nodeId
          );
          
          // No other demand or suppliers: Sustainable
          if (!hasOtherConsumers && !hasOtherProducers) {
            continue;
          }
          
          // There are demands but no additional suppliers: Unsustainable
          if (hasOtherConsumers && !hasOtherProducers) {
            isUnsustainable = true;
            break;
          }
          
          // There's an extra supplier: Sustainable
          if (hasOtherProducers) {
            continue;
          }
        }
      }
      
      if (isUnsustainable) {
        unsustainableLoops.push({
          nodes: [nodeId],
          nodeNames: [node.recipe?.name || nodeId],
          isSelfFeeding: true
        });
      }
    }
  });
  
  return unsustainableLoops;
};

/**
 * Solve the full graph LP model
 */
const solveFullGraph = (graph, targetNodeIds = new Set()) => {
  // Check for unsustainable loops BEFORE solving
  const unsustainableLoops = detectUnsustainableLoops(graph);
  
  if (unsustainableLoops.length > 0) {
    return {
      feasible: false,
      unsustainableLoops,
      message: 'Unsustainable loops detected - these machines depend on each other with no external input source'
    };
  }
  
  const model = buildFullGraphModel(graph, targetNodeIds);
  const result = solver.Solve(model);
  
  if (result.feasible) {
    console.log('%c[LP Solver] Solution Found', 'color: #2ecc71; font-weight: bold');
    
    // Calculate actual objective value manually
    let actualCost = 0;
    let deficiencyCountCost = 0;
    let deficiencyAmountCost = 0;
    let excessCountCost = 0;
    let excessAmountCost = 0;
    let modelCountCost = 0;
    let powerCost = 0;
    let pollutionCost = 0;
    let machineCost = 0;
    
    let totalDeficitCount = 0;
    let totalDeficitAmount = 0;
    let totalExcessCount = 0;
    let totalConnectedExcess = 0;
    let totalUnconnectedExcess = 0;
    let totalModelCount = 0;
    let totalPower = 0;
    let totalPollution = 0;
    let totalMachineCost = 0;
    
    Object.keys(result).forEach(key => {
      if (key.startsWith('deficit_indicator_')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          totalDeficitCount += value;
          deficiencyCountCost += value * DEFICIENCY_COUNT_WEIGHT;
        }
      }
      if (key.startsWith('deficit_') && !key.includes('indicator')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          totalDeficitAmount += value;
          deficiencyAmountCost += value * DEFICIENCY_AMOUNT_WEIGHT;
        }
      }
      if (key.startsWith('excess_indicator_')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          const parts = key.split('_');
          const nodeId = parts.slice(2, -1).join('_');
          const outputIndex = parseInt(parts[parts.length - 1]);
          
          const hasConnections = graph.connections.some(
            c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
          );
          
          const countWeight = hasConnections ? CONNECTED_EXCESS_COUNT_WEIGHT : UNCONNECTED_EXCESS_COUNT_WEIGHT;
          
          totalExcessCount += value;
          excessCountCost += value * countWeight;
        }
      }
      if (key.startsWith('excess_') && !key.includes('indicator')) {
        const value = result[key] || 0;
        
        if (value > EPSILON) {
          const parts = key.split('_');
          const nodeId = parts.slice(1, -1).join('_');
          const outputIndex = parseInt(parts[parts.length - 1]);
          
          const hasConnections = graph.connections.some(
            c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
          );
          
          const weight = hasConnections ? CONNECTED_EXCESS_AMOUNT_WEIGHT : UNCONNECTED_EXCESS_AMOUNT_WEIGHT;
          
          if (hasConnections) {
            totalConnectedExcess += value;
          } else {
            totalUnconnectedExcess += value;
          }
          
          excessAmountCost += value * weight;
        }
      }
      if (key.startsWith('m_')) {
        const nodeId = key.substring(2);
        const node = graph.nodes[nodeId];
        const value = result[key] || 0;
        
        let cycleTime = node.cycleTime;
        if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
        
        const power = node.recipe.power_consumption;
        let powerValue = 0;
        if (typeof power === 'number') {
          powerValue = power;
        } else if (typeof power === 'object' && power !== null && 'max' in power) {
          powerValue = power.max;
        }
        
        const pollution = node.recipe.pollution;
        const pollutionValue = typeof pollution === 'number' ? pollution : 0;
        
        const machine = getMachine(node.recipe.machine_id);
        const machineCostValue = machine && typeof machine.cost === 'number' ? machine.cost : 0;
        
        const inputOutputCount = (node.recipe.inputs?.length || 0) + (node.recipe.outputs?.length || 0);
        const powerFactor = Math.ceil(powerValue / 1500000) * 2;
        const inputOutputFactor = inputOutputCount * 2;
        const modelCountPerMachine = 1 + powerFactor + inputOutputFactor;
        
        const roundedMachineCount = Math.ceil(value);
        const nodeModelCount = roundedMachineCount * modelCountPerMachine;
        const nodePower = value * powerValue;
        const nodePollution = value * pollutionValue;
        const nodeMachineCost = roundedMachineCount * machineCostValue;
        
        totalModelCount += nodeModelCount;
        totalPower += nodePower;
        totalPollution += nodePollution;
        totalMachineCost += nodeMachineCost;
        
        modelCountCost += nodeModelCount * MODEL_COUNT_WEIGHT;
        powerCost += nodePower * POWER_WEIGHT;
        pollutionCost += nodePollution * POLLUTION_WEIGHT;
        machineCost += nodeMachineCost * COST_WEIGHT;
      }
    });
    
    actualCost = deficiencyCountCost + deficiencyAmountCost + excessCountCost + excessAmountCost + modelCountCost + powerCost + pollutionCost + machineCost;
    
    // Cost breakdown
    console.log('  Cost Breakdown:');
    console.log(`    Deficiency count: ${totalDeficitCount} inputs (cost: ${deficiencyCountCost.toExponential(2)})`);
    console.log(`    Deficiency amount: ${totalDeficitAmount.toFixed(4)} (cost: ${deficiencyAmountCost.toExponential(2)})`);
    console.log(`    Excess count: ${totalExcessCount} outputs (cost: ${excessCountCost.toExponential(2)})`);
    console.log(`    Connected excess: ${totalConnectedExcess.toFixed(4)} (cost: ${(totalConnectedExcess * CONNECTED_EXCESS_AMOUNT_WEIGHT).toExponential(2)})`);
    console.log(`    Unconnected excess: ${totalUnconnectedExcess.toFixed(4)} (cost: ${(totalUnconnectedExcess * UNCONNECTED_EXCESS_AMOUNT_WEIGHT).toExponential(2)})`);
    console.log(`    Model count: ${totalModelCount.toFixed(0)} (cost: ${modelCountCost.toExponential(2)})`);
    console.log(`    Power: ${totalPower.toFixed(0)} W (cost: ${powerCost.toFixed(2)})`);
    console.log(`    Pollution: ${totalPollution.toFixed(2)} %/hr (cost: ${pollutionCost.toFixed(2)})`);
    console.log(`    Machine cost: $${totalMachineCost.toFixed(0)} (cost: ${machineCost.toFixed(2)})`);
    console.log(`    Total: ${actualCost.toExponential(2)}`);
    
    // Show changed machine counts only
    console.log('  Machine Count Changes:');
    let changesFound = false;
    Object.keys(graph.nodes).forEach(nodeId => {
      const node = graph.nodes[nodeId];
      const varName = `m_${nodeId}`;
      const newValue = result[varName] || 0;
      const oldValue = node.machineCount || 0;
      const changed = Math.abs(newValue - oldValue) > EPSILON;
      if (changed) {
        changesFound = true;
        console.log(`    ${node?.recipe?.name || nodeId}: ${oldValue.toFixed(4)} → ${newValue.toFixed(4)}`);
      }
    });
    if (!changesFound) {
      console.log('    No changes needed');
    }
  } else {
    console.log('%c[LP Solver] No feasible solution', 'color: #e74c3c; font-weight: bold');
  }
  
  return result;
};

/**
 * Extract machine count updates from LP solution
 */
const extractMachineUpdates = (lpResult, graph) => {
  const updates = new Map();
  
  if (!lpResult.feasible || lpResult.unsustainableLoops) {
    return updates;
  }
  
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = `m_${nodeId}`;
    const newCount = lpResult[varName] !== undefined ? lpResult[varName] : 0;
    const currentCount = node.machineCount || 0;
    
    if (newCount >= -EPSILON) {
      const finalCount = Math.max(0, newCount);
      
      if (Math.abs(finalCount - currentCount) > EPSILON) {
        updates.set(nodeId, finalCount);
      }
    }
  });
  
  return updates;
};

/**
 * Main compute function - adjusts machine counts to balance production
 */
export const computeMachines = (nodes, edges, targetProducts) => {
  if (targetProducts.length === 0) {
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: 'No target recipes selected'
    };
  }

  // Build graph
  const graph = buildProductionGraph(nodes, edges);
  const targetNodeIds = new Set(targetProducts.map(t => t.recipeBoxId));
  
  // Solve with LP
  const lpResult = solveFullGraph(graph, targetNodeIds);
  
  if (!lpResult.feasible) {
    if (lpResult.unsustainableLoops) {
      const loopDescriptions = lpResult.unsustainableLoops.map(loop => 
        loop.nodeNames.join(' → ')
      ).join('\n  ');
      
      return {
        success: false,
        updates: new Map(),
        converged: false,
        iterations: 0,
        message: `Unsustainable loops detected:\n  ${loopDescriptions}\n\nThese machines form cycles with no external input source.`
      };
    }
    
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: 'No feasible solution found (infeasible constraints)'
    };
  }
  
  // Check for deficiency in solution
  let hasDeficiency = false;
  const deficientNodes = [];
  
  Object.keys(lpResult).forEach(key => {
    if (key.startsWith('deficit_') && !key.includes('indicator')) {
      const deficitAmount = lpResult[key] || 0;
      if (deficitAmount > EPSILON) {
        hasDeficiency = true;
        const parts = key.split('_');
        const inputIndex = parseInt(parts[parts.length - 1]);
        const nodeId = parts.slice(1, -1).join('_');
        const node = graph.nodes[nodeId];
        if (node) {
          const input = node.inputs[inputIndex];
          deficientNodes.push({
            nodeId,
            nodeName: node.recipe?.name || nodeId,
            inputIndex,
            productId: input?.productId,
            deficitAmount
          });
        }
      }
    }
  });
  
  if (hasDeficiency) {
    const deficiencyDetails = deficientNodes.map(d => 
      `  ${d.nodeName}: needs ${d.deficitAmount.toFixed(4)}/s more of product ${d.productId}`
    ).join('\n');
    
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 1,
      message: `Cannot balance production - insufficient input supply detected:\n${deficiencyDetails}\n\nThis usually means a loop consumes more than it produces.`
    };
  }
  
  // Extract updates
  const updates = extractMachineUpdates(lpResult, graph);
  
  return {
    success: updates.size > 0,
    updates,
    converged: true,
    iterations: 1,
    message: updates.size > 0 ? `Updated ${updates.size} nodes` : 'Network already balanced'
  };
};