export const FUEL_PRODUCTS = [
  { id: 'p_coal', name: 'Coal', product_id: 'p_coal', energy: 30000 },
  { id: 'p_coke_fuel', name: 'Coke Fuel', product_id: 'p_coke_fuel', energy: 600000 },
  { id: 'p_planks', name: 'Planks', product_id: 'p_planks', energy: 9000 },
  { id: 'p_oak_log', name: 'Oak Log', product_id: 'p_oak_log', energy: 16000 }
];

// Energy requirements for each industrial firebox recipe
export const RECIPE_ENERGY_REQUIREMENTS = {
  // Sulfur Dioxide (900k energy)
  'r_industrial_firebox_01': 900000,
  // Boron (900k energy)
  'r_industrial_firebox_02': 900000,
  // Hot Water (300k energy)
  'r_industrial_firebox_03': 300000,
  // Hot Filtered Water (300k energy)
  'r_industrial_firebox_04': 300000,
  // Hot Distilled Water (300k energy)
  'r_industrial_firebox_05': 300000,
  // Salt Solution (300k energy)
  'r_industrial_firebox_06': 300000,
  // Sodium Carbonate - NO VARIABLE PRODUCT, handled separately
  'r_industrial_firebox_07': 16000,
};

// Recipes with additional wait time beyond energy calculation
export const RECIPE_ADDITIONAL_WAIT = {
  'r_industrial_firebox_07': 1
};

export const getFuelProduct = (fuelId) => FUEL_PRODUCTS.find(f => f.id === fuelId);

export const calculateFireboxMetrics = (recipeId, fuelId) => {
  const energyNeeded = RECIPE_ENERGY_REQUIREMENTS[recipeId];
  const fuel = getFuelProduct(fuelId);
  
  if (!energyNeeded || !fuel) {
    return null;
  }
  
  // Wait time = energy needed / fuel energy capacity (1 fuel/s consumption rate)
  const waitTime = energyNeeded / fuel.energy;
  
  // Additional wait time for special recipes
  const additionalWait = RECIPE_ADDITIONAL_WAIT[recipeId] || 0;
  
  // Total cycle time
  const cycleTime = waitTime + additionalWait;
  
  // Fuel consumption rate (1 fuel/s while running)
  const fuelConsumptionRate = 1;
  const fuelPerCycle = waitTime; // Only consumes fuel during wait time
  
  return {
    energyNeeded,
    fuelEnergy: fuel.energy,
    waitTime,
    additionalWait,
    cycleTime,
    fuelConsumptionRate,
    fuelPerCycle
  };
};

export const buildFireboxInputs = (originalInputs, fuelId, recipeId) => {
  const metrics = calculateFireboxMetrics(recipeId, fuelId);
  if (!metrics) return originalInputs;
  
  const fuel = getFuelProduct(fuelId);
  if (!fuel) return originalInputs;
  
  // Replace the first input (p_variableproduct or existing fuel) with the new fuel
  const fuelInput = { product_id: fuel.product_id, quantity: parseFloat(metrics.fuelPerCycle.toFixed(6)) };
  
  // Get all fuel product IDs
  const fuelProductIds = FUEL_PRODUCTS.map(f => f.product_id);
  
  // Filter out p_variableproduct AND all fuel products, then add the new fuel at the beginning
  const nonVariableInputs = originalInputs.filter(input => 
    input.product_id !== 'p_variableproduct' && !fuelProductIds.includes(input.product_id)
  );
  
  return [fuelInput, ...nonVariableInputs];
};

export const isIndustrialFireboxRecipe = (recipeId) => {
  return recipeId in RECIPE_ENERGY_REQUIREMENTS;
};

export const getIndustrialFireboxRecipeIds = () => {
  return Object.keys(RECIPE_ENERGY_REQUIREMENTS);
};