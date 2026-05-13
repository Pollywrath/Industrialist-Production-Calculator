// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const tempWater: number = 21;
const tempCoolant: number = 330;
const flowWater: number = 400;
const flowCoolant: number = 400;
const tempHXCurrent: number = 21;

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
    id: 'r_vertical_heat_exchanger_01',
    name: 'Makes High Pressure Steam, Distilled Water',
    machine_id: 'm_vertical_heat_exchanger',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'HV',
    pollution: 0,
    inputs: [
      { product_id: 'p_distilled_water', quantity: flowCoolant },
      { product_id: 'p_distilled_water', quantity: flowWater },
    ],
    outputs: [
      {
        product_id: 'p_distilled_water',
        quantity: flowCoolant,
        temperature: coolantOutTemp,
      },
      {
        product_id: 'p_high_pressure_steam',
        quantity: flowWater * 30,
        temperature: steamTemp,
      },
    ],
  },
  {
    id: 'r_vertical_heat_exchanger_02',
    name: 'Makes High Pressure Steam, Contaminated Water',
    machine_id: 'm_vertical_heat_exchanger',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'HV',
    pollution: 0,
    inputs: [
      { product_id: 'p_contaminated_water', quantity: flowCoolant },
      { product_id: 'p_distilled_water', quantity: flowWater },
    ],
    outputs: [
      {
        product_id: 'p_contaminated_water',
        quantity: flowCoolant,
        temperature: coolantOutTemp,
      },
      {
        product_id: 'p_high_pressure_steam',
        quantity: flowWater * 30,
        temperature: steamTemp,
      },
    ],
  },
];

export { recipes };
