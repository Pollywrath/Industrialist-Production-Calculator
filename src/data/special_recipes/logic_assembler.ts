import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

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

const settingDefinitions = {
  target_chip: {
    type: 'select' as const,
    label: 'Target Chip',
    default: 'p_2x_microchip',
    options: CHIP_STAGES.map((c) => ({ label: c.name, value: c.productId })),
  },
  has_machine_oil: {
    type: 'select' as const,
    label: 'Use Machine Oil?',
    default: 'No',
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  },
  fail_step: {
    type: 'select' as const,
    label: 'Fail Step?',
    default: 'No',
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  },
  tick_delay: {
    type: 'number' as const,
    label: 'Tick Delay',
    default: 2,
    min: 0,
    step: 1,
  },
};

const getComputedValues = (settings: Record<string, unknown>) => {
  const targetChip = (settings.target_chip as string) ?? 'p_8x64x_microchip';
  const hasMachineOil = (settings.has_machine_oil as string) === 'Yes';
  const failStep = (settings.fail_step as string) === 'Yes';
  const tickDelay = (settings.tick_delay as number) ?? 2;

  const stage = CHIP_STAGES.find((s) => s.productId === targetChip) || CHIP_STAGES[0];
  const totalStages = stage.innerPower + (stage.outerStage - 1) * 6;
  const totalSteps = STEPS_PER_STAGE * totalStages;

  const avgStepTime = hasMachineOil ? AVG_STEP_TIME_WITH_OIL : AVG_STEP_TIME;
  const circuitDelaySeconds = tickDelay / 6;
  const cycleTime = totalSteps * (avgStepTime + circuitDelaySeconds) + BASE_CYCLE_TIME;

  const scrapQuantity = totalStages - 1;

  return { cycleTime, totalStages, hasMachineOil, failStep, targetChip, scrapQuantity, stage };
};

export const logic_assembler_01: SpecialRecipe = {
  id: 'r_logic_assembler_01',
  name: 'Logic Assembler',
  machine_id: 'm_logic_assembler',
  settings: settingDefinitions,
  potentialOutputs: [...CHIP_STAGES.map((c) => c.productId), 'p_microchip_scrap'],
  potentialInputs: ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'],
  resolveSettings: (productId) => {
    if (productId === 'p_machine_oil') {
      return { has_machine_oil: 'Yes' };
    }

    if (productId === 'p_microchip_scrap') {
      return { fail_step: 'Yes' };
    }
    const stage = CHIP_STAGES.find((c) => c.productId === productId);
    if (stage) {
      return { target_chip: productId, fail_step: 'No' };
    }
    return null;
  },
  compute: (settings) => {
    const { cycleTime, totalStages, hasMachineOil, failStep, targetChip, scrapQuantity } =
      getComputedValues(settings);

    const inputsList = CORRECT_ORDER.map((id) => ({
      product_id: id,
      quantity: MATERIALS_PER_STAGE[id] * totalStages,
    }));

    if (hasMachineOil) {
      inputsList.push({ product_id: 'p_machine_oil', quantity: MACHINE_OIL_RATE * cycleTime });
    }

    const outputsList = failStep
      ? [{ product_id: 'p_microchip_scrap', quantity: scrapQuantity, temperature: 18 }]
      : [{ product_id: targetChip, quantity: 1, temperature: 18 }];

    const recipe: Recipe = {
      id: 'r_logic_assembler_01',
      name: 'Logic Assembler',
      machine_id: 'm_logic_assembler',
      cycle_time: cycleTime,
      power_consumption: 3000000,
      power_type: 'MV',
      pollution: 0,
      inputs: inputsList,
      outputs: outputsList,
    };

    return recipe;
  },
};
