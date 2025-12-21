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
      { temp: 120, power: 1000000 },
      { temp: 220, power: 2500000 },
      { temp: 320, power: 5000000 }
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

export const getInputTemperature = (graph, nodeId, inputIndex) => {
  const node = graph.nodes[nodeId];
  if (!node) return DEFAULT_WATER_TEMPERATURE;
  
  const input = node.inputs[inputIndex];
  if (!input || !isTemperatureProduct(input.productId)) return DEFAULT_WATER_TEMPERATURE;
  
  const connection = graph.connections.find(
    conn => conn.targetNodeId === nodeId && conn.targetInputIndex === inputIndex
  );
  
  if (!connection) return DEFAULT_WATER_TEMPERATURE;
  
  const sourceNode = graph.nodes[connection.sourceNodeId];
  if (!sourceNode) return DEFAULT_WATER_TEMPERATURE;
  
  const sourceOutput = sourceNode.outputs[connection.sourceOutputIndex];
  return sourceOutput?.temperature || DEFAULT_WATER_TEMPERATURE;
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