/**
 * Combined Temperature Utilities
 * Handles temperature products, heat sources, temperature-dependent cycles, and propagation
 */

export const TEMPERATURE_PRODUCTS = [
  'p_water', 'p_filtered_water', 'p_distilled_water',
  'p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'
];

export const isTemperatureProduct = (productId) => TEMPERATURE_PRODUCTS.includes(productId);
export const DEFAULT_WATER_TEMPERATURE = 18;
export const DEFAULT_BOILER_INPUT_TEMPERATURE = 18;
export const DEFAULT_STEAM_TEMPERATURE = 100;

export const HEAT_SOURCES = {
  m_geothermal_well: { 
    id: 'm_geothermal_well', name: 'Geothermal Well', type: 'additive',
    tempIncrease: 80, maxTemp: 220, canChain: true, maxChains: 3 
  },
  m_firebox: { id: 'm_firebox', name: 'Firebox', type: 'fixed', outputTemp: 240 },
  m_industrial_firebox: { id: 'm_industrial_firebox', name: 'Industrial Firebox', type: 'fixed', outputTemp: 300 },
  m_electric_water_heater: { 
    id: 'm_electric_water_heater', name: 'Electric Water Heater', type: 'configurable',
    tempOptions: [
      { temp: 120, power: 300000 },
      { temp: 220, power: 800000 },
      { temp: 320, power: 1500000 }
    ]
  },
  m_gas_burner: { 
    id: 'm_gas_burner', name: 'Gas Burner', type: 'product_dependent',
    temps: { p_water: 400, p_filtered_water: 405, p_distilled_water: 410 }
  },
  m_liquid_boiler: { 
    id: 'm_liquid_boiler', name: 'Liquid Boiler', type: 'product_dependent',
    temps: { p_water: 105 }
  },
  m_boiler: { 
    id: 'm_boiler', name: 'Boiler', type: 'boiler',
    defaultHeatLoss: 0, steamOutputProduct: 'p_steam', minSteamTemp: 100 
  },
  m_coal_generator: { id: 'm_coal_generator', name: 'Coal Generator', type: 'fixed', outputTemp: 150, outputProduct: 'p_steam' },
  m_coal_power_plant: { id: 'm_coal_power_plant', name: 'Coal Power Plant', type: 'fixed', outputTemp: 500, outputProduct: 'p_high_pressure_steam' },
  m_nuclear_power_plant: { id: 'm_nuclear_power_plant', name: 'Nuclear Power Plant', type: 'fixed', outputTemp: 1500, outputProduct: 'p_high_pressure_steam' },
  m_modular_turbine: { 
    id: 'm_modular_turbine', name: 'Modular Turbine', type: 'passthrough',
    inputProduct: 'p_high_pressure_steam', outputProduct: 'p_low_pressure_steam' 
  }
};

export const calculateOutputTemperature = (machineId, settings = {}, inputTemp = DEFAULT_WATER_TEMPERATURE, inputProductId = null, secondInputTemp = null) => {
  const heatSource = HEAT_SOURCES[machineId];
  if (!heatSource) return inputTemp;
  
  switch (heatSource.type) {
    case 'fixed':
      return heatSource.outputTemp;
    case 'additive':
      return Math.min(inputTemp + heatSource.tempIncrease, heatSource.maxTemp);
    case 'configurable':
      return settings.temperature || heatSource.tempOptions[0].temp;
    case 'product_dependent':
      return heatSource.temps[inputProductId] || heatSource.temps.p_water || 400;
    case 'passthrough':
      return inputTemp;
    case 'boiler':
      const coolantTemp = secondInputTemp ?? DEFAULT_BOILER_INPUT_TEMPERATURE;
      const heatLoss = settings.heatLoss ?? heatSource.defaultHeatLoss;
      return coolantTemp - heatLoss;
    default:
      return inputTemp;
  }
};

export const getPowerConsumptionForTemperature = (machineId, temperature) => {
  const heatSource = HEAT_SOURCES[machineId];
  if (!heatSource || heatSource.type !== 'configurable') return null;
  const option = heatSource.tempOptions.find(opt => opt.temp === temperature);
  return option ? option.power : null;
};

export const formatTemperature = (temp) => temp == null ? '' : `${Math.round(temp)}°C`;

export const needsTemperatureConfig = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'configurable';
};

export const needsBoilerConfig = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'boiler';
};

export const getDefaultTemperatureSettings = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  if (!heatSource) return {};
  if (heatSource.type === 'configurable') return { temperature: heatSource.tempOptions[0].temp };
  if (heatSource.type === 'boiler') return { heatLoss: heatSource.defaultHeatLoss };
  return {};
};

export const isAdditiveHeatSource = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'additive';
};

export const isBoiler = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'boiler';
};

// Temperature-dependent cycle time formulas
const industrialDrillSeconds = (tempC) => {
  if (tempC <= 0) return Infinity;
  if (tempC >= 400) return 2;
  return 800 / tempC;
};

const alloyerSeconds = (tempC) => {
  if (tempC <= 0) return 40;
  if (tempC <= 300) return 1500 / tempC + 5;
  if (tempC < 350) return 10 - (tempC - 300) / 25;
  return 8;
};

const coalLiquefactionSeconds = (tempC) => {
  if (tempC <= 18) return 88;
  if (tempC <= 300) return 3000 / tempC + 10;
  if (tempC < 350) return 20 - 0.2 * (tempC - 300);
  return 10;
};

const steamCrackingSeconds = (tempC) => {
  if (tempC <= 0) return 30;
  const T3 = 2973 / 11;
  const T4 = 4000 / 11;
  if (tempC <= T3) return 30 + (-165 / 1982) * tempC;
  if (tempC < T4) return (-99 / 2054) * tempC + (21081 / 1027);
  return 3;
};

const waterCycleTimePerUnit = (tempC) => tempC <= 0 ? Infinity : 64 / (0.176 * Math.abs(tempC));

export const TEMP_DEPENDENT_MACHINES = {
  m_industrial_drill: { type: 'steam_input', formula: industrialDrillSeconds },
  m_alloyer: { type: 'steam_input', formula: alloyerSeconds },
  m_coal_liquefaction_plant: { type: 'steam_input', formula: coalLiquefactionSeconds },
  m_steam_cracking_plant: { type: 'steam_input', formula: steamCrackingSeconds },
  m_water_treatment_plant: { type: 'steam_input', formula: waterCycleTimePerUnit }
};

export const hasTempDependentCycle = (machineId) => machineId in TEMP_DEPENDENT_MACHINES;

export const getTempDependentCycleTime = (machineId, inputTemp, baseCycleTime) => {
  const machine = TEMP_DEPENDENT_MACHINES[machineId];
  if (!machine) return baseCycleTime;
  const calculatedTime = machine.formula(inputTemp);
  return isFinite(calculatedTime) ? calculatedTime : baseCycleTime;
};

export const recipeUsesSteam = (recipe) => {
  if (!recipe || !recipe.inputs) return false;
  return recipe.inputs.some(input => 
    ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(input.product_id)
  );
};

export const getSteamInputIndex = (recipe) => {
  if (!recipe || !recipe.inputs) return -1;
  return recipe.inputs.findIndex(input => 
    ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(input.product_id)
  );
};

// Temperature propagation functions
export const propagateTemperatures = (graph, flows) => {
  const outputTemperatures = new Map();
  const inputTemperatures = new Map();
  
  // Initialize all temperatures to default (18°C)
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
  
  const { sorted, cycleNodes } = topologicalSortWithCycles(graph);
  
  const calculateNodeTemperatures = (nodeId, inCycle = false) => {
    const node = graph.nodes[nodeId];
    if (!node) return false;
    
    const machine = { id: node.recipe.machine_id };
    const heatSource = HEAT_SOURCES[machine.id];
    let hasChanges = false;
    
    // Step 1: Calculate all input temperatures (flow-weighted averaging)
    node.inputs.forEach((input, inputIndex) => {
      const newTemp = calculateInputTemperature(graph, flows, nodeId, inputIndex, outputTemperatures, !inCycle);
      const oldTemp = inputTemperatures.get(`${nodeId}:${inputIndex}`);
      const finalTemp = newTemp !== null ? newTemp : oldTemp;
      
      if (Math.abs(finalTemp - oldTemp) > 0.01) {
        inputTemperatures.set(`${nodeId}:${inputIndex}`, finalTemp);
        hasChanges = true;
      }
    });
    
    // Step 2: Calculate output temperatures based on heat source type
    node.outputs.forEach((output, outputIndex) => {
      let temperature = DEFAULT_WATER_TEMPERATURE;
      
      if (heatSource) {
        if (heatSource.type === 'fixed') {
          // Fixed temperature output
          temperature = heatSource.outputTemp;
          
        } else if (heatSource.type === 'additive') {
          // Geothermal: input + 80°C up to 220°C max, or passthrough if > 220°C
          if (node.inputs.length > 0) {
            const firstInputTemp = inputTemperatures.get(`${nodeId}:0`) || DEFAULT_WATER_TEMPERATURE;
            
            if (firstInputTemp > heatSource.maxTemp) {
              // Passthrough if input exceeds max
              temperature = firstInputTemp;
            } else {
              // Add temperature increase, capped at max
              temperature = Math.min(firstInputTemp + heatSource.tempIncrease, heatSource.maxTemp);
            }
          }
          
        } else if (heatSource.type === 'configurable') {
          // Electric water heater: user-configured temperature
          temperature = node.recipe.temperatureSettings?.temperature || heatSource.tempOptions[0].temp;
          
        } else if (heatSource.type === 'product_dependent') {
          // Gas burner: different temps for different water types
          if (node.inputs.length > 0) {
            const firstInputProductId = node.inputs[0].productId;
            temperature = heatSource.temps[firstInputProductId] || heatSource.temps.p_water || 400;
          }
          
        } else if (heatSource.type === 'boiler') {
          // Boiler: dual outputs with different temperatures
          // Uses second input (hot water/coolant from heat source) as boiler temperature
          if (node.inputs.length >= 2) {
            const boilerTemp = inputTemperatures.get(`${nodeId}:1`) || DEFAULT_WATER_TEMPERATURE;
            const heatLoss = node.recipe.temperatureSettings?.heatLoss || heatSource.defaultHeatLoss;
            const steamTemp = boilerTemp - heatLoss;
            
            // Coolant output (index 0): (boilerTemp - heatLoss) * 0.85
            if (outputIndex === 0) {
              temperature = steamTemp * 0.85;
            } 
            // Steam output (index 1): boilerTemp - heatLoss
            else if (outputIndex === 1) {
              if (steamTemp < heatSource.minSteamTemp) {
                temperature = Math.max(steamTemp, DEFAULT_WATER_TEMPERATURE);
              } else {
                temperature = steamTemp;
              }
            }
          }
          
        } else if (heatSource.type === 'passthrough') {
          // Modular turbine: pass through input temperature
          const steamInputIndex = node.inputs.findIndex(inp => 
            inp.productId === heatSource.inputProduct
          );
          
          if (steamInputIndex >= 0) {
            temperature = inputTemperatures.get(`${nodeId}:${steamInputIndex}`) || DEFAULT_WATER_TEMPERATURE;
          }
        }
      }
      
      outputTemperatures.set(`${nodeId}:${outputIndex}`, temperature);
    });
    
    return hasChanges;
  };
  
  // Process nodes in topological order
  sorted.forEach(nodeId => {
    if (!cycleNodes.has(nodeId)) {
      calculateNodeTemperatures(nodeId);
    }
  });
  
  // Handle cycles with iteration
  if (cycleNodes.size > 0) {
    const MAX_ITERATIONS = 100;
    let iteration = 0;
    let hasChanges = true;
    
    // Get cycle nodes in a consistent order (from sorted list)
    const cycleNodesOrdered = sorted.filter(nodeId => cycleNodes.has(nodeId));
    
    while (hasChanges && iteration < MAX_ITERATIONS) {
      hasChanges = false;
      // Process cycle nodes in topological order for better convergence
      cycleNodesOrdered.forEach(nodeId => {
        if (calculateNodeTemperatures(nodeId, true)) {
          hasChanges = true;
        }
      });
      iteration++;
    }
    
    // Recalculate downstream nodes affected by cycles
    const nodesToRecalculate = new Set();
    
    sorted.forEach(nodeId => {
      if (cycleNodes.has(nodeId)) return;
      const node = graph.nodes[nodeId];
      if (!node) return;
      
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
    
    nodesToRecalculate.forEach(nodeId => {
      calculateNodeTemperatures(nodeId, false);
    });
  }
  
  return { outputTemperatures, inputTemperatures };
};

const calculateInputTemperature = (graph, flows, nodeId, inputIndex, outputTemperatures, useDefaults = true) => {
  const productData = graph.products[graph.nodes[nodeId].inputs[inputIndex].productId];
  if (!productData) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  const connections = productData.connections.filter(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
  );
  
  if (connections.length === 0) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  // Collect temperatures and flows from all connections
  const tempFlowPairs = [];
  
  connections.forEach(conn => {
    const sourceTemp = outputTemperatures.get(`${conn.sourceNodeId}:${conn.sourceOutputIndex}`);
    if (sourceTemp !== undefined && sourceTemp !== null) {
      const connectionFlow = flows.byConnection[conn.id]?.flowRate || 0;
      tempFlowPairs.push({ temp: sourceTemp, flow: connectionFlow });
    }
  });
  
  if (tempFlowPairs.length === 0) return useDefaults ? DEFAULT_WATER_TEMPERATURE : null;
  
  // Calculate total flow across all connections
  const totalFlow = tempFlowPairs.reduce((sum, pair) => sum + pair.flow, 0);
  
  // Use flow-weighted average if flows are available and non-zero
  if (totalFlow > 0) {
    const weightedTemp = tempFlowPairs.reduce((sum, pair) => sum + (pair.temp * pair.flow), 0);
    return Math.round((weightedTemp / totalFlow) * 1e10) / 1e10;
  }
  
  // Fall back to simple average if no flow data (e.g., during cycle iterations)
  const simpleAvgTemp = tempFlowPairs.reduce((sum, pair) => sum + pair.temp, 0);
  return Math.round((simpleAvgTemp / tempFlowPairs.length) * 1e10) / 1e10;
};

const topologicalSortWithCycles = (graph) => {
  const sorted = [];
  const visited = new Set();
  const inProgress = new Set();
  const cycleNodes = new Set();
  
  const visit = (nodeId, path = []) => {
    if (visited.has(nodeId)) return;
    
    if (inProgress.has(nodeId)) {
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
  
  Object.keys(graph.nodes).forEach(nodeId => {
    if (!visited.has(nodeId)) {
      visit(nodeId);
    }
  });
  
  return { sorted, cycleNodes };
};

export const applyTemperaturesToNodes = (nodes, temperatureData, graph) => {
  return nodes.map(node => {
    const graphNode = graph.nodes[node.id];
    if (!graphNode) return node;
    
    const machine = { id: node.data.recipe.machine_id };
    const heatSource = HEAT_SOURCES[machine.id];
    const isTempDependent = hasTempDependentCycle(machine.id);
    
    const updatedOutputs = node.data.recipe.outputs.map((output, outputIndex) => {
      const temp = temperatureData.outputTemperatures.get(`${node.id}:${outputIndex}`);
      
      if (temp !== undefined && temp !== null) {
        if (heatSource?.type === 'boiler' && output.product_id === 'p_steam') {
          const minSteamTemp = heatSource.minSteamTemp || 100;
          if (temp < minSteamTemp) {
            return { ...output, temperature: temp, quantity: 0, originalQuantity: output.originalQuantity || output.quantity };
          } else {
            return { ...output, temperature: temp, quantity: output.originalQuantity || output.quantity, originalQuantity: output.originalQuantity || output.quantity };
          }
        }
        return { ...output, temperature: temp };
      }
      return output;
    });
    
    let updatedRecipe = { ...node.data.recipe, outputs: updatedOutputs };
    
    if (isTempDependent) {
      const tempInfo = TEMP_DEPENDENT_MACHINES[machine.id];
      if (tempInfo?.type === 'steam_input') {
        const steamInputIndex = node.data.recipe.inputs.findIndex(inp =>
          ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(inp.product_id)
        );
        
        if (steamInputIndex >= 0) {
          const steamTemp = temperatureData.inputTemperatures.get(`${node.id}:${steamInputIndex}`);
          if (steamTemp !== undefined && steamTemp !== null) {
            updatedRecipe = { ...updatedRecipe, tempDependentInputTemp: steamTemp };
            
            if (machine.id === 'm_water_treatment_plant') {
              const cycleTime = getTempDependentCycleTime(machine.id, steamTemp, 1);
              const steamInputQuantity = 90 * cycleTime;
              
              updatedRecipe = {
                ...updatedRecipe,
                inputs: updatedRecipe.inputs.map((input, idx) => {
                  if (idx === 1 && ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(input.product_id)) {
                    return { ...input, quantity: steamInputQuantity, originalQuantity: 90 };
                  }
                  return input;
                })
              };
            }
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