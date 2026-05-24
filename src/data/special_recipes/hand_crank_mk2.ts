import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

const settingDefinitions = {
  crankers: {
    type: 'number' as const,
    label: 'Crankers',
    default: 1,
    min: 1,
    max: 4,
    step: 1,
  },
};

export const hand_crank_mk2_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_hand_crank_mk2_01',
  name: 'Produces Power',
  machineId: 'm_hand_crank_mk2',
  settings: settingDefinitions,
  powerConsumption: (settings: Record<string, unknown>) => {
    const crankers = (settings.crankers as number) ?? 1;
    return -135810 * crankers;
  },
  powerType: 'MV' as const,
  pollution: 0,
  cycleTime: 1,
  inputs: [],
  outputs: [],
});
