import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';

function getDishCount(settings: Record<string, unknown>): number {
  const value = Number(settings.satellite_dish_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function getOptimalDishCount(controllerCount: number, researchPoints: number): number {
  const controllers = Math.max(0, controllerCount);
  const points = Math.max(0, researchPoints);
  if (controllers === 0) return 0;
  return Math.ceil(controllers + Math.sqrt(controllers * points));
}

export const satellite_dish_controller_01: SpecialRecipe = {
  id: 'r_satellite_dish_controller_01',
  name: 'Satellite Dish Controller',
  machine_id: 'm_satellite_dish_controller',
  isSellTrash: true,
  settings: {
    satellite_dish_count: {
      type: 'number',
      label: 'Satellite Dishes',
      default: 0,
      min: 0,
      step: 1,
      dynamicLabel: (_settings, _globalSettings, context) => {
        const stats = context?.researchInfrastructure;
        const optimal = stats
          ? getOptimalDishCount(
              stats.satelliteDishControllerCount,
              stats.satelliteDishResearchPoints,
            )
          : getOptimalDishCount(1, 0);
        return `Satellite Dishes (Canvas Optimal: ${optimal})`;
      },
    },
  },
  compute: (settings, _globalSettings, _nodeId, helpers) => {
    const dishCount = getDishCount(settings);
    let resolvedFluid = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_fluid';
    }

    const recipe: Recipe = {
      id: 'r_satellite_dish_controller_01',
      name: `${dishCount} Total Dishes`,
      machine_id: 'm_satellite_dish_controller',
      cycle_time: 1,
      power_use: 75000,
      power_type: 'MV',
      powerEffects: [
        {
          power_type: 'MV',
          power_use: 75000,
          label: 'Controller',
        },
        {
          power_type: 'MV',
          power_use: dishCount * 75000,
          label: 'Dishes',
          powerIndependentOfMachineCount: true,
        },
      ],
      pollution: 0,
      inputs: [{ product_id: resolvedFluid, quantity: 0.5 }],
      outputs: [],
    };

    return recipe;
  },
  computeMachineCost: () => {
    return getMachine('m_satellite_dish_controller')?.cost ?? 0;
  },
  computeMachineCostIndependentOfMachineCount: (settings) => {
    return (getMachine('m_satellite_dish')?.cost ?? 0) * getDishCount(settings);
  },
  computeModelCount: () => {
    return 1 + 2 + 2;
  },
  computeModelCountIndependentOfMachineCount: (settings) => {
    return getDishCount(settings);
  },
  computeMachineSpace: () => {
    const controller = getMachine('m_satellite_dish_controller');
    const controllerArea = controller ? controller.size.x * controller.size.y : 0;
    return controllerArea;
  },
  computeMachineSpaceIndependentOfMachineCount: (settings) => {
    const dish = getMachine('m_satellite_dish');
    const dishArea = dish ? dish.size.x * dish.size.y : 0;
    return dishArea * getDishCount(settings);
  },
};
