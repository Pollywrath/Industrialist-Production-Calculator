import type { Recipe } from '../../types/data';
import type {
  SpecialRecipe,
  SpecialRecipeAutocompleteSizingContext,
} from '../../types/specialRecipes';
import { getMachine } from '../lookup';
import { ceilMachineCount, roundTo } from '../../utils/precision';

const DEFAULT_CONTROLLER_ID = 'm_tree_farm_controller';
const IGLOO_CONTROLLER_ID = 'm_igloo_farm_controller';
const DEFAULT_TREE_ID = 'm_tree';
const CANDY_CANE_TREE_ID = 'm_candy_cane_tree';
const CANDY_CANE_GROWTH_SPEED_MULTIPLIER = 1.2;
const BASE_LOGS_PER_TREE = 2;
const IGLOO_WINTER_LOG_MULTIPLIER = 1.5;
const MIN_TREE_COUNT = 1;
const MAX_TREE_COUNT = 776;
const MIN_HARVESTER_COUNT = 1;
const MAX_HARVESTER_COUNT = 30;
const MIN_SPRINKLER_COUNT = 1;
const MAX_SPRINKLER_COUNT = 100;
const MIN_OUTPUT_COUNT = 1;
const MAX_OUTPUT_COUNT = 20;

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
    isMachineOptionAllowed(option.value, globalSettings),
  );
}

function getTreeOptions(
  _settings: Record<string, unknown>,
  globalSettings?: Record<string, unknown>,
) {
  return TREE_OPTIONS.filter((option) => isMachineOptionAllowed(option.value, globalSettings));
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

function hasIglooWinterBonus(
  _settings: Record<string, unknown>,
  globalSettings: Record<string, unknown> | undefined,
  controllerId: string,
  treeId: string,
): boolean {
  const currentMonth = globalSettings?.current_month;
  const isWinterMonth =
    currentMonth === 'December' || currentMonth === 'January' || currentMonth === 'February';

  return (
    controllerId === IGLOO_CONTROLLER_ID &&
    treeId !== CANDY_CANE_TREE_ID &&
    areVariantMachinesEnabled(globalSettings) &&
    isWinterMonth
  );
}

function getLogsPerTree(
  settings: Record<string, unknown>,
  globalSettings: Record<string, unknown> | undefined,
  controllerId: string,
  treeId: string,
): number {
  return (
    BASE_LOGS_PER_TREE *
    (hasIglooWinterBonus(settings, globalSettings, controllerId, treeId)
      ? IGLOO_WINTER_LOG_MULTIPLIER
      : 1)
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
  const growthModifier = calculateGrowthModifier(pollution);

  const P = 4500;

  const requiredGrowthUnits = Math.ceil(P / (growthModifier * 100));
  const expectedPulses = new Array<number>(requiredGrowthUnits + 1).fill(0);

  for (let growthUnits = 1; growthUnits <= requiredGrowthUnits; growthUnits += 1) {
    let expectedPulseCount = 1;
    for (let pulseGrowth = 7; pulseGrowth <= 11; pulseGrowth += 1) {
      expectedPulseCount += expectedPulses[Math.max(0, growthUnits - pulseGrowth)] / 5;
    }
    expectedPulses[growthUnits] = expectedPulseCount;
  }

  const expectedGrowthTime = 2 * (1000 / 30) * expectedPulses[requiredGrowthUnits];
  return treeId === CANDY_CANE_TREE_ID
    ? expectedGrowthTime / CANDY_CANE_GROWTH_SPEED_MULTIPLIER
    : expectedGrowthTime;
}

function calculateHarvestersNeeded(
  numTrees: number,
  pollution: number,
  treeId = DEFAULT_TREE_ID,
): number {
  return Math.ceil((numTrees * 11) / calculateGrowthTime(pollution, treeId));
}

function calculateActualHarvestRate(
  treeCount: number,
  harvesterCount: number,
  pollution: number,
  treeId: string,
): number {
  const treesPerSecond = treeCount / calculateGrowthTime(pollution, treeId);
  return Math.min(treesPerSecond, harvesterCount / 11);
}

function clampCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, ceilMachineCount(value)));
}

function sizeAutocompleteSettings(
  settings: Record<string, unknown>,
  context: SpecialRecipeAutocompleteSizingContext,
): Record<string, unknown> {
  const requiredOutputRate = context.requiredOutputRates[0];
  if (!Number.isFinite(requiredOutputRate) || requiredOutputRate <= 0) return settings;

  const pollution = (context.globalSettings?.global_pollution as number) ?? 10;
  const controllerId = getControllerId(settings, context.globalSettings);
  const treeId = getTreeId(settings, context.globalSettings);
  const logsPerTree = getLogsPerTree(settings, context.globalSettings, controllerId, treeId);
  const requiredHarvestRate = requiredOutputRate / logsPerTree;
  const growthTime = calculateGrowthTime(pollution, treeId);
  const nextTreeCount = clampCount(
    requiredHarvestRate * growthTime,
    MIN_TREE_COUNT,
    MAX_TREE_COUNT,
  );
  const nextHarvesterCount = clampCount(
    requiredHarvestRate * 11,
    MIN_HARVESTER_COUNT,
    MAX_HARVESTER_COUNT,
  );
  const nextSprinklerCount = clampCount(
    nextTreeCount / 25,
    MIN_SPRINKLER_COUNT,
    MAX_SPRINKLER_COUNT,
  );
  const nextOutputCount = clampCount(nextTreeCount / 75, MIN_OUTPUT_COUNT, MAX_OUTPUT_COUNT);

  if (
    nextTreeCount === settings.tree_count &&
    nextHarvesterCount === settings.harvester_count &&
    nextSprinklerCount === settings.sprinkler_count &&
    nextOutputCount === settings.outputs_count
  ) {
    return settings;
  }
  return {
    ...settings,
    tree_count: nextTreeCount,
    harvester_count: nextHarvesterCount,
    sprinkler_count: nextSprinklerCount,
    outputs_count: nextOutputCount,
  };
}

export const tree_farm_01: SpecialRecipe = {
  id: 'r_tree_farm_01',
  name: 'Tree Farm',
  machine_id: 'm_tree_farm',
  description:
    'Modular tree farm for producing oak logs. Configure controller, tree type, harvesters, sprinklers, and outputs.',
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
        return active ? 'Controller - 50% more logs during December to February' : 'Controller';
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
      min: MIN_TREE_COUNT,
      max: MAX_TREE_COUNT,
      step: 1,
      dynamicLabel: (settings, globalSettings) => {
        const treeCount = (settings.tree_count as number) ?? 600;
        const pollution = (globalSettings?.global_pollution as number) ?? 10;
        const controllerId = getControllerId(settings, globalSettings);
        const treeId = getTreeId(settings, globalSettings);
        const logsPerTree = getLogsPerTree(settings, globalSettings, controllerId, treeId);
        const harvestRate = calculateActualHarvestRate(
          treeCount,
          (settings.harvester_count as number) ?? 20,
          pollution,
          treeId,
        );
        const logsPerSecond = harvestRate * logsPerTree;
        const treesPerSecond = harvestRate;
        return `Tree Count - Oak logs/s: ${roundTo(logsPerSecond, 3)}, Trees/s: ${roundTo(treesPerSecond, 3)}`;
      },
    },
    harvester_count: {
      type: 'number',
      label: 'Harvester Count',
      default: 20,
      min: MIN_HARVESTER_COUNT,
      max: MAX_HARVESTER_COUNT,
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
      min: MIN_SPRINKLER_COUNT,
      max: MAX_SPRINKLER_COUNT,
      step: 1,
      dynamicLabel: (settings) => {
        const treeCount = (settings.tree_count as number) ?? 600;
        const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
        const estimatedSprinklerCount = clampCount(
          treeCount / 25,
          MIN_SPRINKLER_COUNT,
          MAX_SPRINKLER_COUNT,
        );
        const waterTanks = Math.ceil(sprinklerCount / 3);
        return `Sprinkler Count - Est count: ${estimatedSprinklerCount}, Water tanks needed: ${waterTanks}`;
      },
    },
    outputs_count: {
      type: 'number',
      label: 'Output Count',
      default: 8,
      min: MIN_OUTPUT_COUNT,
      max: MAX_OUTPUT_COUNT,
      step: 1,
      dynamicLabel: (settings) => {
        const treeCount = (settings.tree_count as number) ?? 600;
        const estimatedOutputCount = clampCount(treeCount / 75, MIN_OUTPUT_COUNT, MAX_OUTPUT_COUNT);
        return `Output Count - Est count: ${estimatedOutputCount}`;
      },
    },
  },
  sizeAutocompleteSettings,
  compute: (settings, globalSettings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const pollution = (globalSettings?.global_pollution as number) ?? 10;
    const controllerId = getControllerId(settings, globalSettings);
    const treeId = getTreeId(settings, globalSettings);

    const actualHarvestRate = calculateActualHarvestRate(
      treeCount,
      harvesterCount,
      pollution,
      treeId,
    );
    const powerUse = actualHarvestRate * 200000;
    const waterConsumption = sprinklerCount * (33 / (100 / 3));
    const logsPerTree = getLogsPerTree(settings, globalSettings, controllerId, treeId);
    const treeName = getMachine(treeId)?.name ?? 'Tree';

    const recipe: Recipe = {
      id: 'r_tree_farm_01',
      name: `${treeCount} ${treeName} Farm`,
      machine_id: 'm_tree_farm',
      cycle_time: 1,
      power_use: roundTo(powerUse, 6),
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: waterConsumption }],
      outputs: [
        {
          product_id: 'p_oak_log',
          quantity: actualHarvestRate * logsPerTree,
          temperature: 18,
          voidable: true,
        },
      ],
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

    const actualHarvestRate = calculateActualHarvestRate(
      treeCount,
      harvesterCount,
      pollution,
      treeId,
    );
    const powerUse = actualHarvestRate * 200000;

    const waterTanks = Math.ceil(sprinklerCount / 3);
    const additionalPowerModels = Math.ceil(powerUse / 1500000);

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
  computeMachineSpace: (settings, globalSettings) => {
    const treeCount = (settings.tree_count as number) ?? 600;
    const harvesterCount = (settings.harvester_count as number) ?? 20;
    const sprinklerCount = (settings.sprinkler_count as number) ?? 24;
    const outputsCount = (settings.outputs_count as number) ?? 8;
    const controllerId = getControllerId(settings, globalSettings);
    const treeId = getTreeId(settings, globalSettings);
    const waterTanks = Math.ceil(sprinklerCount / 3);
    const area = (id: string) => {
      const machine = getMachine(id);
      return machine ? machine.size.x * machine.size.y : 0;
    };

    return (
      area(controllerId) +
      area(treeId) * treeCount +
      area('m_farm_harvester') * harvesterCount +
      area('m_tree_farm_sprinkler') * sprinklerCount +
      area('m_tree_farm_water_tank') * waterTanks +
      area('m_tree_farm_output') * outputsCount
    );
  },
};
