import { HEAT_SOURCES, DEFAULT_WATER_TEMPERATURE, DEFAULT_BOILER_INPUT_TEMPERATURE } from './temperatureHandler';
import { hasTempDependentCycle, TEMP_DEPENDENT_MACHINES } from './temperatureDependentCycles';

/**
 * Propagate temperatures through the production network
 * @param {Object} graph - Production graph with nodes and connections
 * @param {Object} flows - Flow data from flow calculator
 * @returns {Object} - Map of node outputs with their calculated temperatures
 */
export const propagateTemperatures = (graph, flows) => {
  const outputTemperatures = new Map(); // nodeId:outputIndex -> temperature
  const inputTemperatures = new Map(); // nodeId:inputIndex -> temperature
  
  // Detect cycles and get topological order
  const { sorted, cycleNodes } = topologicalSortWithCycles(graph);
  
  // Initialize all temperatures to defaults
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;
    
    node.inputs.forEach((input, inputIndex) => {
      inputTemperatures.set(`${nodeId}:${inputIndex}`, DEFAULT_WATER_TEMPERATURE);
    });
    
    node.outputs.forEach((output, outputIndex) => {
      outputTemperatures.set(`${nodeId}:${outputIndex}`, DEFAULT_WATER_TEMPERATURE);
    });
  });
  
  // Function to calculate temperatures for a single node
  const calculateNodeTemperatures = (nodeId, inCycle = false) => {
    const node = graph.nodes[nodeId];
    if (!node) return false;
    
    const machine = { id: node.recipe.machine_id };
    const heatSource = HEAT_SOURCES[machine.id];
    
    let hasChanges = false;
    
    // Calculate input temperatures from connected outputs
    node.inputs.forEach((input, inputIndex) => {
      const newTemp = calculateInputTemperature(
        graph,
        flows,
        nodeId,
        inputIndex,
        outputTemperatures,
        !inCycle // Only use defaults if NOT in cycle
      );
      
      // If in cycle and newTemp is null, use the old value to continue iterating
      const oldTemp = inputTemperatures.get(`${nodeId}:${inputIndex}`);
      const finalTemp = newTemp !== null ? newTemp : oldTemp;
      
      if (Math.abs(finalTemp - oldTemp) > 0.01) {
        inputTemperatures.set(`${nodeId}:${inputIndex}`, finalTemp);
        hasChanges = true;
      }
    });
    
    // Calculate output temperatures based on machine type
    node.outputs.forEach((output, outputIndex) => {
      let temperature = DEFAULT_WATER_TEMPERATURE;
      
      if (heatSource) {
        if (heatSource.type === 'fixed') {
          // Fixed temperature output (firebox, coal generator, etc.)
          temperature = heatSource.outputTemp;
        } else if (heatSource.type === 'additive') {
          // Geothermal well - adds to input temperature
          const waterInputIndex = node.inputs.findIndex(inp => 
            ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(inp.productId)
          );
          
          if (waterInputIndex >= 0) {
            const inputTemp = inputTemperatures.get(`${nodeId}:${waterInputIndex}`);
            const finalInputTemp = inputTemp !== undefined && inputTemp !== null ? inputTemp : DEFAULT_WATER_TEMPERATURE;
            
            // Always add temperature increase, capped at max
            temperature = Math.min(finalInputTemp + heatSource.tempIncrease, heatSource.maxTemp);
          }
        } else if (heatSource.type === 'configurable') {
          // Electric water heater - uses configured temperature
          temperature = node.recipe.temperatureSettings?.temperature || heatSource.tempOptions[0].temp;
        } else if (heatSource.type === 'product_dependent') {
          // Gas burner - temperature depends on input product
          const waterInputIndex = node.inputs.findIndex(inp => 
            ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(inp.productId)
          );
          
          if (waterInputIndex >= 0) {
            const inputProductId = node.inputs[waterInputIndex].productId;
            temperature = heatSource.temps[inputProductId] || heatSource.temps.p_water || 400;
          }
        } else if (heatSource.type === 'boiler') {
          // Boiler - uses second input temperature minus heat loss
          if (node.inputs.length >= 2) {
            const coolantTemp = inputTemperatures.get(`${nodeId}:1`) || DEFAULT_BOILER_INPUT_TEMPERATURE;
            const heatLoss = node.recipe.temperatureSettings?.heatLoss || heatSource.defaultHeatLoss;
            temperature = coolantTemp - heatLoss;
            
            // If below minimum steam temp, no steam produced (quantity = 0)
            if (temperature < heatSource.minSteamTemp) {
              // Temperature still set, but node should have quantity = 0 for steam
              temperature = Math.max(temperature, DEFAULT_WATER_TEMPERATURE);
            }
          }
        } else if (heatSource.type === 'passthrough') {
          // Modular turbine - passes through input temperature
          const steamInputIndex = node.inputs.findIndex(inp => 
            inp.productId === heatSource.inputProduct
          );
          
          if (steamInputIndex >= 0) {
            temperature = inputTemperatures.get(`${nodeId}:${steamInputIndex}`) || DEFAULT_WATER_TEMPERATURE;
          }
        }
        
        // Check if machine has a max output temperature
        if (heatSource.maxTemp && temperature > heatSource.maxTemp) {
          // If input temp exceeds max, just pass through input temp
          const waterInputIndex = node.inputs.findIndex(inp => 
            ['p_water', 'p_filtered_water', 'p_distilled_water', 'p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(inp.productId)
          );
          
          if (waterInputIndex >= 0) {
            const inputTemp = inputTemperatures.get(`${nodeId}:${waterInputIndex}`);
            if (inputTemp !== undefined && inputTemp !== null) {
              temperature = inputTemp;
            }
          }
        }
      }
      
      outputTemperatures.set(`${nodeId}:${outputIndex}`, temperature);
    });
    
    return hasChanges;
  };
  
  // Process non-cycle nodes first
  sorted.forEach(nodeId => {
    if (!cycleNodes.has(nodeId)) {
      calculateNodeTemperatures(nodeId);
    }
  });
  
  // For nodes in cycles, iterate until temperatures stabilize
  if (cycleNodes.size > 0) {
    const MAX_ITERATIONS = 50;
    let iteration = 0;
    let hasChanges = true;
    
    while (hasChanges && iteration < MAX_ITERATIONS) {
      hasChanges = false;
      
      cycleNodes.forEach(nodeId => {
        if (calculateNodeTemperatures(nodeId, true)) {
          hasChanges = true;
        }
      });
      
      iteration++;
    }
    
    // After cycle converges, recalculate non-cycle nodes that depend on cycle nodes
    // This handles cases like gw3 receiving from gw2 (which is in a cycle with gw1)
    const nodesToRecalculate = new Set();
    
    // Find all non-cycle nodes that receive input from cycle nodes
    sorted.forEach(nodeId => {
      if (cycleNodes.has(nodeId)) return;
      
      const node = graph.nodes[nodeId];
      if (!node) return;
      
      // Check if any input comes from a cycle node
      node.inputs.forEach((input, inputIndex) => {
        const productData = graph.products[input.productId];
        if (!productData) return;
        
        const connections = productData.connections.filter(
          conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
        );
        
        connections.forEach(conn => {
          if (cycleNodes.has(conn.sourceNodeId)) {
            nodesToRecalculate.add(nodeId);
          }
        });
      });
    });
    
    // Recalculate these nodes with updated temperatures from cycle
    nodesToRecalculate.forEach(nodeId => {
      calculateNodeTemperatures(nodeId, false);
    });
  }
  
  return {
    outputTemperatures,
    inputTemperatures
  };
};

/**
 * Calculate input temperature from connected outputs, weighted by flow
 */
const calculateInputTemperature = (graph, flows, nodeId, inputIndex, outputTemperatures, useDefaults = true) => {
  const productData = graph.products[graph.nodes[nodeId].inputs[inputIndex].productId];
  if (!productData) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  // Find all connections to this input
  const connections = productData.connections.filter(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
  );
  
  if (connections.length === 0) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  // Calculate weighted average based on flow
  let totalFlow = 0;
  let weightedTemp = 0;
  let hasAnyTemp = false;
  
  connections.forEach(conn => {
    const sourceTemp = outputTemperatures.get(`${conn.sourceNodeId}:${conn.sourceOutputIndex}`);
    if (sourceTemp !== undefined && sourceTemp !== null) {
      hasAnyTemp = true;
      const connectionFlow = flows.byConnection[conn.id]?.flowRate || 0;
      totalFlow += connectionFlow;
      weightedTemp += sourceTemp * connectionFlow;
    }
  });
  
  if (!hasAnyTemp) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  if (totalFlow === 0) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  return Math.round((weightedTemp / totalFlow) * 1e10) / 1e10;
};

/**
 * Topological sort with cycle detection
 * Returns sorted nodes and set of nodes involved in cycles
 */
const topologicalSortWithCycles = (graph) => {
  const sorted = [];
  const visited = new Set();
  const inProgress = new Set();
  const cycleNodes = new Set();
  
  const visit = (nodeId, path = []) => {
    if (visited.has(nodeId)) return;
    
    if (inProgress.has(nodeId)) {
      // Cycle detected - mark all nodes in the cycle
      const cycleStart = path.indexOf(nodeId);
      for (let i = cycleStart; i < path.length; i++) {
        cycleNodes.add(path[i]);
      }
      cycleNodes.add(nodeId);
      return;
    }
    
    inProgress.add(nodeId);
    const newPath = [...path, nodeId];
    
    const node = graph.nodes[nodeId];
    if (node) {
      // Visit all nodes that feed into this one
      node.inputs.forEach((input, inputIndex) => {
        const productData = graph.products[input.productId];
        if (productData) {
          const connections = productData.connections.filter(
            conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
          );
          
          connections.forEach(conn => {
            if (!visited.has(conn.sourceNodeId)) {
              visit(conn.sourceNodeId, newPath);
            }
          });
        }
      });
    }
    
    inProgress.delete(nodeId);
    visited.add(nodeId);
    sorted.push(nodeId);
  };
  
  // Visit all nodes
  Object.keys(graph.nodes).forEach(nodeId => {
    if (!visited.has(nodeId)) {
      visit(nodeId);
    }
  });
  
  return { sorted, cycleNodes };
};

/**
 * Apply propagated temperatures to node recipes
 */
export const applyTemperaturesToNodes = (nodes, temperatureData, graph) => {
  return nodes.map(node => {
    const graphNode = graph.nodes[node.id];
    if (!graphNode) return node;
    
    const machine = { id: node.data.recipe.machine_id };
    const heatSource = HEAT_SOURCES[machine.id];
    
    // Update output temperatures
    const updatedOutputs = node.data.recipe.outputs.map((output, outputIndex) => {
      const temp = temperatureData.outputTemperatures.get(`${node.id}:${outputIndex}`);
      
      if (temp !== undefined && temp !== null) {
        // For boilers, check if steam should be produced
        if (heatSource?.type === 'boiler' && output.product_id === 'p_steam') {
          const minSteamTemp = heatSource.minSteamTemp || 100;
          if (temp < minSteamTemp) {
            // No steam produced
            return { ...output, temperature: temp, quantity: 0, originalQuantity: output.originalQuantity || output.quantity };
          } else {
            // Steam produced normally
            return { ...output, temperature: temp, quantity: output.originalQuantity || output.quantity, originalQuantity: output.originalQuantity || output.quantity };
          }
        }
        
        return { ...output, temperature: temp };
      }
      return output;
    });
    
    // Update input temperatures for temperature-dependent machines
    let updatedRecipe = { ...node.data.recipe, outputs: updatedOutputs };
    
    if (hasTempDependentCycle(machine.id)) {
      const tempInfo = TEMP_DEPENDENT_MACHINES[machine.id];
      if (tempInfo?.type === 'steam_input') {
        // Find steam input
        const steamInputIndex = node.data.recipe.inputs.findIndex(inp =>
          ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(inp.product_id)
        );
        
        if (steamInputIndex >= 0) {
          const steamTemp = temperatureData.inputTemperatures.get(`${node.id}:${steamInputIndex}`);
          if (steamTemp !== undefined && steamTemp !== null) {
            updatedRecipe = { ...updatedRecipe, tempDependentInputTemp: steamTemp };
          }
        }
      }
    }
    
    return {
      ...node,
      data: {
        ...node.data,
        recipe: updatedRecipe
      }
    };
  });
};