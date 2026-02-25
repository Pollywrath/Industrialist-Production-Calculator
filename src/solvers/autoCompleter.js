/**
 * AutoCompleter — Automatically resolves unconnected deficiencies in a balanced graph.
 *
 * Strategy (Kirk McDonald style):
 *   1. BFS from each deficient product → collect every reachable recipe transitively
 *   2. Build a product×recipe matrix LP (one variable per recipe = its run rate)
 *   3. Solve with SCIP — inferior/unused recipes get zeroed out by the objective
 *   4. Return surviving recipes with machine counts for the caller to place on canvas
 *
 * Boiler handling:
 *   The boiler has two water inputs with distinct roles:
 *     input[0] — cold water source: any water producer (pumps, condensers, heat sources)
 *     input[1] — heat source port: ONLY recipes from heat source machines whose output
 *                product matches the input product (firebox, electric heater, gas burner…)
 *   In the MPS, input[1] is modelled via a synthetic "hot water" product row
 *   (p_ac_hot_<productId>) so the LP cannot satisfy it with a plain water pump or by
 *   looping the boiler's own cooled-water output back into this port.
 */

import { getRecipesProducingProduct, getMachine } from '../data/dataLoader';
import { solveMPSRaw, computeObjectiveWeights } from './lpSolver';
import { TEMPERATURE_PRODUCTS, HEAT_SOURCES } from '../utils/temperatureUtils';

const EPSILON = 1e-6;
const sanitize = (name) => name.replace(/[-. ]/g, '_');

// ─── Constants ────────────────────────────────────────────────────────────────

const WATER_PRODUCTS      = new Set(['p_water', 'p_filtered_water', 'p_distilled_water']);
const STEAM_PRODUCTS      = new Set(['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam']);
const HEAT_SOURCE_MACHINE_IDS = new Set(Object.keys(HEAT_SOURCES));

// Synthetic product row for the boiler's heat-source port.
// Only heat source machines write to these rows.
const hotProduct = (productId) => `p_ac_hot_${productId}`;

// ─── BFS helpers ──────────────────────────────────────────────────────────────

const isValidRecipe = (recipe) =>
  typeof recipe.cycle_time === 'number' && recipe.cycle_time > 0;

/**
 * Expand producers of a water product as cold-water sources.
 *   includeHeatSources=true  → boiler input[0] or heat source's own cold-water input
 *   includeHeatSources=false → non-boiler recipes that need water: no heat sources
 */
const expandWaterProducers = (
  productId, includeHeatSources,
  reachableRecipes, committedProductIds, visitedProducts, queue,
  excludeSteamConsumers = false
) => {
  for (const recipe of getRecipesProducingProduct(productId)) {
    if (reachableRecipes.has(recipe.id)) continue;
    if (!isValidRecipe(recipe)) continue;
    const isHS = HEAT_SOURCE_MACHINE_IDS.has(recipe.machine_id);
    if (isHS && !includeHeatSources) continue;

    // Skip recipes where the water product is a byproduct, not the primary output.
    // e.g. condensers produce water as output[1] — we don't want to select them
    // just to supply water. Heat sources are exempt since producing hot water IS
    // their primary purpose even if it's not technically output[0].
    if (!isHS && recipe.outputs[0]?.product_id !== productId) continue;

    // When called for a boiler's cold water port, exclude any recipe that consumes
    // steam — those recipes (e.g. large turbine) create an unresolvable loop:
    // boiler produces steam → turbine consumes it → turbine outputs water → boiler.
    if (excludeSteamConsumers && recipe.inputs.some(i => STEAM_PRODUCTS.has(i.product_id))) continue;

    reachableRecipes.set(recipe.id, recipe);

    for (const input of recipe.inputs) {
      if (!input.product_id || input.product_id === 'p_variableproduct') continue;
      if (committedProductIds.has(input.product_id)) continue;
      if (WATER_PRODUCTS.has(input.product_id)) {
        // Heat source's own cold-water input — do NOT allow further heat-source chaining
        expandWaterProducers(
          input.product_id, false,
          reachableRecipes, committedProductIds, visitedProducts, queue
        );
      } else if (!TEMPERATURE_PRODUCTS.includes(input.product_id)) {
        if (!visitedProducts.has(input.product_id)) queue.push(input.product_id);
      }
    }
  }
};

/**
 * Expand ONLY heat source recipes whose output product matches productId.
 * Used exclusively for boiler input[1] (heat source port).
 */
const expandHeatSourceProducers = (
  productId,
  reachableRecipes, committedProductIds, visitedProducts, queue
) => {
  for (const recipe of getRecipesProducingProduct(productId)) {
    if (reachableRecipes.has(recipe.id)) continue;
    if (!isValidRecipe(recipe)) continue;
    if (!HEAT_SOURCE_MACHINE_IDS.has(recipe.machine_id)) continue;

    reachableRecipes.set(recipe.id, recipe);

    for (const input of recipe.inputs) {
      if (!input.product_id || input.product_id === 'p_variableproduct') continue;
      if (committedProductIds.has(input.product_id)) continue;
      if (WATER_PRODUCTS.has(input.product_id)) {
        // Heat source cold-water inlet — any water producer, but no further heat-source chaining
        expandWaterProducers(
          input.product_id, false,
          reachableRecipes, committedProductIds, visitedProducts, queue
        );
      } else if (!TEMPERATURE_PRODUCTS.includes(input.product_id)) {
        if (!visitedProducts.has(input.product_id)) queue.push(input.product_id);
      }
    }
  }
};

// ─── BFS ──────────────────────────────────────────────────────────────────────

export const collectReachableRecipes = (deficientProductIds, committedProductIds = new Set()) => {
  const visitedProducts = new Set(committedProductIds);
  const reachableRecipes = new Map();
  const queue = [...deficientProductIds];

  while (queue.length > 0) {
    const productId = queue.shift();
    if (visitedProducts.has(productId)) continue;
    visitedProducts.add(productId);

    // ── Water ────────────────────────────────────────────────────────────────
    // Any recipe needing water can get it from any producer (pumps + heat sources).
    if (WATER_PRODUCTS.has(productId)) {
      expandWaterProducers(
        productId, true,
        reachableRecipes, committedProductIds, visitedProducts, queue
      );
      continue;
    }

    // ── Steam ─────────────────────────────────────────────────────────────────
    // Only expand through boilers. Handle their two inputs differently.
    if (STEAM_PRODUCTS.has(productId)) {
      for (const recipe of getRecipesProducingProduct(productId)) {
        if (reachableRecipes.has(recipe.id)) continue;
        if (!isValidRecipe(recipe)) continue;
        if (recipe.machine_id !== 'm_boiler') continue;

        reachableRecipes.set(recipe.id, recipe);

        for (let idx = 0; idx < recipe.inputs.length; idx++) {
          const input = recipe.inputs[idx];
          if (!input.product_id || input.product_id === 'p_variableproduct') continue;
          if (committedProductIds.has(input.product_id)) continue;

          if (WATER_PRODUCTS.has(input.product_id)) {
            if (idx === 1) {
              // Heat source port — only heat source machines
              expandHeatSourceProducers(
                input.product_id,
                reachableRecipes, committedProductIds, visitedProducts, queue
              );
            } else {
              // Cold water port — exclude heat sources and steam-consuming recipes
              // to prevent boiler→steam→turbine→water→boiler loops.
              expandWaterProducers(
                input.product_id, false,
                reachableRecipes, committedProductIds, visitedProducts, queue,
                true
              );
            }
          } else if (!TEMPERATURE_PRODUCTS.includes(input.product_id)) {
            if (!visitedProducts.has(input.product_id)) queue.push(input.product_id);
          }
        }
      }
      continue;
    }

    // ── Normal products ───────────────────────────────────────────────────────
    for (const recipe of getRecipesProducingProduct(productId)) {
      if (reachableRecipes.has(recipe.id)) continue;
      if (!isValidRecipe(recipe)) continue;

      // Only pull in this recipe if the needed product is its primary (first) output.
      // This prevents byproduct chains from bloating the reachable set — e.g. don't
      // include an industrial oil separator (crude oil is output[1]) just because the
      // BFS is looking for crude oil, which would then drag in fracking towers, quarries, etc.
      // Recipes already in the reachable set (added via a different product path) are
      // unaffected — their byproduct outputs remain available to the LP as a bonus.
      if (recipe.outputs[0]?.product_id !== productId) continue;

      reachableRecipes.set(recipe.id, recipe);

      for (const input of recipe.inputs) {
        if (!input.product_id || input.product_id === 'p_variableproduct') continue;
        if (committedProductIds.has(input.product_id)) continue;
        // Water/steam inputs queue their product so the branches above handle them
        if (WATER_PRODUCTS.has(input.product_id) || STEAM_PRODUCTS.has(input.product_id)) {
          if (!visitedProducts.has(input.product_id)) queue.push(input.product_id);
        } else if (!TEMPERATURE_PRODUCTS.includes(input.product_id)) {
          if (!visitedProducts.has(input.product_id)) queue.push(input.product_id);
        }
      }
    }
  }

  return reachableRecipes;
};

// ─── MPS Builder ──────────────────────────────────────────────────────────────

const buildAutoCompleteMPS = (
  deficits, reachableRecipes, committedProductIds = new Set(),
  activeWeights = [], unusedWeights = []
) => {
  const weights = computeObjectiveWeights(activeWeights, unusedWeights);

  // Collect all product rows
  const allProducts = new Set(deficits.keys());
  for (const recipe of reachableRecipes.values()) {
    for (const io of [...recipe.inputs, ...recipe.outputs]) {
      if (io.product_id && io.product_id !== 'p_variableproduct') {
        allProducts.add(io.product_id);
      }
    }
  }

  // Pre-compute which products have at least one producer in the reachable set
  const producibleProducts = new Set();
  for (const recipe of reachableRecipes.values()) {
    for (const output of recipe.outputs) {
      if (output.product_id && output.product_id !== 'p_variableproduct') {
        producibleProducts.add(output.product_id);
      }
    }
  }

  // Collect synthetic hot-water rows needed by boiler recipes
  const hotWaterRows = new Set();
  for (const recipe of reachableRecipes.values()) {
    if (recipe.machine_id !== 'm_boiler') continue;
    const input1 = recipe.inputs[1];
    if (input1?.product_id && WATER_PRODUCTS.has(input1.product_id)) {
      hotWaterRows.add(hotProduct(input1.product_id));
    }
  }

  const productRow = (productId) => sanitize(`prod_${productId}`);

  const varNameMap = new Map();
  for (const recipeId of reachableRecipes.keys()) {
    varNameMap.set(sanitize(`r_${recipeId}`), recipeId);
  }

  const out = [];
  out.push('NAME AUTOCOMPLETE\n');

  // ── ROWS ──────────────────────────────────────────────────────────────────
  out.push('ROWS\n');
  out.push(' N  obj\n');
  for (const productId of allProducts) {
    out.push(` G  ${productRow(productId)}\n`);
  }
  // Synthetic hot-water rows for boiler heat-source ports
  for (const hp of hotWaterRows) {
    out.push(` G  ${productRow(hp)}\n`);
  }

  // ── COLUMNS ───────────────────────────────────────────────────────────────
  out.push('COLUMNS\n');

  for (const [recipeId, recipe] of reachableRecipes) {
    const varName   = sanitize(`r_${recipeId}`);
    const cycleTime = recipe.cycle_time;

    const power = typeof recipe.power_consumption === 'number'
      ? recipe.power_consumption
      : (recipe.power_consumption?.max ?? 0);
    const pollution = typeof recipe.pollution === 'number' ? recipe.pollution : 0;

    const machine = getMachine(recipe.machine_id);
    const machineCost = machine && typeof machine.cost === 'number' ? machine.cost : 0;
    const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
    const powerFactor = recipe.power_type === 'HV' ? 2 : Math.ceil(power / 1500000) * 2;
    const modelCountPerMachine = 1 + powerFactor + (inputOutputCount * 2);

    // Per-machine cost × cycleTime converts "per machine" to "per run/s"
    const machineObjCoeff =
      weights.MODEL_COUNT_WEIGHT * modelCountPerMachine +
      weights.POWER_WEIGHT       * power +
      weights.POLLUTION_WEIGHT   * pollution +
      weights.COST_WEIGHT        * machineCost;

    const FIXED_RECIPE_COST = weights.MODEL_COUNT_WEIGHT > 0
      ? weights.MODEL_COUNT_WEIGHT * 0.01
      : 1e-6;

    const objCoeff = FIXED_RECIPE_COST + machineObjCoeff * cycleTime;
    out.push(`    ${varName}  obj  ${objCoeff}\n`);

    const isHeatSource = HEAT_SOURCE_MACHINE_IDS.has(recipe.machine_id);
    const isBoiler     = recipe.machine_id === 'm_boiler';

    // ── Outputs ──────────────────────────────────────────────────────────
    for (const output of recipe.outputs) {
      if (!output.product_id || output.product_id === 'p_variableproduct') continue;
      if (typeof output.quantity !== 'number') continue;

      out.push(`    ${varName}  ${productRow(output.product_id)}  ${output.quantity}\n`);

      // Non-boiler heat sources ALSO write to the synthetic hot-water row so the LP can
      // route their output to a boiler's heat-source port.
      // Boilers are excluded — they must not satisfy their own heat-source port.
      if (isHeatSource && !isBoiler && WATER_PRODUCTS.has(output.product_id)) {
        const hp = hotProduct(output.product_id);
        if (hotWaterRows.has(hp)) {
          out.push(`    ${varName}  ${productRow(hp)}  ${output.quantity}\n`);
        }
      }
    }

    // ── Inputs ───────────────────────────────────────────────────────────
    for (let i = 0; i < recipe.inputs.length; i++) {
      const input = recipe.inputs[i];
      if (!input.product_id || input.product_id === 'p_variableproduct') continue;
      if (typeof input.quantity !== 'number') continue;
      if (committedProductIds.has(input.product_id)) continue;

      if (isBoiler && i === 1 && WATER_PRODUCTS.has(input.product_id)) {
        // Heat-source port: consume from the synthetic row ONLY.
        // This prevents the LP from using a plain pump or looping the boiler's
        // own cooled-water output back into this port.
        const hp = hotProduct(input.product_id);
        if (hotWaterRows.has(hp)) {
          out.push(`    ${varName}  ${productRow(hp)}  ${-input.quantity}\n`);
        }
      } else {
        // Skip temperature product inputs if nothing in the reachable set produces them
        if (TEMPERATURE_PRODUCTS.includes(input.product_id) && !producibleProducts.has(input.product_id)) continue;
        out.push(`    ${varName}  ${productRow(input.product_id)}  ${-input.quantity}\n`);
      }
    }
  }

  // ── RHS ───────────────────────────────────────────────────────────────────
  out.push('RHS\n');
  for (const [productId, requiredRate] of deficits) {
    if (requiredRate > 0) {
      out.push(`    rhs  ${productRow(productId)}  ${requiredRate}\n`);
    }
  }

  out.push('ENDATA\n');

  // ── Debug: print boiler and heat source MPS rows ──────────────────────────
  console.group('[AutoComplete] MPS debug — boiler & heat source rows');
  console.log('hotWaterRows:', [...hotWaterRows]);
  for (const [recipeId, recipe] of reachableRecipes) {
    const isHS  = HEAT_SOURCE_MACHINE_IDS.has(recipe.machine_id);
    const isBoi = recipe.machine_id === 'm_boiler';
    if (!isHS && !isBoi) continue;
    const varName = sanitize(`r_${recipeId}`);
    const mpsText = out.join('');
    const lines = mpsText.split('\n').filter(l => l.includes(varName));
    console.log(`  [${recipeId}] ${recipe.name} (${recipe.machine_id}) MPS lines:`);
    lines.forEach(l => console.log(`    ${l}`));
  }
  console.groupEnd();

  return { mpsString: out.join(''), varNameMap };
};

// ─── Main Solve ───────────────────────────────────────────────────────────────

export const solveAutoComplete = async (
  deficits,
  committedProductIds = new Set(),
  activeWeights = [],
  unusedWeights = []
) => {
  if (!deficits || deficits.size === 0) {
    return { feasible: false, recipes: [], stats: { recipesEvaluated: 0, recipesSelected: 0 } };
  }

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

  const { mpsString, varNameMap } = buildAutoCompleteMPS(
    deficits, reachableRecipes, committedProductIds, activeWeights, unusedWeights
  );
  const solution = await solveMPSRaw(mpsString, varNameMap);

  if (!solution.feasible) {
    console.warn('[AutoComplete] LP infeasible — deficiencies may be unresolvable with available recipes');
    return { feasible: false, recipes: [], stats: { recipesEvaluated: reachableRecipes.size, recipesSelected: 0 } };
  }

  const results = [];
  for (const [recipeId, recipe] of reachableRecipes) {
    const rate = solution[recipeId] ?? 0;
    if (rate < EPSILON) continue;
    const machineCount = rate * recipe.cycle_time;
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
    stats: { recipesEvaluated: reachableRecipes.size, recipesSelected: results.length },
  };
};