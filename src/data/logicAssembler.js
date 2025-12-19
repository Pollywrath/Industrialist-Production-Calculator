/**
 * Logic Assembler configurations and calculations
 * Handles 48 microchip stages (8 outer × 6 inner), cycle times, and material requirements
 */

// Stage configuration
const STEPS_PER_STAGE = 4;
const MIN_STEP_TIME = 4; // seconds
const MAX_STEP_TIME = 36; // seconds
const AVG_STEP_TIME = 20; // seconds (without machine oil)
const AVG_STEP_TIME_WITH_OIL = 4; // seconds (20s ÷ 5 = 4s)
const POWER_STORAGE_REQUIREMENT = 500000; // 500kMF per step
const MACHINE_OIL_RATE = 0.3; // Machine Oil/s when enabled
const BASE_CYCLE_TIME = 10; // Base 10 seconds added to all cycles

/**
 * Generate all 48 microchip stages
 * Returns array of { outerStage, innerStage, name, productId }
 * 
 * Stages are: 1x2, 1x4, 1x8, 1x16, 1x32, 1x64,
 *             2x2, 2x4, 2x8, ..., 8x64
 */
export const generateMicrochipStages = () => {
  const stages = [];
  
  for (let outer = 1; outer <= 8; outer++) {
    for (let innerPower = 1; innerPower <= 6; innerPower++) {
      const inner = Math.pow(2, innerPower); // 2^n: 2, 4, 8, 16, 32, 64
      const name = outer === 1 
        ? `${inner}x Microchip` 
        : `${outer}x${inner}x Microchip`;
      const productId = outer === 1 
        ? `p_${inner}x_microchip` 
        : `p_${outer}x${inner}x_microchip`;
      
      stages.push({
        outerStage: outer,
        innerStage: inner,
        innerPower: innerPower,
        name,
        productId,
      });
    }
  }
  
  return stages;
};

// Export all stages
export const MICROCHIP_STAGES = generateMicrochipStages();

/**
 * Get microchip stage info by product ID
 */
export const getMicrochipStage = (productId) => {
  return MICROCHIP_STAGES.find(s => s.productId === productId);
};

/**
 * Calculate logic assembler metrics for a given microchip stage
 * 
 * Formula for total stages:
 * totalStages = log2(innerStage) + (outerStage - 1) × 6
 * 
 * Example: 2x4x Microchip
 *   - log2(4) = 2
 *   - (2 - 1) × 6 = 6
 *   - Total: 2 + 6 = 8 stages
 */
export const calculateLogicAssemblerMetrics = (productId, machineOilEnabled, tickCircuitDelay = 0) => {
  const stage = getMicrochipStage(productId);
  if (!stage) return null;
  
  const outerStage = stage.outerStage;
  const innerStage = stage.innerStage;
  
  // Calculate total stages using the formula
  const innerPower = Math.log2(innerStage);
  const totalStages = innerPower + (outerStage - 1) * 6;
  
  // Each stage has 4 steps
  const totalSteps = STEPS_PER_STAGE * totalStages;
  
  // Step time varies based on machine oil
  const avgStepTime = machineOilEnabled ? AVG_STEP_TIME_WITH_OIL : AVG_STEP_TIME;
  
  // Cycle time formula: totalStages × 4 × (avgStepTime + tickCircuitDelay/30) + 10
  // tickCircuitDelay is in ticks; 1 tick = 1/30 second
  const tickCircuitDelayInSeconds = tickCircuitDelay / 30;
  const cycleTime = totalStages * STEPS_PER_STAGE * (avgStepTime + tickCircuitDelayInSeconds) + BASE_CYCLE_TIME;
  
  // Material requirements scale with total stages
  const BASE_MATERIALS = {
    logic_plates: 3,
    copper_wires: 12,
    semiconductors: 3,
    gold_wires: 6,
  };
  
  const logicPlates = BASE_MATERIALS.logic_plates * totalStages;
  const copperWires = BASE_MATERIALS.copper_wires * totalStages;
  const semiconductors = BASE_MATERIALS.semiconductors * totalStages;
  const goldWires = BASE_MATERIALS.gold_wires * totalStages;
  
  // Inputs are quantities consumed per cycle
  const inputs = [
    { product_id: 'p_logic_plate', quantity: logicPlates },
    { product_id: 'p_copper_wire', quantity: copperWires },
    { product_id: 'p_semiconductor', quantity: semiconductors },
    { product_id: 'p_gold_wire', quantity: goldWires },
  ];
  
  // Add machine oil if enabled: 0.3/s × cycle time
  if (machineOilEnabled) {
    inputs.push({ 
      product_id: 'p_machine_oil', 
      quantity: parseFloat((MACHINE_OIL_RATE * cycleTime).toFixed(6)) 
    });
  }
  
  // Output is always 1x of the target microchip per cycle
  const outputs = [
    { product_id: productId, quantity: 1 }
  ];
  
  // Average power = 500kMF ÷ avgStepTime (MF/s)
  const avgPowerConsumption = POWER_STORAGE_REQUIREMENT / avgStepTime;
  
  // Max power = 500kMF ÷ quickestStepTime
  const quickestStepTime = machineOilEnabled ? 0.8 : 4;
  const maxPowerConsumption = POWER_STORAGE_REQUIREMENT / quickestStepTime;
  
  return {
    outerStage,
    innerStage: stage.innerStage,
    totalStages,
    totalSteps,
    avgStepTime,
    cycleTime,
    inputs,
    outputs,
    avgPowerConsumption, // in MF/s
    maxPowerConsumption, // in MF/s
    logicPlates,
    copperWires,
    semiconductors,
    goldWires,
  };
};

/**
 * Build inputs array for logic assembler with calculated quantities
 */
export const buildLogicAssemblerInputs = (productId, machineOilEnabled) => {
  const metrics = calculateLogicAssemblerMetrics(productId, machineOilEnabled, 0);
  if (!metrics) {
    return [
      { product_id: 'p_logic_plate', quantity: 'Variable' },
      { product_id: 'p_copper_wire', quantity: 'Variable' },
      { product_id: 'p_semiconductor', quantity: 'Variable' },
      { product_id: 'p_gold_wire', quantity: 'Variable' },
    ];
  }
  
  return metrics.inputs;
};

/**
 * Build outputs array for logic assembler with calculated quantities
 */
export const buildLogicAssemblerOutputs = (productId, machineOilEnabled) => {
  const metrics = calculateLogicAssemblerMetrics(productId, machineOilEnabled, 0);
  if (!metrics) {
    return [{ product_id: 'p_variableproduct', quantity: 'Variable' }];
  }
  
  return metrics.outputs;
};

// Default logic assembler recipe template (all values variable until configured)
export const DEFAULT_LOGIC_ASSEMBLER_RECIPE = {
  id: 'r_logic_assembler',
  name: 'Logic Assembler',
  machine_id: 'm_logic_assembler',
  cycle_time: 'Variable',
  power_consumption: 'Variable',
  pollution: 0,
  inputs: [
    { product_id: 'p_logic_plate', quantity: 'Variable' },
    { product_id: 'p_copper_wire', quantity: 'Variable' },
    { product_id: 'p_semiconductor', quantity: 'Variable' },
    { product_id: 'p_gold_wire', quantity: 'Variable' },
  ],
  outputs: [
    { product_id: 'p_variableproduct', quantity: 'Variable' }
  ],
  isLogicAssembler: true
};