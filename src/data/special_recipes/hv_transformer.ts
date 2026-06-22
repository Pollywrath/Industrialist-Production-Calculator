import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getPowerTypeForDirection } from '../../utils/recipePower';

type Direction = 'mv_to_hv' | 'hv_to_mv';
type Coolant = 'none' | 'water' | 'machine_oil';

const settingDefinitions = {
  direction: {
    type: 'select' as const,
    label: 'Direction',
    default: 'mv_to_hv',
    options: [
      { label: 'MV to HV', value: 'mv_to_hv' },
      { label: 'HV to MV', value: 'hv_to_mv' },
    ],
  },
  input_power: {
    type: 'number' as const,
    label: 'Input Power',
    default: 100000,
    min: 0,
    max: 240000000
  },
  coolant: {
    type: 'select' as const,
    label: 'Coolant',
    default: 'none',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Water', value: 'water' },
      { label: 'Machine Oil', value: 'machine_oil' },
    ],
  },
};

function readDirection(value: unknown): Direction {
  return value === 'hv_to_mv' ? 'hv_to_mv' : 'mv_to_hv';
}

function readCoolant(value: unknown): Coolant {
  if (value === 'water' || value === 'machine_oil') {
    return value;
  }
  return 'none';
}

function getLossRate(coolant: Coolant): number {
  if (coolant === 'machine_oil') return 0.01;
  if (coolant === 'water') return 0.06;
  return 0.15;
}

function getCoolantInputs(coolant: Coolant): Recipe['inputs'] {
  if (coolant === 'water') {
    return [{ product_id: 'p_water', quantity: 1 }];
  }
  if (coolant === 'machine_oil') {
    return [{ product_id: 'p_machine_oil', quantity: 0.5 }];
  }
  return [];
}

export const hv_transformer_01: SpecialRecipe = {
  id: 'r_hv_transformer_01',
  name: 'Converts Power',
  machine_id: 'm_hv_transformer',
  settings: settingDefinitions,
  compute: (settings) => {
    const direction = readDirection(settings.direction);
    const coolant = readCoolant(settings.coolant);
    const inputPower = Math.max(0, (settings.input_power as number) ?? 100000);
    const outputPower = inputPower * (1 - getLossRate(coolant));
    const conversionLoss = inputPower - outputPower;
    const { inputType, outputType } = getPowerTypeForDirection(direction);

    const recipe: Recipe = {
      id: 'r_hv_transformer_01',
      name: direction === 'mv_to_hv' ? 'Converts MV to HV' : 'Converts HV to MV',
      machine_id: 'm_hv_transformer',
      cycle_time: 1,
      power_consumption: 0,
      power_type: inputType,
      powerEffects: [
        {
          power_type: inputType,
          power_consumption: inputPower,
          label: 'Input',
        },
        {
          power_type: outputType,
          power_consumption: -outputPower,
          label: 'Output',
        },
      ],
      powerAccountingEffects: [
        {
          power_type: outputType,
          power_consumption: -conversionLoss,
          label: 'Conversion Loss',
          accounting: 'production_delta',
        },
      ],
      pollution: 0,
      inputs: getCoolantInputs(coolant),
      outputs: [],
    };

    return recipe;
  },
};
