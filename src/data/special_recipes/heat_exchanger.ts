import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';


export interface SteadyStateInputs {
  coolantSourceTemp: number;
  waterSourceTemp: number;
}

export interface SteadyStateOutputs {
  hx: number;
  coolantOut: number;
  steam: number;
  isBoiling: boolean;
}

const k = 2 / 15;
const Kc = 2.2 * k;

export function calculateSinkSteadyState(inputs: SteadyStateInputs): SteadyStateOutputs {
  const { coolantSourceTemp: Tc, waterSourceTemp: Tw } = inputs;

  const predictedHx = (2.2 * (1 - k) * Tc + Tw) / (3.2 - 2.2 * k);
  const hxPrime = predictedHx + (Tc - predictedHx) * Kc;
  const predictedCoolantOut = Tc - (Tc - predictedHx) * 2.2 - hxPrime * 0.25;

  return {
    hx: Math.max(18, predictedHx),
    coolantOut: Math.max(18, predictedCoolantOut),
    steam: Math.max(18, hxPrime),
    isBoiling: Math.max(18, predictedHx) >= 100
  };
}


const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export const heat_exchanger_standard: SpecialRecipe = {
  id: 'r_heat_exchanger_01',
  name: 'Standard',
  machine_id: 'm_heat_exchanger',
  description: 'Feed distilled water and coolant into the heat exchanger. Coolant heats the water to produce high pressure steam.',
  settings: {
    water_temp: {
      type: 'number',
      label: 'Water Temperature (°C)',
      default: 18,
    },
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temperature (°C)',
      default: 330,
    },
    heat_loss: {
      type: 'number',
      label: 'Heat Loss (°C) (output clamped to 18°C)',
      default: 1,
      min: 0,
    },
    coolant_type: {
      type: 'select',
      label: 'Coolant Type',
      default: 'p_distilled_water',
      options: [
        { label: 'Distilled Water', value: 'p_distilled_water' },
        { label: 'Contaminated Water', value: 'p_contaminated_water' },
      ],
    },
  },
  inputTemperatureSettings: {
    0: 'water_temp',
    1: 'coolant_temp',
  },
  compute: (settings, _globalSettings, _nodeId, helpers) => {
    let resolvedCoolant = settings.coolant_type as string;
    if (helpers?.hasConnection('input', 1)) {
      resolvedCoolant = helpers.resolveProduct('input', 1) || resolvedCoolant;
    } else if (helpers?.hasConnection('output', 0)) {
      resolvedCoolant = helpers.resolveProduct('output', 0) || resolvedCoolant;
    }

    const waterTemp = (settings.water_temp as number) ?? 18;
    const coolantTemp = (settings.coolant_temp as number) ?? 330;
    const heatLoss = (settings.heat_loss as number) ?? 1;

    const { hx, coolantOut, steam, isBoiling } = calculateSinkSteadyState({
      coolantSourceTemp: coolantTemp,
      waterSourceTemp: waterTemp,
    });

    const steamQty = isBoiling ? 12000 : helpers ? 0 : 12000;

    const recipe: Recipe = {
      id: 'r_heat_exchanger_01',
      name: 'Standard',
      machine_id: 'm_heat_exchanger',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_distilled_water', quantity: 400 },
        { product_id: resolvedCoolant, quantity: 400 },
      ],
      outputs: [
        {
          product_id: resolvedCoolant,
          quantity: 400,
          temperature: Math.max(18, round(coolantOut - heatLoss)),
        },
        {
          product_id: 'p_high_pressure_steam',
          quantity: steamQty,
          temperature: Math.max(18, round(steam - heatLoss)),
        },
      ],
      runtime: {
        hxTemp: round(hx, 1),
      },
    };

    return recipe;
  },
};

