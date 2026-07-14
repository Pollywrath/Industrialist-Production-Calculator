//TODO: Read the decompiled code
import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';

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
      power_use: power,
      power_type: 'MV',
      pollution: 0,
      inputs: inputsList,
      outputs: [],
    };

    return recipe;
  },
  computeMachineCost: (settings) => {
    const hasStation4 = (settings.has_station_4 as string) === 'Yes';
    return (
      (getMachine('m_research_station3')?.cost ?? 0) +
      (hasStation4 ? (getMachine('m_research_station4')?.cost ?? 0) : 0)
    );
  },
  computeModelCount: (settings) => {
    const hasStation4 = (settings.has_station_4 as string) === 'Yes';
    const power = hasStation4 ? 5000000 : 600000;
    const powerModels = Math.ceil(power / 1500000) * 2;
    return 1 + 2 * 2 + powerModels + (hasStation4 ? 1 : 0);
  },
  computeMachineSpace: (settings) => {
    const hasStation4 = (settings.has_station_4 as string) === 'Yes';
    const station3 = getMachine('m_research_station3');
    const station4 = getMachine('m_research_station4');
    const station3Area = station3 ? station3.size.x * station3.size.y : 0;
    const station4Area = station4 ? station4.size.x * station4.size.y : 0;
    return station3Area + (hasStation4 ? station4Area : 0);
  },
};
