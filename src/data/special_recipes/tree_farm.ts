import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';
import { roundTo } from '../../utils/precision';

const DEFAULT_CONTROLLER_ID = 'm_tree_farm_controller';
const IGLOO_CONTROLLER_ID = 'm_igloo_farm_controller';
const DEFAULT_TREE_ID = 'm_tree';
const CANDY_CANE_TREE_ID = 'm_candy_cane_tree';
const BASE_LOGS_PER_TREE = 2;
const IGLOO_WINTER_LOG_MULTIPLIER = 1.5;
const CANDY_CANE_GROWTH_MULTIPLIER = 1.2;

const CONTROLLER_OPTIONS = [
  { label: 'Tree Farm Controller', value: DEFAULT_CONTROLLER_ID },
  { label: 'Igloo Farm Controller', value: IGLOO_CONTROLLER_ID },
];

const TREE_OPTIONS = [
  { label: 'Tree', value: DEFAULT_TREE_ID },
  { label: 'Classic Tree', value: 'm_classic_tree' },
  { label: 'Christmas Tree', value: 'm_christmas_tree' },
  { label: 'Candy Cane Tree', value: CANDY_CANE_TREE_ID },
];

function areVariantMachinesEnabled(globalSettings?: Record<string, unknown>): boolean {
  return globalSettings?.showVariantLimited === true;
}

function isMachineOptionAllowed(
  machineId: string,
  globalSettings?: Record<string, unknown>,
): boolean {
  const machine = getMachine(machineId);
  if (!machine) return false;

  const isVariant = machine.variant && machine.variant !== 'none' && machine.variant !== '';
  if (!isVariant && !machine.limited) return true;

  return areVariantMachinesEnabled(globalSettings);
}

function getControllerOptions(
  _settings: Record<string, unknown>,
  globalSettings?: Record<string, unknown>,
) {
  return CONTROLLER_OPTIONS.filter((option) =>
    isMachineOptionAllowed(option.value, globalSettings)
  );
}

function getTreeOptions(
  _settings: Record<string, unknown>,
  globalSettings?: Record<string, unknown>,
) {
  return TREE_OPTIONS.filter((option) =>
    isMachineOptionAllowed(option.value, globalSettings)
  );
}

function getSelectedMachineId(
  settings: Record<string, unknown>,
  key: string,
  defaultId: string,
  options: { value: string }[],
): string {
  const rawValue = settings[key];
  if (typeof rawValue === 'string' && options.some((option) => option.value === rawValue)) {
    return rawValue;
  }

  return defaultId;
}

function getControllerId(
  settings: Record<string, unknown>,
  globalSettings?: Record<string, unknown>,
): string {
  const options = getControllerOptions(settings, globalSettings);
  return getSelectedMachineId(settings, 'controller_id', DEFAULT_CONTROLLER_ID, options);
}

function getTreeId(
  settings: Record<string, unknown>,
  globalSettings?: Record<string, unknown>,
): string {
  const options = getTreeOptions(settings, globalSettings);
  return getSelectedMachineId(settings, 'tree_id', DEFAULT_TREE_ID, options);
}

function getTreeGrowthMultiplier(treeId: string): number {
  return treeId === CANDY_CANE_TREE_ID ? CANDY_CANE_GROWTH_MULTIPLIER : 1;
}

function hasIglooWinterBonus(
  _settings: Record<string, unknown>,
  globalSettings: Record<string, unknown> | undefined,
  controllerId: string,
  treeId: string,
): boolean {
  return (
    controllerId === IGLOO_CONTROLLER_ID &&
    treeId !== CANDY_CANE_TREE_ID &&
    areVariantMachinesEnabled(globalSettings)
  );
}

function getLogsPerTree(
  settings: Record<string, unknown>,
  globalSettings: Record<string, unknown> | undefined,
  controllerId: string,
  treeId: string,
): number {
  return BASE_LOGS_PER_TREE * (
    hasIglooWinterBonus(settings, globalSettings, controllerId, treeId)
      ? IGLOO_WINTER_LOG_MULTIPLIER
      : 1
  );
}

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

function calculateGrowthTime(pollution: number, treeId = DEFAULT_TREE_ID): number {
  const growthModifier = calculateGrowthModifier(pollution) * getTreeGrowthMultiplier(treeId);
  const P = 4500;

  let total = 0;
  for (let n = 7; n <= 11; n++) {
    const value = Math.ceil((P / growthModifier) / (n * 100));
    total += value;
  }

  const totalGrowthTime = (40 / 3) * total;

  return roundTo(totalGrowthTime, 2);
}

function calculateHarvestersNeeded(
  numTrees: number,
  pollution: number,
  treeId = DEFAULT_TREE_ID,
): number {
  const growthModifier = calculateGrowthModifier(pollution) * getTreeGrowthMultiplier(treeId);
  const P = 4500;

  const growthHarvester = 2 * (1000 / 30) * Math.ceil((P / growthModifier) / 1000);
  const harvester = Math.ceil(numTrees / (3 * growthHarvester / (1000 / 30)));

  return harvester;
}

function calculateLogsPerSecond(
  numTrees: number,
  growthTime: number,
  logsPerTree: number,
): number {
  return (numTrees * logsPerTree) / growthTime;
}

export const tree_farm_01: SpecialRecipe = {
  id: 'r_tree_farm_01',
  name: 'Tree Farm',
  machine_id: 'm_tree_farm',
  description: 'Modular tree farm for producing oak logs. Configure controller, tree type, harvesters, sprinklers, and outputs.',
  settings: {
    controller_id: {
      type: 'select',
      label: 'Controller',
      default: DEFAULT_CONTROLLER_ID,
      options: CONTROLLER_OPTIONS,
      getOptions: getControllerOptions,
      dynamicLabel: (settings, globalSettings) => {
        const controllerId = getControllerId(settings, globalSettings);
        const treeId = getTreeId(settings, globalSettings);
        const active = hasIglooWinterBonus(settings, globalSettings, controllerId, treeId);
        return active
          ? 'Controller - 50% more logs during December to February'
          : 'Controller';
      },
    },
    tree_id: {
      type: 'select',
      label: 'Tree Type',
      default: DEFAULT_TREE_ID,
      options: TREE_OPTIONS,
      getOptions: getTreeOptions,
    },
    tree_count: {
      type: 'number',
      label: 'Tree Count',
      default: 600,
      min: 1,
      max: 650,
      step: 1,
      dynamicLabel: (settings, globalSettings) => {
        const treeCount = (settings.tree_count as number) ?? 600;
        const pollution = (globalSettings?.global_pollution as number) ?? 10;
        const controllerId = getControllerId(settings, globalSettings);
        const treeId = getTreeId(settings, globalSettings);
        const growthTime = calculateGrowthTime(pollution, treeId);
        const logsPerTree = getLogsPerTree(settings, globalSettings, controllerId, treeId);
        const logsPerSecond = calculateLogsPerSecond(treeCount, growthTime, logsPerTree);
        const treesPerSecond = treeCount / growthTime;
        return `Tree Count - Oak logs/s: ${roundTo(logsPerSecond, 3)}, Trees/s: ${roundTo(treesPerSecond, 3)}`;
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
        const treeCount = (settings.tree_count as number) ?? 600;
        const harvesterCount = (settings.harvester_count as number) ?? 20;
        const pollution = (globalSettings?.global_pollution as number) ?? 10;
        const treeId = getTreeId(settings, globalSettings);
        const minHarvesters = calculateHarvestersNeeded(treeCount, pollution, treeId);
        const harvestRate = harvesterCount / 11;
        return `Harvester Count - Min harvesters: ${minHarvesters}, Harvest rate: ${roundTo(harvestRate, 3)}/s`;
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
    const controllerId = getControllerId(settings, globalSettings);
    const treeId = getTreeId(settings, globalSettings);

    const growthTime = calculateGrowthTime(pollution, treeId);
    const treesPerSecond = treeCount / growthTime;
    const maxHarvestRate = harvesterCount / 11;
    const actualHarvestRate = Math.min(treesPerSecond, maxHarvestRate);
    const powerConsumption = actualHarvestRate * (200000 / 11);
    const waterConsumption = sprinklerCount * (33 / (100 / 3));
    const logsPerTree = getLogsPerTree(settings, globalSettings, controllerId, treeId);
    const treeName = getMachine(treeId)?.name ?? 'Tree';

    const recipe: Recipe = {
      id: 'r_tree_farm_01',
      name: `${treeCount} ${treeName} Farm`,
      machine_id: 'm_tree_farm',
      cycle_time: 1,
      power_consumption: roundTo(powerConsumption, 6),
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: waterConsumption }],
      outputs: [{ product_id: 'p_oak_log', quantity: roundTo(actualHarvestRate * logsPerTree, 6), temperature: 18 }],
    };

    return recipe;
  },
  computeMachineCost: (settings, globalSettings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const outputsCount = (settings.outputs_count as number) ?? 8;
    const controllerId = getControllerId(settings, globalSettings);
    const treeId = getTreeId(settings, globalSettings);

    const waterTanks = Math.ceil(sprinklerCount / 3);

    const getCost = (id: string) => getMachine(id)?.cost ?? 0;

    const totalCost =
      getCost(controllerId) +
      getCost(treeId) * treeCount +
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
    const treeId = getTreeId(settings, globalSettings);

    const growthTime = calculateGrowthTime(pollution, treeId);
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
