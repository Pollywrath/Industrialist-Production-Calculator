import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';

function calculateGrowthModifier(pollution: number): number {
  let growthModifier: number;

  if (pollution > 0) {
    growthModifier = 1 + 0.005 * pollution - 0.0001 * pollution * pollution;
  } else if (pollution < -60) {
    growthModifier = 0.005 * pollution + 1.25;
  } else {
    growthModifier = 1;
  }

  return Math.max(0.5, Math.min(1.2, growthModifier));
}

function calculateGrowthTime(pollution: number): number {
  const growthModifier = calculateGrowthModifier(pollution);
  const P = 4500;

  let total = 0;
  for (let n = 7; n <= 11; n++) {
    const value = Math.ceil((P / growthModifier) / (n * 100));
    total += value;
  }

  const totalGrowthTime = (40 / 3) * total;

  return Math.round(totalGrowthTime * 100) / 100;
}

function calculateHarvestersNeeded(numTrees: number, pollution: number): number {
  const growthModifier = calculateGrowthModifier(pollution);
  const P = 4500;

  const growthHarvester = 2 * (1000 / 30) * Math.ceil((P / growthModifier) / 1000);
  const harvester = Math.ceil(numTrees / (3 * growthHarvester / (1000 / 30)));

  return harvester;
}

function calculateLogsPerSecond(numTrees: number, growthTime: number): number {
  return (numTrees * 2) / growthTime;
}

const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

export const tree_farm_01: SpecialRecipe = {
  id: 'r_tree_farm_01',
  name: 'Tree Farm',
  machine_id: 'm_tree_farm',
  description: 'Modular tree farm for producing oak logs. Configure trees, harvesters, sprinklers, and outputs.',
  settings: {
    tree_count: {
      type: 'number',
      label: 'Tree Count',
      default: 600,
      min: 1,
      max: 650,
      step: 1,
      dynamicLabel: (settings, globalSettings) => {
        const treeCount = (settings.tree_count as number) ?? 450;
        const pollution = (globalSettings?.global_pollution as number) ?? 10;
        const growthTime = calculateGrowthTime(pollution);
        const logsPerSecond = calculateLogsPerSecond(treeCount, growthTime);
        const treesPerSecond = treeCount / growthTime;
        return `Tree Count - Oak logs/s: ${round(logsPerSecond, 3)}, Trees/s: ${round(treesPerSecond, 3)}`;
      },
    },
    harvester_count: {
      type: 'number',
      label: 'Harvester Count',
      default: 20,
      min: 1,
      max: 30,
      step: 1,
      dynamicLabel: (settings, globalSettings) => {
        const treeCount = (settings.tree_count as number) ?? 450;
        const harvesterCount = (settings.harvester_count as number) ?? 20;
        const pollution = (globalSettings?.global_pollution as number) ?? 10;
        const minHarvesters = calculateHarvestersNeeded(treeCount, pollution);
        const harvestRate = harvesterCount / 11;
        return `Harvester Count - Min harvesters: ${minHarvesters}, Harvest rate: ${round(harvestRate, 3)}/s`;
      },
    },
    sprinkler_count: {
      type: 'number',
      label: 'Sprinkler Count',
      default: 24,
      min: 1,
      max: 100,
      step: 1,
      dynamicLabel: (settings) => {
        const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
        const waterTanks = Math.ceil(sprinklerCount / 3);
        return `Sprinkler Count - Water tanks needed: ${waterTanks}`;
      },
    },
    outputs_count: {
      type: 'number',
      label: 'Output Count',
      default: 8,
      min: 1,
      max: 20,
      step: 1,
    },
  },
  compute: (settings, globalSettings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const pollution = (globalSettings?.global_pollution as number) ?? 10;

    const growthTime = calculateGrowthTime(pollution);
    const treesPerSecond = treeCount / growthTime;
    const maxHarvestRate = harvesterCount / 11;
    const actualHarvestRate = Math.min(treesPerSecond, maxHarvestRate);
    const powerConsumption = actualHarvestRate * (200000 / 11);
    const waterConsumption = sprinklerCount * (33 / (100 / 3));

    const recipe: Recipe = {
      id: 'r_tree_farm_01',
      name: `${treeCount} Tree Farm`,
      machine_id: 'm_tree_farm',
      cycle_time: 1,
      power_consumption: round(powerConsumption),
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: waterConsumption }],
      outputs: [{ product_id: 'p_oak_log', quantity: round(actualHarvestRate * 2), temperature: 18 }],
    };

    return recipe;
  },
  computeMachineCost: (settings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const outputsCount = (settings.outputs_count as number) ?? 8;

    const waterTanks = Math.ceil(sprinklerCount / 3);

    const getCost = (id: string) => getMachine(id)?.cost ?? 0;

    const totalCost =
      getCost('m_tree_farm_controller') +
      getCost('m_tree') * treeCount +
      getCost('m_farm_harvester') * harvesterCount +
      getCost('m_tree_farm_sprinkler') * sprinklerCount +
      getCost('m_tree_farm_water_tank') * waterTanks +
      getCost('m_tree_farm_output') * outputsCount;

    return totalCost;
  },
  computeModelCount: (settings, globalSettings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const outputsCount = (settings.outputs_count as number) ?? 8;
    const pollution = (globalSettings?.global_pollution as number) ?? 10;

    const growthTime = calculateGrowthTime(pollution);
    const treesPerSecond = treeCount / growthTime;
    const maxHarvestRate = harvesterCount / 11;
    const actualHarvestRate = Math.min(treesPerSecond, maxHarvestRate);
    const powerConsumption = actualHarvestRate * (200000 / 11);

    const waterTanks = Math.ceil(sprinklerCount / 3);
    const additionalPowerModels = Math.ceil(powerConsumption / 1500000);

    return (
      treeCount +
      harvesterCount +
      1 +
      sprinklerCount +
      waterTanks * 2 +
      outputsCount * 2 +
      additionalPowerModels
    );
  },
};
