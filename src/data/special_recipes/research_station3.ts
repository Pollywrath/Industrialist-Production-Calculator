//TODO: Read the decompiled code
import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  has_station_4: {
    type: 'select' as const,
    label: 'Has Station 4?',
    default: 'No',
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  },
};

export const m_research_station3_01: SpecialRecipe = {
  id: 'r_research_station3_01',
  name: 'Research Station 3',
  machine_id: 'm_research_station3',
  isSellTrash: true,
  settings: settingDefinitions,
  compute: (settings, _globalSettings, _nodeId, helpers) => {
    const hasStation4 = (settings.has_station_4 as string) === 'Yes';
    const power = hasStation4 ? 5000000 : 600000;

    const item1 = helpers?.hasConnection('input', 0)
      ? helpers.resolveProduct('input', 0) || 'any_item'
      : 'any_item';
    const item2 = helpers?.hasConnection('input', 1)
      ? helpers.resolveProduct('input', 1) || 'any_item'
      : 'any_item';

    const inputsList: { product_id: string; quantity: number }[] = [
      { product_id: item1, quantity: 0.1 },
      { product_id: item2, quantity: 0.1 },
    ];

    const recipe: Recipe = {
      id: 'r_research_station3_01',
      name: 'Research Station 3',
      machine_id: 'm_research_station3',
      cycle_time: 1,
      power_consumption: power,
      power_type: 'MV',
      pollution: 0,
      inputs: inputsList,
      outputs: [],
    };

    return recipe;
  },
};
