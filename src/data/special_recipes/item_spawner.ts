import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const DEFAULT_QUANTITY = 1;
const DEFAULT_TEMPERATURE = 18;

export const item_spawner_01: SpecialRecipe = {
  id: 'r_item_spawner_01',
  name: 'Item Spawner',
  machine_id: 'm_item_spawner',
  settings: {
    product_id: {
      type: 'product',
      label: 'Product',
      default: 'p_oak_log',
      productType: 'Item',
    },
    quantity: {
      type: 'number',
      label: 'Quantity per second',
      default: DEFAULT_QUANTITY,
      min: 0,
      step: 0.01,
    },
  },
  potentialOutputProductTypes: ['Item'],
  resolveSettings: (productId) => ({ product_id: productId }),
  compute: (settings) => {
    const productId = settings.product_id as string;
    const quantity = settings.quantity as number;

    const recipe: Recipe = {
      id: 'r_item_spawner_01',
      name: 'Item Spawner',
      machine_id: 'm_item_spawner',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [],
      outputs: [
        {
          product_id: productId,
          quantity,
          temperature: DEFAULT_TEMPERATURE,
          handle_type: 'item',
        },
      ],
    };

    return recipe;
  },
};

