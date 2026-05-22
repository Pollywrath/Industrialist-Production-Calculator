import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const coolantId: string = 'p_distilled_water';
const tempWater: number = 18;
const tempCoolant: number = 240;
const flowWater: number = 3;
const flowCoolant: number = 3;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

const getEquilibriumTemp = (
  flowWater: number,
  flowCoolant: number,
  tempWater: number,
  tempCoolant: number,
): { boilerTemp: number; coolantOutTemp: number; steamTemp: number } => {
  const AmbientTemp = 18.0;
  const BoilerCapacity = 75000;

  // Resolve coolant characteristics
  let heatCapacity = 25;
  let efficiency = 1.0;
  if (coolantId === 'p_water') {
    heatCapacity = 1000;
    efficiency = 1.0
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

  const cpEff = heatCapacity * efficiency;

  let boilerTemp = AmbientTemp;
  let coolantOutTemp = AmbientTemp;
  let steamTemp = AmbientTemp;

  if (flowCoolant > 0 && flowWater > 0) {
    const M = (74 * cpEff) / BoilerCapacity;
    const Tb = (tempCoolant * M + tempWater) / (1 + M);
    const Tb1 = Tb * (1 - cpEff / BoilerCapacity) + tempCoolant * (cpEff / BoilerCapacity);

    if (Tb1 > 100) {
      boilerTemp = Tb;
      steamTemp = Tb1;

      let usedTemp = AmbientTemp;
      if (tempWater < tempCoolant) {
        usedTemp = tempCoolant - (tempCoolant - Tb1) - tempCoolant * 0.1;
      } else {
        usedTemp = tempCoolant - (tempCoolant - Tb1) - tempWater * 0.1;
      }
      coolantOutTemp = Math.max(AmbientTemp, usedTemp);
    } else {
      boilerTemp = tempCoolant;
      let usedTemp = AmbientTemp;
      if (tempWater < tempCoolant) {
        usedTemp = tempCoolant - 0.1 * tempCoolant;
      } else {
        usedTemp = tempCoolant - 0.1 * tempWater;
      }
      coolantOutTemp = Math.max(AmbientTemp, usedTemp);
      steamTemp = AmbientTemp;
    }
  } else if (flowCoolant > 0) {
    boilerTemp = tempCoolant;
    const waterTemp = AmbientTemp;
    let usedTemp = AmbientTemp;
    if (waterTemp < tempCoolant) {
      usedTemp = tempCoolant - 0.1 * tempCoolant;
    } else {
      usedTemp = tempCoolant - 0.1 * waterTemp;
    }
    coolantOutTemp = Math.max(AmbientTemp, usedTemp);
    steamTemp = AmbientTemp;
  } else if (flowWater > 0) {
    const Tb = tempWater - 18.5;
    const Tb1 = Tb - 0.25;
    if (Tb1 > 100) {
      boilerTemp = Tb;
      steamTemp = Tb1;
    } else {
      boilerTemp = AmbientTemp;
      steamTemp = AmbientTemp;
    }
    coolantOutTemp = AmbientTemp;
  } else {
    boilerTemp = AmbientTemp;
    coolantOutTemp = AmbientTemp;
    steamTemp = AmbientTemp;
  }

  return {
    boilerTemp,
    coolantOutTemp,
    steamTemp,
  };
};

const result = getEquilibriumTemp(
  flowWater,
  flowCoolant,
  tempWater,
  tempCoolant
);
const steamTemp = round(result.steamTemp, 2);
const coolantOutTemp = round(result.coolantOutTemp, 2);

const productList = products as Product[];
const foundCoolant = productList.find((p) => p.id === coolantId);
const isValid = foundCoolant && foundCoolant.type === 'Fluid' && flowWater > 0 && flowCoolant > 0;

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

const recipes: Recipe[] = isValid
  ? [
    {
      id: 'r_boiler_01',
      name: `Makes Steam`,
      machine_id: 'm_boiler',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_water', quantity: flowWater },
        { product_id: coolantId, quantity: flowCoolant },
      ],
      outputs: [
        {
          product_id: coolantId,
          quantity: flowCoolant,
          temperature: coolantOutTemp,
        },
        {
          product_id: 'p_steam',
          quantity: flowWater * 30,
          temperature: steamTemp,
        },
      ],
    },
  ]
  : [];

export { recipes };
