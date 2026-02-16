/**
 * Linear Programming Solver for Production Networks
 * Automatically adjusts machine counts to balance production for target recipes
 */

import { getMachine } from '../data/dataLoader';
import { buildProductionGraph } from './graphBuilder';

const EPSILON = 1e-8;

const sanitizeVarName = (name) => {
  return name.replace(/-/g, '_');
};

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
 * Convert the declarative model to HiGHS format and solve
 */
const solveWithHiGHS = async (graph, targetNodeIds) => {
  try {
    console.log('[LP Solver] Initializing HiGHS...');
    console.log('[LP Solver] WASM path:', import.meta.env.BASE_URL + 'highs.wasm');
    
    // Dynamically import highs to avoid blocking worker initialization
    console.log('[LP Solver] Dynamically importing highs...');
    const highsModule = await import('highs');
    
    // Get the highs function
    const highs = highsModule.default;
    
    // Initialize HiGHS - WASM file is served from public folder
    const h = await highs({
      locateFile: (file) => {
        if (file.endsWith('.wasm')) {
          const wasmPath = import.meta.env.BASE_URL + 'highs.wasm';
          console.log('[LP Solver] Loading WASM from:', wasmPath);
          return wasmPath;
        }
        return file;
      }
    });
    
    console.log('[LP Solver] HiGHS initialized successfully');
    
    // Build LP format string directly
    const { lpString, varNameMap } = buildLPString(graph, targetNodeIds);
    console.log('[LP Solver] Built LP format string, length:', lpString.length);
    
    // Solve using HiGHS
    const solution = h.solve(lpString);
    console.log('[LP Solver] Raw solution:', solution);
    
    // Parse solution using the variable name map
    const parsedSolution = parseLPSolution(solution, varNameMap);
    
    return parsedSolution;
    
  } catch (error) {
    console.error('[LP Solver] HiGHS error:', error);
    console.error('[LP Solver] Error type:', error.constructor.name);
    console.error('[LP Solver] Error message:', error.message);
    console.error('[LP Solver] Error stack:', error.stack);
    return { feasible: false, error: error.message, stack: error.stack };
  }
};

/**
 * Build LP format string directly from graph
 */
const buildLPString = (graph, targetNodeIds = new Set()) => {
  let lp = '';
  const variables = new Set();
  const integerVars = new Set();
  const constraints = [];
  const objectiveTerms = [];
  const varNameMap = new Map(); // sanitized -> original mapping
  
  // Helper to register variable and track original name
  const registerVar = (originalName, isInteger = false) => {
    const sanitized = sanitizeVarName(originalName);
    variables.add(sanitized);
    varNameMap.set(sanitized, originalName);
    if (isInteger) {
      integerVars.add(sanitized);
    }
    return sanitized;
  };
  
  // Helper to add constraint
  const addConstraint = (name, lhs, rhs, type) => {
    const sanitizedName = sanitizeVarName(name);
    if (type === 'equal') {
      constraints.push(`${sanitizedName}: ${lhs} = ${rhs}`);
    } else if (type === 'min') {
      constraints.push(`${sanitizedName}: ${lhs} >= ${rhs}`);
    } else if (type === 'max') {
      constraints.push(`${sanitizedName}: ${lhs} <= ${rhs}`);
    }
  };
  
  // Helper to format coefficient
  const formatCoeff = (coeff) => coeff >= 0 ? `+${coeff}` : `${coeff}`;
  
  // Create variables for each node's machine count
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = `m_${nodeId}`;
    const ceilingVarName = `mc_${nodeId}`;
    const currentCount = node.machineCount || 0;
    const machineCountMode = node.machineCountMode || 'free';
    const cappedCount = node.cappedMachineCount;
    
    registerVar(varName);
    registerVar(ceilingVarName, true);
    
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
    
    const machine = getMachine(node.recipe.machine_id);
    const machineCost = machine && typeof machine.cost === 'number' ? machine.cost : 0;
    
    const inputOutputCount = (node.recipe.inputs?.length || 0) + (node.recipe.outputs?.length || 0);
    const powerFactor = Math.ceil(powerValue / 1500000) * 2;
    const inputOutputFactor = inputOutputCount * 2;
    const modelCountPerMachine = 1 + powerFactor + inputOutputFactor;
    
    // Add to objective function
    const machineObjCoeff = (POWER_WEIGHT * powerValue) + (POLLUTION_WEIGHT * pollutionValue) + (COST_WEIGHT * machineCost);
    if (machineObjCoeff !== 0) {
      objectiveTerms.push(`${formatCoeff(machineObjCoeff)} ${sanitizeVarName(varName)}`);
    }
    
    const ceilingObjCoeff = MODEL_COUNT_WEIGHT * modelCountPerMachine;
    objectiveTerms.push(`${formatCoeff(ceilingObjCoeff)} ${sanitizeVarName(ceilingVarName)}`);
    
    // Ceiling constraint: mc_nodeId >= m_nodeId
    addConstraint(`ceiling_${nodeId}`, 
      `${sanitizeVarName(ceilingVarName)} -1 ${sanitizeVarName(varName)}`, 
      0, 'min');
    
    // Non-negativity: m_nodeId >= 0
    addConstraint(`nonneg_${nodeId}`, sanitizeVarName(varName), 0, 'min');
    
    // Handle locked and capped nodes
    if (machineCountMode === 'locked') {
      addConstraint(`lock_${nodeId}`, sanitizeVarName(varName), currentCount, 'equal');
    } else if (machineCountMode === 'capped' && typeof cappedCount === 'number') {
      addConstraint(`cap_${nodeId}`, sanitizeVarName(varName), cappedCount, 'max');
    }
  });
  
  // Create flow variables for each connection
  graph.connections.forEach(conn => {
    const flowVar = `f_${conn.id}`;
    registerVar(flowVar);
    
    // Flow non-negativity
    addConstraint(`flow_nonneg_${conn.id}`, sanitizeVarName(flowVar), 0, 'min');
  });
  
  // Create excess indicator variables
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    node.outputs.forEach((output, outputIndex) => {
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      registerVar(excessIndicatorVar, true);
      
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      const hasConnections = outgoingConnections.length > 0;
      const excessCountWeight = hasConnections ? CONNECTED_EXCESS_COUNT_WEIGHT : UNCONNECTED_EXCESS_COUNT_WEIGHT;
      
      objectiveTerms.push(`${formatCoeff(excessCountWeight)} ${sanitizeVarName(excessIndicatorVar)}`);
      
      // Binary constraint: 0 <= indicator <= 1
      addConstraint(`binary_${nodeId}_${outputIndex}_min`, sanitizeVarName(excessIndicatorVar), 0, 'min');
      addConstraint(`binary_${nodeId}_${outputIndex}_max`, sanitizeVarName(excessIndicatorVar), 1, 'max');
    });
  });
  
  // Flow conservation constraints for each node
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const isTargetNode = targetNodeIds.has(nodeId);
    
    // Output flow conservation
    node.outputs.forEach((output, outputIndex) => {
      const slackVar = `excess_${nodeId}_${outputIndex}`;
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      registerVar(slackVar);
      
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      
      const hasConnections = outgoingConnections.length > 0;
      const excessAmountWeight = hasConnections ? CONNECTED_EXCESS_AMOUNT_WEIGHT : UNCONNECTED_EXCESS_AMOUNT_WEIGHT;
      const actualExcessWeight = isTargetNode ? 1 : excessAmountWeight;
      
      objectiveTerms.push(`${formatCoeff(actualExcessWeight)} ${sanitizeVarName(slackVar)}`);
      
      // Build constraint: production = flows + excess
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = (node.isMineshaftDrill ? quantity : quantity / cycleTime);
      
      const M = ratePerMachine * 10000;
      
      // Link constraint: excess - M * indicator <= 0
      addConstraint(`link_excess_${nodeId}_${outputIndex}`,
        `${sanitizeVarName(slackVar)} ${formatCoeff(-M)} ${sanitizeVarName(excessIndicatorVar)}`,
        0, 'max');
      
      // Flow conservation: machineCount * rate - flows - excess = 0
      let lhs = `${formatCoeff(ratePerMachine)} ${sanitizeVarName(`m_${nodeId}`)}`;
      outgoingConnections.forEach(conn => {
        lhs += ` -1 ${sanitizeVarName(`f_${conn.id}`)}`;
      });
      lhs += ` -1 ${sanitizeVarName(slackVar)}`;
      
      addConstraint(`flow_out_${nodeId}_${outputIndex}`, lhs, 0, 'equal');
    });
    
    // Input flow conservation
    node.inputs.forEach((input, inputIndex) => {
      const incomingConnections = graph.connections.filter(
        c => c.targetNodeId === nodeId && c.targetInputIndex === inputIndex
      );
      
      if (incomingConnections.length === 0) return;
      
      const slackVar = `deficit_${nodeId}_${inputIndex}`;
      const deficitIndicatorVar = `deficit_indicator_${nodeId}_${inputIndex}`;
      registerVar(slackVar);
      registerVar(deficitIndicatorVar, true);
      
      objectiveTerms.push(`${formatCoeff(DEFICIENCY_AMOUNT_WEIGHT)} ${sanitizeVarName(slackVar)}`);
      objectiveTerms.push(`${formatCoeff(DEFICIENCY_COUNT_WEIGHT)} ${sanitizeVarName(deficitIndicatorVar)}`);
      
      // Binary constraint for deficit indicator
      addConstraint(`deficit_binary_${nodeId}_${inputIndex}_min`, sanitizeVarName(deficitIndicatorVar), 0, 'min');
      addConstraint(`deficit_binary_${nodeId}_${inputIndex}_max`, sanitizeVarName(deficitIndicatorVar), 1, 'max');
      
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = (node.isMineshaftDrill ? quantity : quantity / cycleTime);
      const M_deficit = ratePerMachine * 10000;
      
      // Link deficit to indicator: deficit - M * indicator <= 0
      addConstraint(`deficit_link_${nodeId}_${inputIndex}`,
        `${sanitizeVarName(slackVar)} ${formatCoeff(-M_deficit)} ${sanitizeVarName(deficitIndicatorVar)}`,
        0, 'max');
      
      // Flow conservation: flows + deficit >= consumption
      let lhs = '';
      incomingConnections.forEach((conn, idx) => {
        lhs += `${idx > 0 ? ' +' : ''}1 ${sanitizeVarName(`f_${conn.id}`)}`;
      });
      lhs += ` +1 ${sanitizeVarName(slackVar)} ${formatCoeff(-ratePerMachine)} ${sanitizeVarName(`m_${nodeId}`)}`;
      
      addConstraint(`flow_in_${nodeId}_${inputIndex}`, lhs, 0, 'min');
      
      // Max flow constraint: flow <= consumption capacity
      let maxFlowLhs = '';
      incomingConnections.forEach((conn, idx) => {
        maxFlowLhs += `${idx > 0 ? ' +' : ''}1 ${sanitizeVarName(`f_${conn.id}`)}`;
      });
      maxFlowLhs += ` ${formatCoeff(-ratePerMachine)} ${sanitizeVarName(`m_${nodeId}`)}`;
      
      addConstraint(`max_flow_in_${nodeId}_${inputIndex}`, maxFlowLhs, 0, 'max');
    });
  });
  
  // Add minimum excess constraints for target nodes
  targetNodeIds.forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;
    
    node.outputs.forEach((output, outputIndex) => {
      const slackVar = `excess_${nodeId}_${outputIndex}`;
      
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = (node.isMineshaftDrill ? quantity : quantity / cycleTime);
      const currentProduction = ratePerMachine * (node.machineCount || 0);
      
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
        
        const targetRatePerMachine = (targetNode.isMineshaftDrill ? targetQuantity : targetQuantity / targetCycleTime);
        const targetDemand = targetRatePerMachine * (targetNode.machineCount || 0);
        
        currentConnectedFlow += Math.min(currentProduction - currentConnectedFlow, targetDemand);
      });
      
      const currentExcess = Math.max(0, currentProduction - currentConnectedFlow);
      
      addConstraint(`min_excess_${nodeId}_${outputIndex}`, sanitizeVarName(slackVar), currentExcess, 'min');
    });
  });
  
  // Build final LP string
  lp += 'Minimize\n';
  lp += 'obj: ' + objectiveTerms.join(' ') + '\n';
  lp += 'Subject To\n';
  lp += constraints.join('\n') + '\n';
  lp += 'Bounds\n';
  variables.forEach(varName => {
    lp += `${varName} >= 0\n`;
  });
  if (integerVars.size > 0) {
    lp += 'General\n';
    integerVars.forEach(varName => {
      lp += `${varName}\n`;
    });
  }
  lp += 'End\n';
  
  return { lpString: lp, varNameMap };
};

/**
 * Parse HiGHS solution output (already structured as object)
 */
const parseLPSolution = (solutionObj, varNameMap) => {
  console.log('[LP Solver] Parsing solution...');
  
  // Check if optimal
  if (solutionObj.Status !== 'Optimal') {
    console.log('[LP Solver] Solution not optimal, status:', solutionObj.Status);
    return { feasible: false };
  }
  
  const solution = { feasible: true };
  
  // Extract column values (variables)
  const columns = solutionObj.Columns;
  
  // Map sanitized variable names back to original using the map
  Object.keys(columns).forEach(sanitizedVarName => {
    const originalVarName = varNameMap.get(sanitizedVarName);
    
    if (!originalVarName) {
      console.warn('[LP Solver] Unknown variable:', sanitizedVarName);
      return;
    }
    
    // Extract the Primal value from the column object
    let value = columns[sanitizedVarName].Primal;
    
    solution[originalVarName] = value;
  });
  
  console.log('[LP Solver] Parsed variables:', Object.keys(solution).length - 1);
  
  return solution;
};

/**
 * Solve the full graph LP model
 */
const solveFullGraph = async (graph, targetNodeIds = new Set()) => {
  const numNodes = Object.keys(graph.nodes).length;
  const numConnections = graph.connections.length;
  
  console.log('%c[LP Solver] Model Statistics:', 'color: #3498db; font-weight: bold');
  console.log(`  Graph: ${numNodes} nodes, ${numConnections} connections`);
  
  // Solve the model
  console.log('%c[LP Solver] Solving...', 'color: #f39c12; font-weight: bold');
  const solveStartTime = performance.now();
  
  // Build LP string and solve with HiGHS
  const result = await solveWithHiGHS(graph, targetNodeIds);
  
  const solveEndTime = performance.now();
  const solveTime = solveEndTime - solveStartTime;
  
  if (result.feasible) {
    console.log(`%c[LP Solver] Solution found in ${solveTime.toFixed(2)}ms`, 'color: #2ecc71; font-weight: bold');
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
export const computeMachines = async (nodes, edges, targetProducts, options = {}) => {
  const { allowDeficiency = false } = options;
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
  const lpResult = await solveFullGraph(graph, targetNodeIds);
  
  if (!lpResult.feasible) {
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
  
  if (hasDeficiency && !allowDeficiency) {
    const deficiencyDetails = deficientNodes.map(d => 
      `  ${d.nodeName}: needs ${d.deficitAmount.toFixed(4)}/s more of product ${d.productId}`
    ).join('\n');
    
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 1,
      message: `Cannot balance production - insufficient input supply detected:\n${deficiencyDetails}\n\nThis usually means a loop consumes more than it produces.`,
      hasDeficiency: true,
      deficientNodes
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