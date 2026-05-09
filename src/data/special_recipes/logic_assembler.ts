// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const TARGET_CHIP: string = 'p_8x64x_microchip';
const HAS_MACHINE_OIL: boolean = true;
const TICK_CIRCUIT_DELAY: number = 2;
const INPUT_ORDER: string[] = ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire'];

// ─── DATA TABLES ──────────────────────────────────────────────────
const CORRECT_ORDER = ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire'];

const MATERIALS_PER_STAGE: Record<string, number> = {
  p_logic_plate: 3,
  p_copper_wire: 12,
  p_semiconductor: 3,
  p_gold_wire: 6,
};

const STEPS_PER_STAGE = 4;
const AVG_STEP_TIME = 20;
const AVG_STEP_TIME_WITH_OIL = 4;
const BASE_CYCLE_TIME = 10;
const MACHINE_OIL_RATE = 0.3;

interface ChipStage {
  outerStage: number;
  innerStage: number;
  innerPower: number;
  name: string;
  productId: string;
}

const generateChipStages = (): ChipStage[] => {
  const stages: ChipStage[] = [];

  for (let innerPower = 1; innerPower <= 6; innerPower++) {
    const inner = Math.pow(2, innerPower);
    stages.push({
      outerStage: 1,
      innerStage: inner,
      innerPower,
      name: `${inner}x Microchip`,
      productId: `p_${inner}x_microchip`,
    });
  }

  for (let outer = 2; outer <= 8; outer++) {
    stages.push({
      outerStage: outer,
      innerStage: 64,
      innerPower: 6,
      name: `${outer}x64x Microchip`,
      productId: `p_${outer}x64x_microchip`,
    });
  }

  return stages;
};

const CHIP_STAGES = generateChipStages();

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const stage = CHIP_STAGES.find((s) => s.productId === TARGET_CHIP);
if (!stage) {
  throw new Error(
    `Invalid TARGET_CHIP: ${TARGET_CHIP}. This machine only supports 1x2x-1x64x and 2x64x-8x64x tiers.`,
  );
}

const totalStages = stage.innerPower + (stage.outerStage - 1) * 6;
const totalSteps = STEPS_PER_STAGE * totalStages;

const avgStepTime = HAS_MACHINE_OIL ? AVG_STEP_TIME_WITH_OIL : AVG_STEP_TIME;
const circuitDelaySeconds = TICK_CIRCUIT_DELAY / 6;
const cycleTime = totalSteps * (avgStepTime + circuitDelaySeconds) + BASE_CYCLE_TIME;

const isCorrectOrder = INPUT_ORDER.every((id, i) => id === CORRECT_ORDER[i]);
const scrapQuantity = totalStages - 1;

const inputs: { product_id: string; quantity: number }[] = CORRECT_ORDER.map((id) => ({
  product_id: id,
  quantity: (MATERIALS_PER_STAGE[id] * totalStages) / cycleTime,
}));

if (HAS_MACHINE_OIL) {
  inputs.push({ product_id: 'p_machine_oil', quantity: MACHINE_OIL_RATE });
}

const outputs: { product_id: string; quantity: number }[] = isCorrectOrder
  ? [{ product_id: TARGET_CHIP, quantity: 1 / cycleTime }]
  : [{ product_id: 'p_microchip_scrap', quantity: scrapQuantity / cycleTime }];

// ─── 3. EXPORT ───────────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: 'MV' | 'HV';
  pollution: number;
  inputs: { product_id: string; quantity: number }[];
  outputs: { product_id: string; quantity: number; temperature?: number }[];
}

const recipes: Recipe[] = [
  {
    id: 'r_logic_assembler_01',
    name: stage.name,
    machine_id: 'm_logic_assembler',
    cycle_time: 1,
    power_consumption: 3000000,
    power_type: 'MV',
    pollution: 0,
    inputs: inputs,
    outputs: outputs,
  },
];

export default recipes;
