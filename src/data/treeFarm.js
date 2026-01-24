const HARVEST_CYCLE_TIME = 11; // seconds
const LOGS_PER_TREE = 2;
const HARVESTER_POWER = 200000; // 200kMF
const WATER_PER_SPRINKLER = 1; // water/s
const SPRINKLERS_PER_TANK = 3;

export const DEFAULT_TREE_FARM_CONFIG = {
  trees: 450,
  harvesters: 20,
  sprinklers: 24,
  outputs: 8,
  controller: 1
};

export const getGrowthTime = (globalPollution) => {
  if ((globalPollution >= -60 && globalPollution < 25) || (globalPollution >= 50 && globalPollution < 75)) {
    return 345;
  } else if (globalPollution >= 25 && globalPollution < 50) {
    return 325;
  } else if ((globalPollution >= 75 && globalPollution < 100) || (globalPollution >= -150 && globalPollution < -60)) {
    return 425;
  } else { // < -150 or >= 100
    return 690;
  }
};

export const calculateRequiredWaterTanks = (sprinklers) => {
  return Math.ceil(sprinklers / SPRINKLERS_PER_TANK);
};

export const calculateTreeFarmMetrics = (trees, harvesters, sprinklers, outputs, controller, globalPollution) => {
  if (!trees || !harvesters || !sprinklers || !outputs || controller !== 1) {
    return null;
  }

  const waterTanks = calculateRequiredWaterTanks(sprinklers);
  const growthTime = getGrowthTime(globalPollution);
  
  // Water consumption
  const waterConsumption = sprinklers * WATER_PER_SPRINKLER;
  
  // Sustainable harvest rate (trees regrow)
  const sustainableHarvestRate = trees / growthTime;
  
  // Maximum harvest rate (limited by harvesters)
  const maxHarvestRate = harvesters / HARVEST_CYCLE_TIME;
  
  // Actual harvest rate (limited by whichever is lower)
  const actualHarvestRate = Math.min(sustainableHarvestRate, maxHarvestRate);
  
  // Log output
  const logOutput = actualHarvestRate * LOGS_PER_TREE;
  
  // Power consumption (harvesters only)
  const avgPowerConsumption = (harvesters * HARVESTER_POWER) / HARVEST_CYCLE_TIME;
  
  return {
    trees,
    harvesters,
    sprinklers,
    waterTanks,
    outputs,
    controller,
    growthTime,
    waterConsumption,
    sustainableHarvestRate,
    maxHarvestRate,
    actualHarvestRate,
    logOutput,
    avgPowerConsumption,
    isTreeLimited: sustainableHarvestRate < maxHarvestRate
  };
};

export const buildTreeFarmInputs = (sprinklers) => {
  if (!sprinklers || sprinklers < 1) {
    return [{ product_id: 'p_water', quantity: 'Variable' }];
  }
  
  const waterConsumption = sprinklers * WATER_PER_SPRINKLER;
  return [{ product_id: 'p_water', quantity: waterConsumption }];
};

export const buildTreeFarmOutputs = (trees, harvesters, globalPollution) => {
  if (!trees || !harvesters) {
    return [{ product_id: 'p_oak_log', quantity: 'Variable' }];
  }
  
  const growthTime = getGrowthTime(globalPollution);
  const sustainableHarvestRate = trees / growthTime;
  const maxHarvestRate = harvesters / HARVEST_CYCLE_TIME;
  const actualHarvestRate = Math.min(sustainableHarvestRate, maxHarvestRate);
  const logOutput = actualHarvestRate * LOGS_PER_TREE;
  
  return [{ product_id: 'p_oak_log', quantity: parseFloat(logOutput.toFixed(6)) }];
};

export const DEFAULT_TREE_FARM_RECIPE = {
  id: 'r_tree_farm',
  name: 'Tree Farm',
  machine_id: 'm_tree_farm',
  cycle_time: 1,
  power_consumption: 'Variable',
  power_type: 'MV',
  pollution: 0,
  inputs: [{ product_id: 'p_water', quantity: 'Variable' }],
  outputs: [{ product_id: 'p_oak_log', quantity: 'Variable' }],
  isTreeFarm: true
};