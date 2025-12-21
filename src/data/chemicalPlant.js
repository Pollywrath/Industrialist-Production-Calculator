export const calculateChemicalPlantMetrics = (speedFactor, efficiencyFactor) => {
  // Calculate multipliers based on speed factor
  const speedDiff = speedFactor - 100;
  const speedSteps = speedDiff / 5;
  
  let inputOutputMultFromSpeed = 1;
  let powerMultFromSpeed = 1;
  
  if (speedFactor < 100) {
    inputOutputMultFromSpeed = 1 + (speedSteps * 0.05); // -5% per step (speedSteps is negative)
    powerMultFromSpeed = 1 + (speedSteps * 0.06666666666666666); // -6.666...% per step
  } else if (speedFactor > 100) {
    inputOutputMultFromSpeed = 1 + (speedSteps * 0.05); // +5% per step
    powerMultFromSpeed = 1 + (speedSteps * 0.10); // +10% per step
  }
  
  // Calculate multipliers based on efficiency factor
  const efficiencyDiff = efficiencyFactor - 100;
  const efficiencySteps = efficiencyDiff / 5;
  
  let inputMultFromEfficiency = 1;
  let powerMultFromEfficiency = 1;
  
  if (efficiencyFactor < 100) {
    inputMultFromEfficiency = 1 + (efficiencySteps * -0.0625); // +6.25% per step (negative step * negative = positive)
    powerMultFromEfficiency = 1 + (efficiencySteps * 0.05); // -5% per step
  } else if (efficiencyFactor > 100) {
    inputMultFromEfficiency = 1 + (efficiencySteps * -0.0425); // -4.25% per step (positive step * negative = negative)
    powerMultFromEfficiency = 1 + (efficiencySteps * 0.25); // +25% per step
  }
  
  // Resources are multiplicative
  const inputMultiplier = inputOutputMultFromSpeed * inputMultFromEfficiency;
  const outputMultiplier = inputOutputMultFromSpeed; // Only affected by speed
  
  // Power is additive
  const powerMultiplier = powerMultFromSpeed + powerMultFromEfficiency - 1; // -1 because both start at 1
  
  return {
    inputMultiplier,
    outputMultiplier,
    powerMultiplier
  };
};

export const applyChemicalPlantSettings = (recipe, speedFactor, efficiencyFactor) => {
  const metrics = calculateChemicalPlantMetrics(speedFactor, efficiencyFactor);
  
  const updatedInputs = recipe.inputs.map(input => ({
    ...input,
    quantity: typeof input.quantity === 'number' 
      ? parseFloat((input.quantity * metrics.inputMultiplier).toFixed(6))
      : input.quantity
  }));
  
  const updatedOutputs = recipe.outputs.map(output => ({
    ...output,
    quantity: typeof output.quantity === 'number'
      ? parseFloat((output.quantity * metrics.outputMultiplier).toFixed(6))
      : output.quantity
  }));
  
  const updatedPower = typeof recipe.power_consumption === 'number'
    ? parseFloat((recipe.power_consumption * metrics.powerMultiplier).toFixed(2))
    : recipe.power_consumption;
  
  return {
    ...recipe,
    inputs: updatedInputs,
    outputs: updatedOutputs,
    power_consumption: updatedPower,
    chemicalPlantSettings: { speedFactor, efficiencyFactor }
  };
};

export const DEFAULT_CHEMICAL_PLANT_SETTINGS = {
  speedFactor: 100,
  efficiencyFactor: 100
};