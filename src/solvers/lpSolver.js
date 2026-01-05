/**
 * Linear Programming Solver Integration
 * Translates production graph to LP model and solves for optimal machine counts
 */

import solver from 'javascript-lp-solver';
import { getMachine } from '../data/dataLoader';

const EPSILON = 1e-8;
const DEBUG_LP = true; // Enable debug logging for LP solver

// Objective weights (in strict priority order)
// Each priority level must dominate all lower priorities combined
const DEFICIENCY_WEIGHT = 1000000000;  // 1 billion - absolutely must eliminate deficiencies
const EXCESS_COUNT_WEIGHT = 1000000;   // 1 million - minimize number of excess outputs
const EXCESS_AMOUNT_WEIGHT = 10000;    // 10k - minimize amount of each excess
const MODEL_COUNT_WEIGHT = 100;        // 100 - minimize model count (values are small: 1-20 per machine)
const POLLUTION_WEIGHT = 1;            // 1 - minimize pollution (values: 0.2-10 per machine)
const POWER_WEIGHT = 0.00001;          // 0.00001 - minimize power (values: 1k-1M per machine)
const COST_WEIGHT = 0.000001;          // 0.000001 - minimize cost (values: 250-200M per machine)

/**
 * Simple example: Balance a single product between producer and consumer
 * This demonstrates the basic translation from graph to LP model
 */
export const solveSingleProductBalance = (graph) => {
  if (DEBUG_LP) {
    console.log('%c[LP Solver] Single Product Balance', 'color: #2ecc71; font-weight: bold');
  }
  
  // Find a simple case: one product with one producer and one consumer
  const productId = Object.keys(graph.products)[0];
  if (!productId) {
    if (DEBUG_LP) console.log('  No products found');
    return null;
  }
  
  const productData = graph.products[productId];
  if (!productData || productData.producers.length === 0 || productData.consumers.length === 0) {
    if (DEBUG_LP) console.log(`  Product ${productId} has no producers or consumers`);
    return null;
  }
  
  const producer = productData.producers[0];
  const consumer = productData.consumers[0];
  
  const producerNode = graph.nodes[producer.nodeId];
  const consumerNode = graph.nodes[consumer.nodeId];
  
  if (!producerNode || !consumerNode) {
    if (DEBUG_LP) console.log('  Producer or consumer node not found');
    return null;
  }
  
  if (DEBUG_LP) {
    console.log(`  Product: ${productId}`);
    console.log(`  Producer: ${producerNode.recipe?.name || producer.nodeId} (rate: ${producer.rate}/machine)`);
    console.log(`  Consumer: ${consumerNode.recipe?.name || consumer.nodeId} (rate: ${consumer.rate}/machine)`);
  }
  
  // Build LP model
  // Variables: machine_count_producer, machine_count_consumer
  // Constraints: 
  //   producer_rate * machine_count_producer >= consumer_rate * machine_count_consumer
  // Objective: Minimize total machines
  
  const model = {
    optimize: 'total_machines',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {} // Integer constraints for machine counts
  };
  
  // Variable for producer machine count
  const producerVar = `m_${producer.nodeId}`;
  model.variables[producerVar] = {
    total_machines: 1,
    production: producer.rate
  };
  model.ints[producerVar] = 1; // Must be integer
  
  // Variable for consumer machine count
  const consumerVar = `m_${consumer.nodeId}`;
  model.variables[consumerVar] = {
    total_machines: 1,
    consumption: consumer.rate
  };
  model.ints[consumerVar] = 1; // Must be integer
  
  // Constraint: production >= consumption
  model.constraints.balance = { min: 0 };
  model.variables[producerVar].balance = producer.rate;
  model.variables[consumerVar].balance = -consumer.rate;
  
  if (DEBUG_LP) {
    console.log('  LP Model:', JSON.stringify(model, null, 2));
  }
  
  // Solve
  const result = solver.Solve(model);
  
  if (DEBUG_LP) {
    console.log('  Solution:', result);
    if (result.feasible) {
      console.log(`  ✓ Feasible solution found`);
      console.log(`    Producer machines: ${result[producerVar] || 0}`);
      console.log(`    Consumer machines: ${result[consumerVar] || 0}`);
      console.log(`    Total machines: ${result.total_machines || 0}`);
    } else {
      console.log('  ✗ No feasible solution');
    }
  }
  
  return result;
};

/**
 * Build LP model for entire production graph
 * This is a more complete translation but still simplified
 */
export const buildFullGraphModel = (graph, targetNodeIds = new Set()) => {
  if (DEBUG_LP) {
    console.log('%c[LP Solver] Building Full Graph Model (Flow-Based)', 'color: #2ecc71; font-weight: bold');
    console.log(`  Nodes: ${Object.keys(graph.nodes).length}`);
    console.log(`  Products: ${Object.keys(graph.products).length}`);
    console.log(`  Connections: ${graph.connections.length}`);
    console.log(`  Targets: ${targetNodeIds.size}`);
    if (targetNodeIds.size > 0) {
      console.log(`  Target node IDs:`, Array.from(targetNodeIds));
      targetNodeIds.forEach(nodeId => {
        const node = graph.nodes[nodeId];
        if (node) {
          console.log(`    - ${nodeId}: ${node.recipe?.name || 'Unknown'} (${node.machineCount} machines)`);
        }
      });
    }
  }
  
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
    // Note: Model count and machine cost should ideally use ceiling, but LP solvers
    // work with continuous variables. The fractional cost is an approximation.
    model.variables[varName] = {
      total_cost: (MODEL_COUNT_WEIGHT * modelCountPerMachine) + 
                  (POWER_WEIGHT * powerValue) + 
                  (POLLUTION_WEIGHT * pollutionValue) + 
                  (COST_WEIGHT * machineCost)
    };
    
    if (DEBUG_LP) {
      const costBreakdown = {
        modelCount: MODEL_COUNT_WEIGHT * modelCountPerMachine,
        power: POWER_WEIGHT * powerValue,
        pollution: POLLUTION_WEIGHT * pollutionValue,
        machineCost: COST_WEIGHT * machineCost
      };
      if (nodeId === Object.keys(graph.nodes)[0]) {
        console.log(`  Sample cost breakdown for ${node.recipe?.name || nodeId}:`);
        console.log(`    Model count: ${modelCountPerMachine} × ${MODEL_COUNT_WEIGHT} = ${costBreakdown.modelCount}`);
        console.log(`    Power: ${powerValue} × ${POWER_WEIGHT} = ${costBreakdown.power}`);
        console.log(`    Pollution: ${pollutionValue} × ${POLLUTION_WEIGHT} = ${costBreakdown.pollution}`);
        console.log(`    Machine cost: ${machineCost} × ${COST_WEIGHT} = ${costBreakdown.machineCost}`);
        console.log(`    Total per machine: ${costBreakdown.modelCount + costBreakdown.power + costBreakdown.pollution + costBreakdown.machineCost}`);
      }
    }
    
    // Machine counts can be fractional (don't add to ints)
    // Will round to 10dp or 20dp for repeating decimals in post-processing
    
    // Add non-negativity constraint (allow 0, but not negative)
    const nonNegConstraintName = `nonneg_${nodeId}`;
    model.constraints[nonNegConstraintName] = { min: 0 };
    model.variables[varName][nonNegConstraintName] = 1;
    
    // For target nodes, fix them at their current count
    if (targetNodeIds.has(nodeId)) {
      const targetConstraintName = `fixed_${nodeId}`;
      model.constraints[targetConstraintName] = { 
        min: currentCount, 
        max: currentCount 
      };
      model.variables[varName][targetConstraintName] = 1;
      
      if (DEBUG_LP) {
        console.log(`  Target node ${nodeId} (${node.recipe?.name}): fixed at ${currentCount} machines`);
      }
    }
  });
  
  // Create flow variables for each connection
  graph.connections.forEach(conn => {
    const flowVar = `f_${conn.id}`;
    
    // Flow contributes 0 to cost (we minimize machines, not flow)
    model.variables[flowVar] = {
      total_cost: 0
    };
    
    // Flow must be non-negative (but not necessarily integer)
    // Don't add to ints{} - flows can be fractional
  });
  
  // Create excess indicator variables (binary) to count number of outputs with excess
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    node.outputs.forEach((output, outputIndex) => {
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      
      // This is a binary variable (0 or 1) that indicates if this output has excess
      model.variables[excessIndicatorVar] = {
        total_cost: EXCESS_COUNT_WEIGHT  // High cost for having excess
      };
      model.ints[excessIndicatorVar] = 1;  // Must be integer
      
      // Add constraint to make indicator binary (0 <= indicator <= 1)
      const binaryConstraintName = `binary_${nodeId}_${outputIndex}`;
      model.constraints[binaryConstraintName] = { min: 0, max: 1 };
      model.variables[excessIndicatorVar][binaryConstraintName] = 1;
    });
  });
  
  // Flow conservation constraints for each node
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    // For each output handle, create flow conservation constraint with excess slack
    node.outputs.forEach((output, outputIndex) => {
      const constraintName = `flow_out_${nodeId}_${outputIndex}`;
      const slackVar = `excess_${nodeId}_${outputIndex}`;
      const excessIndicatorVar = `excess_indicator_${nodeId}_${outputIndex}`;
      
      // Create excess slack variable (penalized by amount)
      model.variables[slackVar] = {
        total_cost: EXCESS_AMOUNT_WEIGHT,  // Cost per unit of excess
        [constraintName]: -1  // Subtracts from constraint to absorb excess production
      };
      
      // Link slack to indicator: if excess > 0, indicator must be 1
      // We need: excess <= M * indicator (where M is a large number)
      // This means: if excess > 0, then indicator >= excess/M > 0, so indicator = 1
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
      
      // M = maximum possible production (use a large multiplier of max machine count)
      const M = ratePerMachine * 10000;  // Assume max 10000 machines
      
      // Constraint: excess - M * indicator <= 0
      model.variables[slackVar][linkConstraintName] = 1;
      model.variables[excessIndicatorVar][linkConstraintName] = -M;
      
      // Constraint: production_capacity >= outgoing_flows + excess_slack
      // production_capacity - outgoing_flows - excess_slack >= 0
      model.constraints[constraintName] = { min: 0 };
      
      // Add production capacity term (positive)
      if (!model.variables[machineVar][constraintName]) {
        model.variables[machineVar][constraintName] = 0;
      }
      model.variables[machineVar][constraintName] += ratePerMachine;
      
      // Find all connections from this output
      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      
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
        if (DEBUG_LP) {
          console.log(`  Skipping unconnected input: ${nodeId} input ${inputIndex} (${input.productId})`);
        }
        return;
      }
      
      const constraintName = `flow_in_${nodeId}_${inputIndex}`;
      const slackVar = `deficit_${nodeId}_${inputIndex}`;
      
      // Create deficiency slack variable (heavily penalized)
      model.variables[slackVar] = {
        total_cost: DEFICIENCY_WEIGHT,
        [constraintName]: 1  // Adds to LHS to allow deficit
      };
      
      // Get machine count variable
      const machineVar = `m_${nodeId}`;
      
      // Calculate consumption rate per machine
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      // Constraint: incoming_flows + deficiency_slack >= consumption_demand
      // incoming_flows + deficit_slack - consumption_demand >= 0
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
    });
  });
  
  if (DEBUG_LP) {
    const machineVars = Object.keys(model.variables).filter(v => v.startsWith('m_')).length;
    const flowVars = Object.keys(model.variables).filter(v => v.startsWith('f_')).length;
    const deficitVars = Object.keys(model.variables).filter(v => v.startsWith('deficit_')).length;
    const excessVars = Object.keys(model.variables).filter(v => v.startsWith('excess_') && !v.includes('indicator')).length;
    const excessIndicatorVars = Object.keys(model.variables).filter(v => v.startsWith('excess_indicator_')).length;
    console.log(`  Created ${machineVars} machine variables`);
    console.log(`  Created ${flowVars} flow variables`);
    console.log(`  Created ${deficitVars} deficiency slack variables (weight: ${DEFICIENCY_WEIGHT})`);
    console.log(`  Created ${excessVars} excess amount variables (weight: ${EXCESS_AMOUNT_WEIGHT})`);
    console.log(`  Created ${excessIndicatorVars} excess count indicators (weight: ${EXCESS_COUNT_WEIGHT})`);
    console.log(`  Created ${Object.keys(model.constraints).length} constraints`);
    
    // Sample one deficit variable to verify structure
    const sampleDeficit = Object.keys(model.variables).find(v => v.startsWith('deficit_'));
    if (sampleDeficit) {
      console.log(`  Sample deficit variable structure:`, model.variables[sampleDeficit]);
    }
  }
  
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
    let hasExternalInput = false;
    
    // Check if any node in the SCC has an input from outside the SCC
    for (const nodeId of scc) {
      const node = graph.nodes[nodeId];
      
      for (const input of node.inputs) {
        const productData = graph.products[input.productId];
        if (!productData) continue;
        
        // Check if any producer of this product is outside the SCC
        const hasExternalProducer = productData.producers.some(
          producer => !sccSet.has(producer.nodeId)
        );
        
        if (hasExternalProducer) {
          hasExternalInput = true;
          break;
        }
      }
      
      if (hasExternalInput) break;
    }
    
    // If no external input, this is an unsustainable loop
    if (!hasExternalInput) {
      unsustainableLoops.push({
        nodes: scc,
        nodeNames: scc.map(id => graph.nodes[id]?.recipe?.name || id)
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
    
    // Check if this node feeds itself
    const selfFedProducts = new Map(); // productId -> { inputRate, outputRate }
    
    node.inputs.forEach(input => {
      const productData = graph.products[input.productId];
      if (!productData) return;
      
      // Check if this node produces this product
      const selfProducer = productData.producers.find(
        producer => producer.nodeId === nodeId
      );
      
      if (selfProducer) {
        selfFedProducts.set(input.productId, {
          inputRate: input.rate,
          outputRate: selfProducer.rate
        });
      }
    });
    
    if (selfFedProducts.size > 0) {
      let isUnsustainable = false;
      
      // Check each self-fed product
      for (const [productId, rates] of selfFedProducts) {
        const productData = graph.products[productId];
        const EPSILON = 1e-10;
        
        // If output > input: Always sustainable (net positive production)
        if (rates.outputRate > rates.inputRate + EPSILON) {
          continue; // This product is fine
        }
        
        // If output < input: Need external sources
        if (rates.outputRate < rates.inputRate - EPSILON) {
          // Check if there are other producers for this product
          const hasExternalProducer = productData.producers.some(
            producer => producer.nodeId !== nodeId
          );
          
          if (!hasExternalProducer) {
            // No external source for net negative self-feeding = unsustainable
            isUnsustainable = true;
            break;
          }
          // If there are external producers, continue checking (they handle the deficit)
          continue;
        }
        
        // If output == input (net neutral): Check demand and supply
        if (Math.abs(rates.outputRate - rates.inputRate) < EPSILON) {
          // Check if there are other consumers demanding this product
          const hasOtherConsumers = productData.consumers.some(
            consumer => consumer.nodeId !== nodeId
          );
          
          // Check if there are other producers supplying this product
          const hasOtherProducers = productData.producers.some(
            producer => producer.nodeId !== nodeId
          );
          
          // No other demand or suppliers: Sustainable (self-contained loop)
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
export const solveFullGraph = (graph, targetNodeIds = new Set()) => {
  // Detect unsustainable loops before solving
  const unsustainableLoops = detectUnsustainableLoops(graph);
  
  if (unsustainableLoops.length > 0) {
    if (DEBUG_LP) {
      console.log('%c[LP Solver] Unsustainable Loops Detected', 'color: #e74c3c; font-weight: bold');
      unsustainableLoops.forEach((loop, idx) => {
        console.log(`  Loop ${idx + 1}: ${loop.nodeNames.join(' → ')}`);
        console.log(`    These nodes form a cycle with no external input source`);
      });
    }
    
    return {
      feasible: false,
      unsustainableLoops,
      message: 'Unsustainable loops detected - these machines depend on each other with no external input source'
    };
  }
  
  const model = buildFullGraphModel(graph, targetNodeIds);
  
  if (DEBUG_LP) {
    console.log('%c[LP Solver] Solving Full Graph', 'color: #2ecc71; font-weight: bold');
  }
  
  const result = solver.Solve(model);
  
  if (DEBUG_LP) {
    if (result.feasible) {
      console.log('  ✓ Feasible solution found');
      console.log(`    Reported cost: ${result.total_cost || 0}`);
      
      // Calculate actual objective value manually
      let actualCost = 0;
      let deficiencyCost = 0;
      let excessCountCost = 0;
      let excessAmountCost = 0;
      let modelCountCost = 0;
      let powerCost = 0;
      let pollutionCost = 0;
      let machineCost = 0;
      
      // Show slack variable values
      let totalDeficit = 0;
      let totalExcessCount = 0;
      let totalExcessAmount = 0;
      let totalModelCount = 0;
      let totalPower = 0;
      let totalPollution = 0;
      let totalMachineCost = 0;
      Object.keys(result).forEach(key => {
        if (key.startsWith('deficit_')) {
          const value = result[key] || 0;
          if (value > EPSILON) {
            totalDeficit += value;
            deficiencyCost += value * DEFICIENCY_WEIGHT;
            console.log(`    DEFICIENCY ${key}: ${value} (cost: ${value * DEFICIENCY_WEIGHT})`);
          }
        }
        if (key.startsWith('excess_indicator_')) {
          const value = result[key] || 0;
          if (value > EPSILON) {
            totalExcessCount += value;
            excessCountCost += value * EXCESS_COUNT_WEIGHT;
            console.log(`    EXCESS COUNT ${key}: ${value} (cost: ${value * EXCESS_COUNT_WEIGHT})`);
          }
        }
        if (key.startsWith('excess_') && !key.includes('indicator')) {
          const value = result[key] || 0;
          if (value > EPSILON) {
            totalExcessAmount += value;
            excessAmountCost += value * EXCESS_AMOUNT_WEIGHT;
            console.log(`    EXCESS AMOUNT ${key}: ${value} (cost: ${value * EXCESS_AMOUNT_WEIGHT})`);
          }
        }
        if (key.startsWith('m_')) {
          const nodeId = key.substring(2);
          const node = graph.nodes[nodeId];
          const value = result[key] || 0;
          
          // Recalculate machine cost
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
          
          // Model count uses ceiling of machine count to match UI calculation
          const roundedMachineCount = Math.ceil(value);
          const nodeModelCount = roundedMachineCount * modelCountPerMachine;
          
          // Power and pollution use actual fractional machine count
          const nodePower = value * powerValue;
          const nodePollution = value * pollutionValue;
          
          // Machine cost uses ceiling to match UI (you buy whole machines)
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
      
      actualCost = deficiencyCost + excessCountCost + excessAmountCost + modelCountCost + powerCost + pollutionCost + machineCost;
      
      console.log(`    Total deficiency: ${totalDeficit} (cost: ${deficiencyCost})`);
      console.log(`    Total excess count: ${totalExcessCount} outputs (cost: ${excessCountCost})`);
      console.log(`    Total excess amount: ${totalExcessAmount} (cost: ${excessAmountCost})`);
      console.log(`    Total model count: ${totalModelCount.toFixed(2)} (cost: ${modelCountCost.toFixed(2)})`);
      console.log(`    Total power: ${totalPower.toFixed(2)} W (cost: ${powerCost.toFixed(2)})`);
      console.log(`    Total pollution: ${totalPollution.toFixed(2)} %/hr (cost: ${pollutionCost.toFixed(2)})`);
      console.log(`    Total machine cost: $${totalMachineCost.toFixed(2)} (cost: ${machineCost.toFixed(2)})`);
      console.log(`    ACTUAL TOTAL COST: ${actualCost.toFixed(2)}`);
      
      // Show machine counts for each node (including 0s and changes)
      Object.keys(graph.nodes).forEach(nodeId => {
        const node = graph.nodes[nodeId];
        const varName = `m_${nodeId}`;
        const newValue = result[varName] || 0;
        const oldValue = node.machineCount || 0;
        const changed = Math.abs(newValue - oldValue) > EPSILON;
        const changeIndicator = changed ? ' 🔄' : '';
        console.log(`    ${node?.recipe?.name || nodeId}: ${oldValue} → ${newValue}${changeIndicator}`);
      });
    } else {
      console.log('  ✗ No feasible solution');
      if (result.bounded === false) {
        console.log('    Problem is unbounded');
      }
    }
  }
  
  return result;
};

export const extractMachineUpdates = (lpResult, graph) => {
  const updates = new Map();
  
  if (!lpResult.feasible || lpResult.unsustainableLoops) {
    return updates;
  }
  
  // Iterate over ALL nodes in the graph, not just variables in lpResult
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = `m_${nodeId}`;
    const newCount = lpResult[varName] !== undefined ? lpResult[varName] : 0;
    const currentCount = node.machineCount || 0;
    
    // Only include if value is non-negative and different from current
    // Allow 0, but prevent negative values
    if (newCount >= -EPSILON) {
      const finalCount = Math.max(0, newCount); // Clamp to 0 if slightly negative due to floating point
      
      if (Math.abs(finalCount - currentCount) > EPSILON) {
        // Store the value exactly as LP solver computed it
        updates.set(nodeId, finalCount);
        
        if (DEBUG_LP) {
          console.log(`  Update: ${node?.recipe?.name || nodeId}: ${currentCount} → ${finalCount}`);
        }
      }
    }
  });
  
  return updates;
};

/**
 * Test function to demonstrate LP solver on a simple graph
 */
export const testLPSolver = (graph, targetNodeIds = new Set()) => {
  console.log('\n%c=== LP Solver Test ===', 'color: #2ecc71; font-weight: bold; font-size: 14px');
  
  // Test 1: Single product balance
  console.log('\n1. Testing single product balance...');
  const singleResult = solveSingleProductBalance(graph);
  
  // Test 2: Full graph
  console.log('\n2. Testing full graph model...');
  const fullResult = solveFullGraph(graph, targetNodeIds);
  
  if (fullResult.feasible) {
    const updates = extractMachineUpdates(fullResult, graph);
    console.log(`\n  Suggested updates for ${updates.size} nodes`);
  }
  
  console.log('\n%c===================', 'color: #2ecc71; font-weight: bold; font-size: 14px\n');
  
  return { singleResult, fullResult };
};