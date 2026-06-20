import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { roundTo } from '../../utils/precision';

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
    isBoiling: Math.max(18, predictedHx) >= 100,
  };
}

export const vertical_heat_exchanger_distilled_water: SpecialRecipe = {
  id: 'r_vertical_heat_exchanger_01',
  name: 'Distilled Water Coolant',
  machine_id: 'm_vertical_heat_exchanger',
  description:
    'Feed distilled water and distilled water into the vertical heat exchanger. Coolant heats the water to produce high pressure steam.',
  settings: {
    water_temp: {
      type: 'number',
      label: 'Water Temperature (°C)',
      default: 18,
      min: -273.15,
    },
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temperature (°C)',
      default: 330,
      min: -273.15,
    },
    heat_loss: {
      type: 'number',
      label: 'Heat Loss (°C) (output clamped to 18°C)',
      default: 1,
      min: 0,
    },
  },
  inputTemperatureSettings: {
    0: 'water_temp',
    1: 'coolant_temp',
  },
  compute: (settings, _globalSettings, _nodeId, helpers) => {
    const waterTemp = (settings.water_temp as number) ?? 18;
    const coolantTemp = (settings.coolant_temp as number) ?? 330;
    const heatLoss = (settings.heat_loss as number) ?? 1;

    const { hx, coolantOut, steam, isBoiling } = calculateSinkSteadyState({
      coolantSourceTemp: coolantTemp,
      waterSourceTemp: waterTemp,
    });

    const steamQty = isBoiling ? 12000 : helpers ? 0 : 12000;

    const recipe: Recipe = {
      id: 'r_vertical_heat_exchanger_01',
      name: 'Distilled Water Coolant',
      machine_id: 'm_vertical_heat_exchanger',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_distilled_water', quantity: 400 },
        { product_id: 'p_distilled_water', quantity: 400, product_link_id: 'coolant' },
      ],
      outputs: [
        {
          product_id: 'p_distilled_water',
          quantity: 400,
          temperature: Math.max(18, roundTo(coolantOut - heatLoss, 2)),
          product_link_id: 'coolant',
        },
        {
          product_id: 'p_high_pressure_steam',
          quantity: steamQty,
          temperature: Math.max(18, roundTo(steam - heatLoss, 2)),
        },
      ],
      runtime: {
        hxTemp: roundTo(hx, 1),
      },
    };

    return recipe;
  },
};

export const vertical_heat_exchanger_contaminated_water: SpecialRecipe = {
  id: 'r_vertical_heat_exchanger_02',
  name: 'Contaminated Water Coolant',
  machine_id: 'm_vertical_heat_exchanger',
  description:
    'Feed distilled water and contaminated water into the vertical heat exchanger. Coolant heats the water to produce high pressure steam.',
  settings: {
    water_temp: {
      type: 'number',
      label: 'Water Temperature (°C)',
      default: 18,
      min: -273.15,
    },
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temperature (°C)',
      default: 330,
      min: -273.15,
    },
    heat_loss: {
      type: 'number',
      label: 'Heat Loss (°C) (output clamped to 18°C)',
      default: 1,
      min: 0,
    },
  },
  inputTemperatureSettings: {
    0: 'water_temp',
    1: 'coolant_temp',
  },
  compute: (settings, _globalSettings, _nodeId, helpers) => {
    const waterTemp = (settings.water_temp as number) ?? 18;
    const coolantTemp = (settings.coolant_temp as number) ?? 330;
    const heatLoss = (settings.heat_loss as number) ?? 1;

    const { hx, coolantOut, steam, isBoiling } = calculateSinkSteadyState({
      coolantSourceTemp: coolantTemp,
      waterSourceTemp: waterTemp,
    });

    const steamQty = isBoiling ? 12000 : helpers ? 0 : 12000;

    const recipe: Recipe = {
      id: 'r_vertical_heat_exchanger_02',
      name: 'Contaminated Water Coolant',
      machine_id: 'm_vertical_heat_exchanger',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_distilled_water', quantity: 400 },
        { product_id: 'p_contaminated_water', quantity: 400, product_link_id: 'coolant' },
      ],
      outputs: [
        {
          product_id: 'p_contaminated_water',
          quantity: 400,
          temperature: Math.max(18, roundTo(coolantOut - heatLoss, 2)),
          product_link_id: 'coolant',
        },
        {
          product_id: 'p_high_pressure_steam',
          quantity: steamQty,
          temperature: Math.max(18, roundTo(steam - heatLoss, 2)),
        },
      ],
      runtime: {
        hxTemp: roundTo(hx, 1),
      },
    };

    return recipe;
  },
};
