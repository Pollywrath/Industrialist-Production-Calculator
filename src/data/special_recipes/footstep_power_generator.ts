import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  steps_per_second: {
    type: 'number' as const,
    label: 'Steps per Second',
    default: 2,
    min: 0,
    step: 0.1,
  },
  power_per_step: {
    type: 'number' as const,
    label: 'Power per Step',
    default: 2.05,
    min: 1.4,
    max: 2.7,
    step: 0.01,
  },
};

export const footstep_power_generator_01: SpecialRecipe = {
  id: 'r_footstep_power_generator_01',
  name: 'Produces Power',
  machine_id: 'm_footstep_power_generator',
  settings: settingDefinitions,
  compute: (settings) => {
    const stepsPerSecond = (settings.steps_per_second as number) ?? 2;
    const powerPerStep = (settings.power_per_step as number) ?? 2.05;

    const recipe: Recipe = {
      id: 'r_footstep_power_generator_01',
      name: 'Produces Power',
      machine_id: 'm_footstep_power_generator',
      cycle_time: 1,
      power_consumption: -(stepsPerSecond * powerPerStep),
      power_type: 'MV',
      pollution: 0,
      inputs: [],
      outputs: [],
    };

    return recipe;
  },
};
