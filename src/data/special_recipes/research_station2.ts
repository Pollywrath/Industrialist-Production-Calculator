import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const m_research_station2_01: SpecialRecipe = {
  id: 'r_research_station2_01',
  name: 'Research Station 2',
  machine_id: 'm_research_station2',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    const resolvedItem = helpers?.hasConnection('input', 0)
      ? helpers.resolveProduct('input', 0) || 'any_item'
      : 'any_item';

    const recipe: Recipe = {
      id: 'r_research_station2_01',
      name: 'Research Station 2',
      machine_id: 'm_research_station2',
      cycle_time: 1,
      power_consumption: 17000,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: resolvedItem, quantity: 0.5 }],
      outputs: [],
    };

    return recipe;
  },
};
