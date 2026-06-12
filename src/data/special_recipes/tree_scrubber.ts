import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

// These formulas are only assumptions, inform me if they are wrong - Pollywrath
const MAX_POSITIVE_POLLUTION_REDUCTION = 6.6;
const CURVE_STEEPNESS = 0.55;
const TAIL_SCALE = 10;
const ZERO_POLLUTION_REDUCTION = 3.88;

const sinh = (value: number): number =>
  (Math.exp(value) - Math.exp(-value)) / 2;

const asinh = (value: number): number => {
  if (value === 0) return 0;
  return (
    Math.sign(value) *
    Math.log(Math.abs(value) + Math.sqrt(value * value + 1))
  );
};

const ZERO_ANCHOR_LOGIT = Math.log(
  ZERO_POLLUTION_REDUCTION /
    (MAX_POSITIVE_POLLUTION_REDUCTION - ZERO_POLLUTION_REDUCTION),
);

const CENTER_OFFSET =
  -TAIL_SCALE * sinh(ZERO_ANCHOR_LOGIT / CURVE_STEEPNESS);

const calculatePollution = (globalPollution: number): number => {
  const normalizedPollution = (globalPollution - CENTER_OFFSET) / TAIL_SCALE;
  const shapedPollution = asinh(normalizedPollution);

  return (
    -MAX_POSITIVE_POLLUTION_REDUCTION /
    (1 + Math.exp(-CURVE_STEEPNESS * shapedPollution))
  );
};

export const tree_scrubber_01: SpecialRecipe = {
  id: 'r_tree_scrubber_01',
  name: 'Makes Residue',
  machine_id: 'm_tree_scrubber',
  settings: {},
  compute: (_settings, globalSettings) => {
    const globalPollution = (globalSettings?.global_pollution as number) ?? 0;
    const pollution = calculatePollution(globalPollution);
    const residueQuantity = globalPollution <= -1500 ? 0 : 6;

    const recipe: Recipe = {
      id: 'r_tree_scrubber_01',
      name: 'Makes Residue',
      machine_id: 'm_tree_scrubber',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [{ product_id: 'p_water', quantity: 18 }],
      outputs: [
        { product_id: 'p_residue', quantity: residueQuantity, temperature: 18 },
      ],
    };

    return recipe;
  },
};
