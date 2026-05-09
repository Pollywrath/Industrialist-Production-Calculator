import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const coolantId: string = 'p_distilled_water';
const tempWater: number = 18;
const tempCoolant: number = 240;
const flowWater: number = 3;
const flowCoolant: number = 3;
const tempHXCurrent: number = 18;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

const getWetbulbTarget = (tempWater: number): number =>
  tempWater - 18 >= 18 ? tempWater - 18 : 18;

const getAverageTemp = (
  flowWater: number,
  flowCoolant: number,
  tempWater: number,
  tempCoolant: number,
): number =>
  round((flowCoolant * tempCoolant + flowWater * tempWater) / (flowWater + flowCoolant), 2);

const getEquilibriumTemp = (
  flowWater: number,
  flowCoolant: number,
  tempWater: number,
  tempCoolant: number,
  tempHX: number,
): number => {
  const wetbulbTarget = getWetbulbTarget(tempWater);
  const averageTemp = getAverageTemp(flowWater, flowCoolant, tempWater, tempCoolant);

  if (flowWater + flowCoolant === 0) return 18;
  if (flowCoolant === 0) return wetbulbTarget;
  if (tempHX < 100) return tempCoolant;
  if (averageTemp >= 100) return averageTemp;
  if (flowCoolant > 0) return tempCoolant;
  return 18;
};

const tempHXEquilibrium = getEquilibriumTemp(
  flowWater,
  flowCoolant,
  tempWater,
  tempCoolant,
  tempHXCurrent,
);
const steamTemp = round(tempHXEquilibrium, 2);
const coolantOutTemp = round(tempHXEquilibrium * 0.9, 2);

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

export default recipes;
