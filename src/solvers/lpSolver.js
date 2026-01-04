/**
 * Linear Programming Solver Integration
 * Translates production graph to LP model and solves for optimal machine counts
 */

import solver from 'javascript-lp-solver';

const EPSILON = 1e-10;
const DEBUG_LP = true; // Enable debug logging for LP solver

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
    
    // Each machine contributes to total cost
    model.variables[varName] = {
      total_cost: 1
    };
    
    // Machine counts can be fractional (don't add to ints)
    // Will round to 10dp or 20dp for repeating decimals in post-processing
    
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
  
  // Flow conservation constraints for each node
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    // For each output handle, create flow conservation constraint
    node.outputs.forEach((output, outputIndex) => {
      const constraintName = `flow_out_${nodeId}_${outputIndex}`;
      
      // Get machine count variable
      const machineVar = `m_${nodeId}`;
      
      // Calculate production rate per machine
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      // Constraint: sum of outgoing flows <= production capacity
      // production_capacity - outgoing_flows >= 0
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
    
    // For each input handle, create flow conservation constraint
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
      
      // Get machine count variable
      const machineVar = `m_${nodeId}`;
      
      // Calculate consumption rate per machine
      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
      
      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;
      
      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      
      // Constraint: sum of incoming flows >= consumption demand
      // incoming_flows - consumption_demand >= 0
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
    console.log(`  Created ${machineVars} machine variables`);
    console.log(`  Created ${flowVars} flow variables`);
    console.log(`  Created ${Object.keys(model.constraints).length} constraints`);
  }
  
  return model;
};

/**
 * Solve the full graph LP model
 */
export const solveFullGraph = (graph, targetNodeIds = new Set()) => {
  const model = buildFullGraphModel(graph, targetNodeIds);
  
  if (DEBUG_LP) {
    console.log('%c[LP Solver] Solving Full Graph', 'color: #2ecc71; font-weight: bold');
  }
  
  const result = solver.Solve(model);
  
  if (DEBUG_LP) {
    if (result.feasible) {
      console.log('  ✓ Feasible solution found');
      console.log(`    Total cost: ${result.total_cost || 0}`);
      
      // Show machine counts for each node
      Object.keys(result).forEach(key => {
        if (key.startsWith('m_')) {
          const nodeId = key.substring(2);
          const node = graph.nodes[nodeId];
          const value = result[key];
          console.log(`    ${node?.recipe?.name || nodeId}: ${value} machines`);
        }
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
  
  if (!lpResult.feasible) {
    return updates;
  }
  
  Object.keys(lpResult).forEach(key => {
    if (key.startsWith('m_')) {
      const nodeId = key.substring(2);
      const newCount = lpResult[key] || 0;
      
      // Only include if value is positive and different from current
      if (newCount > EPSILON) {
        const currentCount = graph.nodes[nodeId]?.machineCount || 0;
        if (Math.abs(newCount - currentCount) > EPSILON) {
          // Store the value exactly as LP solver computed it
          updates.set(nodeId, newCount);
          
          if (DEBUG_LP) {
            const node = graph.nodes[nodeId];
            console.log(`  Update: ${node?.recipe?.name || nodeId}: ${currentCount} → ${newCount}`);
          }
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