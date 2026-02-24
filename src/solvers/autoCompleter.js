/**
 * AutoCompleter — Automatically resolves unconnected deficiencies in a balanced graph.
 *
 * Strategy (similar to factorio calcs):
 *   1. BFS from each deficient product → collect every reachable recipe transitively
 *   2. Build a product×recipe matrix LP (one variable per recipe = its run rate)
 *   3. Solve with SCIP — inferior/unused recipes get zeroed out by the objective
 *   4. Return surviving recipes with machine counts for the caller to place on canvas
 *
 * This file only handles the solve. Translating results into canvas nodes/edges
 * is the caller's responsibility.
 */

import { getRecipesProducingProduct } from '../data/dataLoader';
import { solveMPSRaw } from './lpSolver';
import { TEMPERATURE_PRODUCTS, HEAT_SOURCES } from '../utils/temperatureUtils';

const EPSILON = 1e-6;

const sanitize = (name) => name.replace(/[-. ]/g, '_');

// ─── BFS ──────────────────────────────────────────────────────────────────────

/**
 * Collect every recipe transitively reachable from a set of deficient products.
 *
 * @param {string[]}  deficientProductIds   Products that need to be produced
 * @param {Set}       committedProductIds   Products already produced in the committed graph —
 *                                          we wire to these rather than expanding them
 * @returns {Map<string, object>}           recipeId → recipe object
 */
export const collectReachableRecipes = (deficientProductIds, committedProductIds = new Set()) => {
  // Products we've already queued/visited — seeded with committed products so we
  // don't cross that boundary
  const visitedProducts = new Set(committedProductIds);
  const reachableRecipes = new Map(); // recipeId → recipe
  const queue = [...deficientProductIds];

  while (queue.length > 0) {
    const productId = queue.shift();

    if (visitedProducts.has(productId)) continue;
    visitedProducts.add(productId);

    // Temperature products (steam, hot water) require manual heat source setup — skip
    if (TEMPERATURE_PRODUCTS.includes(productId)) continue;

    const producers = getRecipesProducingProduct(productId);

    for (const recipe of producers) {
      if (reachableRecipes.has(recipe.id)) continue;

      // Skip recipes with Variable cycle time — the LP can't model them
      if (typeof recipe.cycle_time !== 'number' || recipe.cycle_time <= 0) continue;

      reachableRecipes.set(recipe.id, recipe);

      // Queue up inputs so we recurse deeper
      for (const input of recipe.inputs) {
        if (!input.product_id || input.product_id === 'p_variableproduct') continue;
        if (!visitedProducts.has(input.product_id)) {
          queue.push(input.product_id);
        }
      }
    }
  }

  return reachableRecipes;
};

// ─── MPS Builder ──────────────────────────────────────────────────────────────

/**
 * Build MPS string.
 *
 * Variables:  r_<recipeId>  — run rate of the recipe (runs/second), continuous >= 0
 * Rows:       one per unique product — net flow (production − consumption) >= 0
 *             for deficient products the RHS is the required deficit rate instead of 0
 * Objective:  minimize weighted sum of power + pollution + model count per recipe
 *
 * @param {Map<string, number>}  deficits         productId → required rate (units/s)
 * @param {Map<string, object>}  reachableRecipes recipeId  → recipe object
 * @param {object}               weights          LP objective weights from user settings
 * @returns {{ mpsString: string, varNameMap: Map<string, string> }}
 */
const buildAutoCompleteMPS = (deficits, reachableRecipes, committedProductIds = new Set(), weights = {}) => {
  const {
    MODEL_COUNT_WEIGHT = 1e-3,
    POWER_WEIGHT       = 1e-8,
    POLLUTION_WEIGHT   = 1e-5,
    COST_WEIGHT        = 1e-6,
  } = weights;

  // Collect every product touched by any reachable recipe
  const allProducts = new Set(deficits.keys());
  for (const recipe of reachableRecipes.values()) {
    for (const io of [...recipe.inputs, ...recipe.outputs]) {
      if (io.product_id && io.product_id !== 'p_variableproduct') {
        allProducts.add(io.product_id);
      }
    }
  }

  // sanitized row name per product
  const productRow = (productId) => sanitize(`prod_${productId}`);

  // varNameMap: sanitizedVarName → recipeId  (for parsing solution back)
  const varNameMap = new Map();
  for (const recipeId of reachableRecipes.keys()) {
    varNameMap.set(sanitize(`r_${recipeId}`), recipeId);
  }

  const out = [];

  // ── NAME ──
  out.push('NAME AUTOCOMPLETE\n');

  // Only constrain products that are consumed by at least one reachable recipe,
  // or are explicitly deficient. Pure byproducts with no consumers in the reachable
  // set get no constraint — they become excess, not a trigger for more recipes.
  const consumedProducts = new Set(deficits.keys());
  for (const recipe of reachableRecipes.values()) {
    for (const input of recipe.inputs) {
      if (input.product_id && input.product_id !== 'p_variableproduct') {
        consumedProducts.add(input.product_id);
      }
    }
  }

  // ── ROWS ──
  out.push('ROWS\n');
  out.push(' N  obj\n');
  for (const productId of allProducts) {
    if (consumedProducts.has(productId)) {
      out.push(` G  ${productRow(productId)}\n`);
    }
    // Unconstrained products (pure byproducts) get no row — LP ignores them
  }

  // ── COLUMNS ──
  out.push('COLUMNS\n');

  for (const [recipeId, recipe] of reachableRecipes) {
    const varName = sanitize(`r_${recipeId}`);
    const cycleTime = recipe.cycle_time; // already validated > 0 in BFS

    // Objective: cost per run-per-second
    const power = typeof recipe.power_consumption === 'number'
      ? recipe.power_consumption
      : (recipe.power_consumption?.max ?? 0);
    const pollution = typeof recipe.pollution === 'number' ? recipe.pollution : 0;

    // Fixed cost per recipe ensures LP avoids selecting unnecessary recipes even
    // when power/pollution/cost are near zero. Scaled so it's always meaningful.
    const FIXED_RECIPE_COST = 10.0;
    const objCoeff =
      FIXED_RECIPE_COST +
      MODEL_COUNT_WEIGHT * cycleTime +
      POWER_WEIGHT       * power +
      POLLUTION_WEIGHT   * pollution * cycleTime +
      COST_WEIGHT        * cycleTime;

    out.push(`    ${varName}  obj  ${objCoeff}\n`);

    // Outputs → positive contribution to product rows (only if row exists)
    for (const output of recipe.outputs) {
      if (!output.product_id || output.product_id === 'p_variableproduct') continue;
      if (typeof output.quantity !== 'number') continue;
      if (!consumedProducts.has(output.product_id)) continue;
      out.push(`    ${varName}  ${productRow(output.product_id)}  ${output.quantity}\n`);
    }

    // Inputs → negative contribution to product rows
    // Skip committed products — already available from the existing graph
    // Skip temperature products — water is freely available as raw input,
    // steam/hot water come from heat sources autocomplete can't place automatically
    for (const input of recipe.inputs) {
      if (!input.product_id || input.product_id === 'p_variableproduct') continue;
      if (typeof input.quantity !== 'number') continue;
      if (committedProductIds.has(input.product_id)) continue;
      if (TEMPERATURE_PRODUCTS.includes(input.product_id)) continue;
      out.push(`    ${varName}  ${productRow(input.product_id)}  ${-input.quantity}\n`);
    }
  }

  // ── RHS ──
  // For deficient products set the minimum required production rate
  out.push('RHS\n');
  for (const [productId, requiredRate] of deficits) {
    if (requiredRate > 0) {
      out.push(`    rhs  ${productRow(productId)}  ${requiredRate}\n`);
    }
  }

  // ── BOUNDS ──
  // All variables default to [0, +∞) — no explicit bounds needed

  out.push('ENDATA\n');

  return { mpsString: out.join(''), varNameMap };
};

// ─── Main Solve ───────────────────────────────────────────────────────────────

/**
 * Solve autocomplete for a set of deficient products.
 *
 * @param {Map<string, number>}  deficits
 *   productId → required production rate (units/s).
 *   Typically derived from committed nodes' unconnected input rates × machine counts.
 *
 * @param {Set<string>}  committedProductIds
 *   Products already being produced in the committed graph.
 *   BFS stops here and wires to existing nodes instead of expanding.
 *
 * @param {object}  weights
 *   LP objective weights from user settings (MODEL_COUNT_WEIGHT, POWER_WEIGHT, etc.)
 *
 * @returns {Promise<{
 *   feasible: boolean,
 *   recipes: Array<{ recipeId, recipe, machineCount, rate }>,
 *   stats: { recipesEvaluated, recipesSelected }
 * }>}
 */
export const solveAutoComplete = async (deficits, committedProductIds = new Set(), weights = {}) => {
  if (!deficits || deficits.size === 0) {
    return { feasible: false, recipes: [], stats: { recipesEvaluated: 0, recipesSelected: 0 } };
  }

  // ── BFS ──
  const reachableRecipes = collectReachableRecipes([...deficits.keys()], committedProductIds);

  if (reachableRecipes.size === 0) {
    console.warn('[AutoComplete] No reachable recipes found — all deficient products may be raw materials');
    return { feasible: false, recipes: [], stats: { recipesEvaluated: 0, recipesSelected: 0 } };
  }

  console.log(`[AutoComplete] BFS collected ${reachableRecipes.size} recipes for ${deficits.size} deficient products`);
  console.group('[AutoComplete] Deficits');
  deficits.forEach((rate, productId) => console.log(`  ${productId}: ${rate.toFixed(6)}/s needed`));
  console.groupEnd();
  console.group('[AutoComplete] Committed products (BFS stops here)');
  console.log([...committedProductIds].join(', ') || '(none)');
  console.groupEnd();
  console.group('[AutoComplete] All reachable recipes (BFS result)');
  reachableRecipes.forEach((recipe, id) => {
    const inputs  = recipe.inputs.map(i => `${i.product_id}×${i.quantity}`).join(', ') || '—';
    const outputs = recipe.outputs.map(o => `${o.product_id}×${o.quantity}`).join(', ');
    console.log(`  [${id}] ${recipe.name} | IN: ${inputs} | OUT: ${outputs}`);
  });
  console.groupEnd();

  // ── Build + Solve MPS ──
  const { mpsString, varNameMap } = buildAutoCompleteMPS(deficits, reachableRecipes, committedProductIds, weights);
  const solution = await solveMPSRaw(mpsString, varNameMap);

  if (!solution.feasible) {
    console.warn('[AutoComplete] LP infeasible — deficiencies may be unresolvable with available recipes');
    return { feasible: false, recipes: [], stats: { recipesEvaluated: reachableRecipes.size, recipesSelected: 0 } };
  }

  // ── Extract Results ──
  // solution keys are recipeIds (mapped back via varNameMap in parseSCIPSolution)
  const results = [];

  for (const [recipeId, recipe] of reachableRecipes) {
    const rate = solution[recipeId] ?? 0;
    if (rate < EPSILON) continue; // LP zeroed this out

    const cycleTime = recipe.cycle_time;
    // machine count = runs/second × seconds/run
    const machineCount = rate * cycleTime;

    results.push({ recipeId, recipe, machineCount, rate });
  }

  console.group(`[AutoComplete] LP selected ${results.length} / ${reachableRecipes.size} recipes`);
  results.forEach(({ recipeId, recipe, machineCount, rate }) => {
    const inputs  = recipe.inputs.map(i => `${i.product_id}×${i.quantity}`).join(', ') || '—';
    const outputs = recipe.outputs.map(o => `${o.product_id}×${o.quantity}`).join(', ');
    console.log(`  [${recipeId}] ${recipe.name} | rate=${rate.toFixed(6)}/s machines=${machineCount.toFixed(4)} | IN: ${inputs} | OUT: ${outputs}`);
  });
  console.groupEnd();

  return {
    feasible: true,
    recipes: results,
    stats: {
      recipesEvaluated: reachableRecipes.size,
      recipesSelected: results.length,
    },
  };
};