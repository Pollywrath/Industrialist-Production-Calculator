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
  const processedNodes = new Set();
  const geothermalChains = new Map(); // nodeId -> chain count
  
  // Topological sort with cycle detection
  const sorted = topologicalSort(graph);
  
  // Process nodes in topological order
  sorted.forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;
    
    const machine = { id: node.recipe.machine_id };
    const heatSource = HEAT_SOURCES[machine.id];
    
    // Calculate input temperatures from connected outputs
    node.inputs.forEach((input, inputIndex) => {
      const temperature = calculateInputTemperature(
        graph,
        flows,
        nodeId,
        inputIndex,
        outputTemperatures
      );
      inputTemperatures.set(`${nodeId}:${inputIndex}`, temperature);
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
            const inputTemp = inputTemperatures.get(`${nodeId}:${waterInputIndex}`) || DEFAULT_WATER_TEMPERATURE;
            
            // Check chain count
            const chainCount = calculateGeothermalChain(graph, nodeId, outputTemperatures);
            geothermalChains.set(nodeId, chainCount);
            
            if (chainCount < heatSource.maxChains) {
              temperature = Math.min(inputTemp + heatSource.tempIncrease, heatSource.maxTemp);
            } else {
              // Max chains reached, output at input temperature
              temperature = inputTemp;
            }
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
            const inputTemp = inputTemperatures.get(`${nodeId}:${waterInputIndex}`) || DEFAULT_WATER_TEMPERATURE;
            temperature = inputTemp;
          }
        }
      }
      
      outputTemperatures.set(`${nodeId}:${outputIndex}`, temperature);
    });
    
    processedNodes.add(nodeId);
  });
  
  return {
    outputTemperatures,
    inputTemperatures,
    geothermalChains
  };
};

/**
 * Calculate input temperature from connected outputs, weighted by flow
 */
const calculateInputTemperature = (graph, flows, nodeId, inputIndex, outputTemperatures) => {
  const productData = graph.products[graph.nodes[nodeId].inputs[inputIndex].productId];
  if (!productData) return DEFAULT_WATER_TEMPERATURE;
  
  // Find all connections to this input
  const connections = productData.connections.filter(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
  );
  
  if (connections.length === 0) return DEFAULT_WATER_TEMPERATURE;
  
  // Calculate weighted average based on flow
  let totalFlow = 0;
  let weightedTemp = 0;
  
  connections.forEach(conn => {
    const sourceTemp = outputTemperatures.get(`${conn.sourceNodeId}:${conn.sourceOutputIndex}`) || DEFAULT_WATER_TEMPERATURE;
    const connectionFlow = flows.byConnection[conn.id]?.flowRate || 0;
    
    totalFlow += connectionFlow;
    weightedTemp += sourceTemp * connectionFlow;
  });
  
  if (totalFlow === 0) return DEFAULT_WATER_TEMPERATURE;
  
  return Math.round((weightedTemp / totalFlow) * 1e10) / 1e10;
};

/**
 * Calculate how many geothermal wells are chained before this one
 */
const calculateGeothermalChain = (graph, nodeId, outputTemperatures) => {
  const node = graph.nodes[nodeId];
  if (!node) return 0;
  
  // Find water input
  const waterInputIndex = node.inputs.findIndex(inp => 
    ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(inp.productId)
  );
  
  if (waterInputIndex < 0) return 0;
  
  // Find what's connected to this input
  const productData = graph.products[node.inputs[waterInputIndex].productId];
  if (!productData) return 0;
  
  const connections = productData.connections.filter(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === waterInputIndex
  );
  
  if (connections.length === 0) return 0;
  
  // Check if source is also a geothermal well
  let maxChain = 0;
  connections.forEach(conn => {
    const sourceNode = graph.nodes[conn.sourceNodeId];
    if (sourceNode && sourceNode.recipe.machine_id === 'm_geothermal_well') {
      // Recursively calculate chain count
      const sourceChain = calculateGeothermalChain(graph, conn.sourceNodeId, outputTemperatures);
      maxChain = Math.max(maxChain, sourceChain + 1);
    }
  });
  
  return maxChain;
};

/**
 * Topological sort with cycle detection
 */
const topologicalSort = (graph) => {
  const sorted = [];
  const visited = new Set();
  const inProgress = new Set();
  
  const visit = (nodeId) => {
    if (visited.has(nodeId)) return;
    if (inProgress.has(nodeId)) {
      // Cycle detected - just continue (we'll handle loops by using previous iteration's values)
      return;
    }
    
    inProgress.add(nodeId);
    
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
              visit(conn.sourceNodeId);
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
  
  return sorted;
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