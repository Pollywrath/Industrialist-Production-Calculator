import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const DEFAULT_QUANTITY = 1;
const DEFAULT_TEMPERATURE = 18;
const MIN_TEMPERATURE = -273.15;
const MAX_TEMPERATURE = 1000000;

export const fluid_spawner_01: SpecialRecipe = {
  id: 'r_fluid_spawner_01',
  name: 'Fluid Spawner',
  machine_id: 'm_fluid_spawner',
  settings: {
    product_id: {
      type: 'product',
      label: 'Product',
      default: 'p_water',
      productType: 'Fluid',
    },
    quantity: {
      type: 'number',
      label: 'Quantity per second',
      default: DEFAULT_QUANTITY,
      min: 0,
      step: 0.01,
    },
    temperature: {
      type: 'number',
      label: 'Temperature (C)',
      default: DEFAULT_TEMPERATURE,
      min: MIN_TEMPERATURE,
      max: MAX_TEMPERATURE,
      step: 0.01,
    },
  },
  potentialOutputProductTypes: ['Fluid'],
  resolveSettings: (productId) => ({ product_id: productId }),
  compute: (settings) => {
    const productId = settings.product_id as string;
    const quantity = settings.quantity as number;
    const temperature = settings.temperature as number;

    const recipe: Recipe = {
      id: 'r_fluid_spawner_01',
      name: 'Fluid Spawner',
      machine_id: 'm_fluid_spawner',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [],
      outputs: [
        {
          product_id: productId,
          quantity,
          temperature,
          handle_type: 'fluid',
        },
      ],
    };

    return recipe;
  },
};

