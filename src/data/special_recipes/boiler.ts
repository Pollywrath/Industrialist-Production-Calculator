import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { roundTo } from '../../utils/precision';

export interface CoolantProperties {
  heatCapacity: number;
  efficiency: number;
}

export const AmbientTemp = 18.0;
export const BoilerCapacity = 75000;

export function getCoolantProperties(coolantId: string): CoolantProperties {
  let heatCapacity = 25;
  let efficiency = 1.0;

  if (coolantId === 'p_water') {
    heatCapacity = 1000;
    efficiency = 1.0;
  } else if (coolantId === 'p_hot_crude_oil') {
    heatCapacity = 80;
    efficiency = 1.0;
  } else if (coolantId === 'p_distilled_water') {
    heatCapacity = 1000;
    efficiency = 1.2;
  } else if (coolantId === 'p_filtered_water') {
    heatCapacity = 1000;
    efficiency = 1.1;
  }

  return { heatCapacity, efficiency };
}

export function computeStandardSteadyState(
  coolantId: string,
  coolantSourceTemp: number,
  waterSourceTemp: number,
) {
  const { heatCapacity, efficiency } = getCoolantProperties(coolantId);
  const cpEff = heatCapacity * efficiency;

  const M = (74 * cpEff) / BoilerCapacity;
  const Tb = (coolantSourceTemp * M + waterSourceTemp) / (1 + M);
  const Tb1 = Tb * (1 - cpEff / BoilerCapacity) + coolantSourceTemp * (cpEff / BoilerCapacity);

  let boilerTemp: number;
  let coolantOutTemp: number;
  let steamOutTemp = AmbientTemp;
  let isBoiling = false;

  if (Tb1 > 100) {
    boilerTemp = Tb;
    steamOutTemp = Tb1;
    isBoiling = true;

    let usedTemp: number;
    if (waterSourceTemp < coolantSourceTemp) {
      usedTemp = coolantSourceTemp - (coolantSourceTemp - Tb1) - coolantSourceTemp * 0.1;
    } else {
      usedTemp = coolantSourceTemp - (coolantSourceTemp - Tb1) - waterSourceTemp * 0.1;
    }
    coolantOutTemp = Math.max(AmbientTemp, usedTemp);
  } else {
    boilerTemp = Math.max(AmbientTemp, Tb1);
    let usedTemp: number;
    if (waterSourceTemp < coolantSourceTemp) {
      usedTemp = coolantSourceTemp - 0.1 * coolantSourceTemp;
    } else {
      usedTemp = coolantSourceTemp - 0.1 * waterSourceTemp;
    }
    coolantOutTemp = Math.max(AmbientTemp, usedTemp);
  }

  return {
    boilerTemp,
    coolantOutTemp,
    steamOutTemp,
    isBoiling,
  };
}

export function computeSelfHeatingSteadyState(waterSourceTemp: number) {
  const Tb = waterSourceTemp - 18.5;
  const Tb1 = Tb - 0.25;

  let boilerTemp: number;
  const coolantOutTemp = AmbientTemp;
  let steamOutTemp = AmbientTemp;
  let isBoiling = false;

  if (Tb1 > 100) {
    boilerTemp = Tb;
    steamOutTemp = Tb1;
    isBoiling = true;
  } else {
    boilerTemp = Math.max(AmbientTemp, Tb1);
  }

  return {
    boilerTemp,
    coolantOutTemp,
    steamOutTemp,
    isBoiling,
  };
}

export const boiler_standard: SpecialRecipe = {
  id: 'r_boiler_01',
  name: 'Standard',
  machine_id: 'm_boiler',
  description: 'Feed water and coolant into the boiler. Coolant heats the water to produce steam.',
  settings: {
    enable_coolant: {
      type: 'select',
      label: 'Enable Coolant',
      default: 'yes',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    },
    water_temp: {
      type: 'number',
      label: 'Water Temperature (°C)',
      default: 18,
      min: -273.15,
    },
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temperature (°C)',
      default: 240,
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
    const isCoolantEnabled = (settings.enable_coolant as string) !== 'no';
    const waterTemp = (settings.water_temp as number) ?? 18;
    const heatLoss = (settings.heat_loss as number) ?? 1;

    if (isCoolantEnabled) {
      let resolvedCoolant = 'any_fluid';
      if (helpers?.hasConnection('input', 1)) {
        resolvedCoolant = helpers.resolveProduct('input', 1) || 'any_fluid';
      } else if (helpers?.hasConnection('output', 0)) {
        resolvedCoolant = helpers.resolveProduct('output', 0) || 'any_fluid';
      }

      const coolantTemp = (settings.coolant_temp as number) ?? 240;

      const { boilerTemp, coolantOutTemp, steamOutTemp, isBoiling } = computeStandardSteadyState(
        resolvedCoolant,
        coolantTemp,
        waterTemp,
      );

      const steamQty = isBoiling ? 90 : helpers ? 0 : 90;

      const recipe: Recipe = {
        id: 'r_boiler_01',
        name: 'Standard',
        machine_id: 'm_boiler',
        cycle_time: 1,
        power_consumption: 0,
        power_type: 'MV',
        pollution: 0,
        inputs: [
          { product_id: 'p_water', quantity: 3 },
          { product_id: resolvedCoolant, quantity: 3, product_link_id: 'coolant' },
        ],
        outputs: [
          {
            product_id: resolvedCoolant,
            quantity: 3,
            temperature: Math.max(18, roundTo(coolantOutTemp - heatLoss, 2)),
            product_link_id: 'coolant',
          },
          {
            product_id: 'p_steam',
            quantity: steamQty,
            temperature: Math.max(18, roundTo(steamOutTemp - heatLoss, 2)),
          },
        ],
        runtime: {
          boilerTemp: roundTo(boilerTemp, 2),
        },
      };

      return recipe;
    } else {
      const { boilerTemp, steamOutTemp, isBoiling } = computeSelfHeatingSteadyState(waterTemp);

      const steamQty = isBoiling ? 90 : helpers ? 0 : 90;

      const recipe: Recipe = {
        id: 'r_boiler_01',
        name: 'Standard',
        machine_id: 'm_boiler',
        cycle_time: 1,
        power_consumption: 0,
        power_type: 'MV',
        pollution: 0,
        inputs: [
          { product_id: 'p_water', quantity: 3 },
        ],
        outputs: [
          {
            product_id: 'p_steam',
            quantity: steamQty,
            temperature: Math.max(18, roundTo(steamOutTemp - heatLoss, 2)),
          },
        ],
        runtime: {
          boilerTemp: roundTo(boilerTemp, 2),
        },
      };

      return recipe;
    }
  },
};
