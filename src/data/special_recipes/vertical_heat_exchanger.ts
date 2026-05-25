import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

// ─── STEADY STATE FORMULAS ─────────────────────────────────────────────

export interface SteadyStateInputs {
  coolantSourceTemp: number;  // Tc - Coolant source temperature
  waterSourceTemp: number;    // Tw - Distilled water source temperature
}

export interface SteadyStateOutputs {
  hx: number;           // Predicted heat exchanger temperature
  coolantOut: number;   // Predicted coolant output temperature
  steam: number;        // Predicted steam temperature
  isBoiling: boolean;   // Whether HX temp is >= 100
}

// Constants derived from simulator physics
const k = 2 / 15;           // ≈ 0.1333
const Kc = 2.2 * k;         // ≈ 0.2933

/**
 * Calculate steady state temperatures for SINK routing method
 * Coolant output is discarded, no recirculation or preheating
 */
export function calculateSinkSteadyState(inputs: SteadyStateInputs): SteadyStateOutputs {
  const { coolantSourceTemp: Tc, waterSourceTemp: Tw } = inputs;

  // Predicted HX temperature
  // Formula: (2.2 * (1 - k) * Tc + Tw) / (3.2 - 2.2 * k)
  const predictedHx = (2.2 * (1 - k) * Tc + Tw) / (3.2 - 2.2 * k);

  // Steam temperature (hxPrime)
  // Formula: predictedHx + (Tc - predictedHx) * Kc
  const hxPrime = predictedHx + (Tc - predictedHx) * Kc;

  // Coolant output temperature
  // Formula: Tc - (Tc - predictedHx) * 2.2 - hxPrime * 0.25
  const predictedCoolantOut = Tc - (Tc - predictedHx) * 2.2 - hxPrime * 0.25;

  return {
    hx: Math.max(18, predictedHx),
    coolantOut: Math.max(18, predictedCoolantOut),
    steam: Math.max(18, hxPrime),
    isBoiling: Math.max(18, predictedHx) >= 100
  };
}

/**
 * Calculate steady state temperatures for PREHEAT routing method
 * Coolant output returns to water buffer to preheat distilled water
 */
export function calculatePreheatSteadyState(inputs: SteadyStateInputs): SteadyStateOutputs {
  const { coolantSourceTemp: Tc } = inputs;

  // Predicted HX temperature
  // Formula: Tc * (1 - 1.25 * Kc) / (1.25 - 1.25 * Kc)
  const predictedHx = Tc * (1 - 1.25 * Kc) / (1.25 - 1.25 * Kc);

  // Steam temperature (hxPrime)
  // Formula: predictedHx + (Tc - predictedHx) * Kc
  const hxPrime = predictedHx + (Tc - predictedHx) * Kc;

  // Coolant output temperature
  // Formula: Tc - (Tc - predictedHx) * 2.2 - hxPrime * 0.25
  const predictedCoolantOut = Tc - (Tc - predictedHx) * 2.2 - hxPrime * 0.25;

  return {
    hx: Math.max(18, predictedHx),
    coolantOut: Math.max(18, predictedCoolantOut),
    steam: Math.max(18, hxPrime),
    isBoiling: Math.max(18, predictedHx) >= 100
  };
}

// ─── SPECIAL RECIPES ───────────────────────────────────────────────────

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export const vertical_heat_exchanger_standard: SpecialRecipe = {
  id: 'r_vertical_heat_exchanger_01',
  name: 'Standard',
  machine_id: 'm_vertical_heat_exchanger',
  description: 'Feed distilled water and coolant into the vertical heat exchanger. Coolant heats the water to produce high pressure steam.',
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
      label: 'Heat Loss (°C)',
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
      id: 'r_vertical_heat_exchanger_01',
      name: 'Standard',
      machine_id: 'm_vertical_heat_exchanger',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'HV',
      pollution: 0,
      inputs: [
        { product_id: 'p_distilled_water', quantity: 400 },
        { product_id: resolvedCoolant, quantity: 400 },
      ],
      outputs: [
        {
          product_id: resolvedCoolant,
          quantity: 400,
          temperature: round(coolantOut - heatLoss),
        },
        {
          product_id: 'p_high_pressure_steam',
          quantity: steamQty,
          temperature: round(steam - heatLoss),
        },
      ],
      runtime: {
        hxTemp: round(hx, 1),
      },
    };

    return recipe;
  },
};

export const vertical_heat_exchanger_preheat: SpecialRecipe = {
  id: 'r_vertical_heat_exchanger_02',
  name: 'Preheat',
  machine_id: 'm_vertical_heat_exchanger',
  description: 'Connect coolant output to water input. Only distilled water works as coolant - it heats itself to produce high pressure steam.',
  settings: {
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temperature (°C)',
      default: 330,
    },
    heat_loss: {
      type: 'number',
      label: 'Heat Loss (°C)',
      default: 1,
      min: 0,
    },
  },
  inputTemperatureSettings: {
    0: 'coolant_temp',
  },
  compute: (settings, _globalSettings, _nodeId, _helpers) => {
    const coolantTemp = (settings.coolant_temp as number) ?? 330;
    const heatLoss = (settings.heat_loss as number) ?? 1;

    const { hx, steam, isBoiling } = calculatePreheatSteadyState({
      coolantSourceTemp: coolantTemp,
      waterSourceTemp: 18,
    });

    const steamQty = isBoiling ? 12000 : _helpers ? 0 : 12000;

    const recipe: Recipe = {
      id: 'r_vertical_heat_exchanger_02',
      name: 'Preheat',
      machine_id: 'm_vertical_heat_exchanger',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'HV',
      pollution: 0,
      inputs: [{ product_id: 'p_distilled_water', quantity: 400 }],
      outputs: [
        {
          product_id: 'p_high_pressure_steam',
          quantity: steamQty,
          temperature: round(steam - heatLoss),
        },
      ],
      runtime: {
        hxTemp: round(hx, 1),
      },
    };

    return recipe;
  },
};
