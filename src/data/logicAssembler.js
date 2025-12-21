const STEPS_PER_STAGE = 4;
const AVG_STEP_TIME = 20;
const AVG_STEP_TIME_WITH_OIL = 4;
const POWER_STORAGE_REQUIREMENT = 500000;
const MACHINE_OIL_RATE = 0.3;
const BASE_CYCLE_TIME = 10;

const BASE_MATERIALS = {
  logic_plates: 3,
  copper_wires: 12,
  semiconductors: 3,
  gold_wires: 6,
};

export const generateMicrochipStages = () => {
  const stages = [];
  for (let outer = 1; outer <= 8; outer++) {
    for (let innerPower = 1; innerPower <= 6; innerPower++) {
      const inner = Math.pow(2, innerPower);
      const name = outer === 1 ? `${inner}x Microchip` : `${outer}x${inner}x Microchip`;
      const productId = outer === 1 ? `p_${inner}x_microchip` : `p_${outer}x${inner}x_microchip`;
      stages.push({ outerStage: outer, innerStage: inner, innerPower, name, productId });
    }
  }
  return stages;
};

export const MICROCHIP_STAGES = generateMicrochipStages();

export const getMicrochipStage = (productId) => MICROCHIP_STAGES.find(s => s.productId === productId);

export const calculateLogicAssemblerMetrics = (productId, machineOilEnabled, tickCircuitDelay = 0) => {
  const stage = getMicrochipStage(productId);
  if (!stage) return null;
  
  const innerPower = Math.log2(stage.innerStage);
  const totalStages = innerPower + (stage.outerStage - 1) * 6;
  const totalSteps = STEPS_PER_STAGE * totalStages;
  const avgStepTime = machineOilEnabled ? AVG_STEP_TIME_WITH_OIL : AVG_STEP_TIME;
  const tickCircuitDelayInSeconds = tickCircuitDelay / 30;
  const cycleTime = totalStages * STEPS_PER_STAGE * (avgStepTime + tickCircuitDelayInSeconds) + BASE_CYCLE_TIME;
  
  const logicPlates = BASE_MATERIALS.logic_plates * totalStages;
  const copperWires = BASE_MATERIALS.copper_wires * totalStages;
  const semiconductors = BASE_MATERIALS.semiconductors * totalStages;
  const goldWires = BASE_MATERIALS.gold_wires * totalStages;
  
  const inputs = [
    { product_id: 'p_logic_plate', quantity: logicPlates },
    { product_id: 'p_copper_wire', quantity: copperWires },
    { product_id: 'p_semiconductor', quantity: semiconductors },
    { product_id: 'p_gold_wire', quantity: goldWires },
  ];
  
  if (machineOilEnabled) {
    inputs.push({ product_id: 'p_machine_oil', quantity: parseFloat((MACHINE_OIL_RATE * cycleTime).toFixed(6)) });
  }
  
  const outputs = [{ product_id: productId, quantity: 1 }];
  const avgPowerConsumption = POWER_STORAGE_REQUIREMENT / avgStepTime;
  const maxPowerConsumption = POWER_STORAGE_REQUIREMENT / (machineOilEnabled ? 0.8 : 4);
  
  return {
    outerStage: stage.outerStage, innerStage: stage.innerStage, totalStages, totalSteps,
    avgStepTime, cycleTime, inputs, outputs, avgPowerConsumption, maxPowerConsumption,
    logicPlates, copperWires, semiconductors, goldWires
  };
};

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

export const buildLogicAssemblerOutputs = (productId, machineOilEnabled) => {
  const metrics = calculateLogicAssemblerMetrics(productId, machineOilEnabled, 0);
  if (!metrics) return [{ product_id: 'p_variableproduct', quantity: 'Variable' }];
  return metrics.outputs;
};

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
  outputs: [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
  isLogicAssembler: true
};