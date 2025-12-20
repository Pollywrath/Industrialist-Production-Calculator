/**
 * Temperature Handler - Manages temperature tracking for water and steam products
 * 
 * Temperature-sensitive products:
 * - Water (p_water)
 * - Filtered Water (p_filtered_water)
 * - Distilled Water (p_distilled_water)
 * - Steam (p_steam)
 * - Low Pressure Steam (p_low_pressure_steam)
 * - High Pressure Steam (p_high_pressure_steam)
 * 
 * IMPORTANT: Most heat sources SET water to their target temperature (not additive).
 * Only Geothermal Well is truly additive and can be chained up to 3 times.
 */

// Products that have temperature properties
export const TEMPERATURE_PRODUCTS = [
  'p_water',
  'p_filtered_water',
  'p_distilled_water',
  'p_steam',
  'p_low_pressure_steam',
  'p_high_pressure_steam'
];

// Check if a product is temperature-sensitive
export const isTemperatureProduct = (productId) => {
  return TEMPERATURE_PRODUCTS.includes(productId);
};

// Default temperature for freshly extracted water
export const DEFAULT_WATER_TEMPERATURE = 18; // °C

// Default temperature for boiler when no input connected
export const DEFAULT_BOILER_INPUT_TEMPERATURE = 17; // °C

/**
 * Heat source configurations
 * Each machine that affects temperature has specific rules
 * 
 * Machine IDs follow format: m_machine_name
 * 
 * TYPES:
 * - 'additive': Adds to existing temperature (Geothermal Well only)
 * - 'fixed': Sets to a specific temperature regardless of input
 * - 'configurable': Sets to a user-selected temperature
 * - 'product_dependent': Sets temperature based on input product type
 * - 'passthrough': Output temp equals input temp (Modular Turbine)
 * - 'boiler': Special case - uses second input temp with configurable heat loss, only applies to steam
 */
export const HEAT_SOURCES = {
  // Geothermal Well - ONLY machine that truly adds to temperature
  // Can be chained up to 3 times: 18°C + 80 + 80 + 80 = 258°C (capped at 220°C)
  m_geothermal_well: {
    id: 'm_geothermal_well',
    name: 'Geothermal Well',
    type: 'additive',
    tempIncrease: 80,
    maxTemp: 220,
    canChain: true,
    maxChains: 3
  },
  
  // Firebox - SETS temp to 240°C (ignores input temperature)
  m_firebox: {
    id: 'm_firebox',
    name: 'Firebox',
    type: 'fixed',
    outputTemp: 240
  },
  
  // Industrial Firebox - SETS temp to 300°C (ignores input temperature)
  m_industrial_firebox: {
    id: 'm_industrial_firebox',
    name: 'Industrial Firebox',
    type: 'fixed',
    outputTemp: 300
  },
  
  // Electric Water Heater - SETS temp to selected value (ignores input temperature)
  // Power consumption varies by temperature: 120°C=1MMF/s, 220°C=2.5MMF/s, 320°C=5MMF/s
  m_electric_water_heater: {
    id: 'm_electric_water_heater',
    name: 'Electric Water Heater',
    type: 'configurable',
    tempOptions: [
      { temp: 120, power: 1000000 },      // 1 MMF/s
      { temp: 220, power: 2500000 },      // 2.5 MMF/s
      { temp: 320, power: 5000000 }       // 5 MMF/s
    ]
  },
  
  // Gas Burner - SETS temp based on water type (ignores input temperature)
  m_gas_burner: {
    id: 'm_gas_burner',
    name: 'Gas Burner',
    type: 'product_dependent',
    temps: {
      p_water: 400,
      p_filtered_water: 405,
      p_distilled_water: 410
    }
  },
  
  // Boiler - Special case:
  // - Takes temperature from SECOND input (hot water coolant)
  // - Outputs steam at that temp minus configurable heat loss (default 8°C)
  // - Water output has no temperature (cooled water)
  // - Only steam output gets temperature
  // - If output temp < 100°C, no steam is produced
  m_boiler: {
    id: 'm_boiler',
    name: 'Boiler',
    type: 'boiler',
    defaultHeatLoss: 8, // Default heat loss in °C
    steamOutputProduct: 'p_steam',
    minSteamTemp: 100 // Minimum temperature to produce steam
  },
  
  // Coal Generator - outputs steam at fixed 150°C
  m_coal_generator: {
    id: 'm_coal_generator',
    name: 'Coal Generator',
    type: 'fixed',
    outputTemp: 150,
    outputProduct: 'p_steam'
  },
  
  // Coal Power Plant - settings too complex, no temperature config for now
  m_coal_power_plant: {
    id: 'm_coal_power_plant',
    name: 'Coal Power Plant',
    type: 'fixed',
    outputTemp: 150, // Default temp (will need complex settings later)
    outputProduct: 'p_high_pressure_steam'
  },
  
  // Nuclear Power Plant - settings too complex, no temperature config for now
  m_nuclear_power_plant: {
    id: 'm_nuclear_power_plant',
    name: 'Nuclear Power Plant',
    type: 'fixed',
    outputTemp: 150, // Default temp (will need complex settings later)
    outputProduct: 'p_high_pressure_steam'
  },
  
  // Modular Turbine - converts high to low pressure, same temp (passthrough)
  m_modular_turbine: {
    id: 'm_modular_turbine',
    name: 'Modular Turbine',
    type: 'passthrough',
    inputProduct: 'p_high_pressure_steam',
    outputProduct: 'p_low_pressure_steam'
  }
};

/**
 * Calculate output temperature based on machine type and settings
 * 
 * IMPORTANT: Most machines SET the temperature, only Geothermal Well ADDS to it.
 * 
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @param {Object} settings - Machine settings (for configurable machines)
 * @param {number} inputTemp - Input temperature (only used for passthrough/additive/boiler machines)
 * @param {string} inputProductId - Input product ID (for product-dependent machines)
 * @param {number} secondInputTemp - Second input temperature (for boiler)
 * @returns {number|null} Output temperature in °C, or null if not applicable
 */
export const calculateOutputTemperature = (machineId, settings = {}, inputTemp = DEFAULT_WATER_TEMPERATURE, inputProductId = null, secondInputTemp = null) => {
  const heatSource = HEAT_SOURCES[machineId];
  
  if (!heatSource) {
    // Machine doesn't affect temperature, use input temp if available
    return inputTemp;
  }
  
  switch (heatSource.type) {
    case 'fixed':
      // SETS temperature to fixed value (ignores input)
      return heatSource.outputTemp;
    
    case 'additive':
      // ADDS to existing temperature (Geothermal Well only)
      // Cap at maximum temperature (220°C for geothermal)
      const newTemp = inputTemp + heatSource.tempIncrease;
      return Math.min(newTemp, heatSource.maxTemp);
    
    case 'configurable':
      // SETS temperature to configured value (ignores input)
      // For Electric Water Heater: use temperature from settings
      return settings.temperature || heatSource.tempOptions[0].temp;
    
    case 'product_dependent':
      // SETS temperature based on input water type (ignores input temp)
      return heatSource.temps[inputProductId] || heatSource.temps.p_water || 400;
    
    case 'passthrough':
      // Output temp = input temp (Modular Turbine)
      return inputTemp;
    
    case 'boiler':
      // Special case: use SECOND input temp with configurable heat loss
      // If secondInputTemp is provided, use it; otherwise use default boiler input temp (17°C)
      const coolantTemp = secondInputTemp !== null && secondInputTemp !== undefined 
        ? secondInputTemp 
        : DEFAULT_BOILER_INPUT_TEMPERATURE;
      const heatLoss = settings.heatLoss !== undefined ? settings.heatLoss : heatSource.defaultHeatLoss;
      return coolantTemp - heatLoss;
    
    default:
      return inputTemp;
  }
};

/**
 * Get power consumption for a temperature setting (Electric Water Heater)
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @param {number} temperature - Selected temperature
 * @returns {number|null} Power consumption in MF/s, or null if not applicable
 */
export const getPowerConsumptionForTemperature = (machineId, temperature) => {
  const heatSource = HEAT_SOURCES[machineId];
  
  if (!heatSource || heatSource.type !== 'configurable') {
    return null;
  }
  
  // Find the power consumption for the selected temperature
  const option = heatSource.tempOptions.find(opt => opt.temp === temperature);
  return option ? option.power : null;
};

/**
 * Get temperature from connected input
 * Used to determine input temperature for machines that need it
 * @param {Object} graph - Production graph
 * @param {string} nodeId - Node ID
 * @param {number} inputIndex - Input index
 * @returns {number} Temperature of connected input, or default
 */
export const getInputTemperature = (graph, nodeId, inputIndex) => {
  const node = graph.nodes[nodeId];
  if (!node) return DEFAULT_WATER_TEMPERATURE;
  
  const input = node.inputs[inputIndex];
  if (!input || !isTemperatureProduct(input.productId)) {
    return DEFAULT_WATER_TEMPERATURE;
  }
  
  // Find connected output
  const connection = graph.connections.find(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
  );
  
  if (!connection) return DEFAULT_WATER_TEMPERATURE;
  
  // Get source node and output
  const sourceNode = graph.nodes[connection.sourceNodeId];
  if (!sourceNode) return DEFAULT_WATER_TEMPERATURE;
  
  const sourceOutput = sourceNode.outputs[connection.sourceOutputIndex];
  return sourceOutput?.temperature || DEFAULT_WATER_TEMPERATURE;
};

/**
 * Format temperature for display
 * @param {number} temp - Temperature in °C
 * @returns {string} Formatted temperature string
 */
export const formatTemperature = (temp) => {
  if (temp === null || temp === undefined) return '';
  return `${Math.round(temp)}°C`;
};

/**
 * Check if a machine needs temperature configuration
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @returns {boolean} True if machine has temperature settings
 */
export const needsTemperatureConfig = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'configurable';
};

/**
 * Check if a machine is a boiler (needs special settings)
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @returns {boolean} True if machine is a boiler
 */
export const needsBoilerConfig = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'boiler';
};

/**
 * Get default temperature settings for a machine
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @returns {Object} Default settings
 */
export const getDefaultTemperatureSettings = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  
  if (!heatSource) return {};
  
  if (heatSource.type === 'configurable') {
    return {
      temperature: heatSource.tempOptions[0].temp
    };
  }
  
  if (heatSource.type === 'boiler') {
    return {
      heatLoss: heatSource.defaultHeatLoss
    };
  }
  
  return {};
};

/**
 * Check if a machine is additive (Geothermal Well)
 * Useful for UI to show that this machine can be chained
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @returns {boolean} True if machine adds to temperature
 */
export const isAdditiveHeatSource = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'additive';
};

/**
 * Check if a machine is a boiler (needs special handling)
 * @param {string} machineId - Machine ID (format: m_machine_name)
 * @returns {boolean} True if machine is a boiler
 */
export const isBoiler = (machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  return heatSource && heatSource.type === 'boiler';
};