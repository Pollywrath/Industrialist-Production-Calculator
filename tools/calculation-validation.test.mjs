import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import 'fake-indexeddb/auto';
import { createServer } from 'vite';

const viteServer = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
});
const lookup = await viteServer.ssrLoadModule('/src/data/lookup.ts');
await lookup.initializeDatabase();
const validation = await viteServer.ssrLoadModule('/src/utils/dataValidation.ts');
const propagator = await viteServer.ssrLoadModule('/src/solver/temperaturePropagator.ts');
const solverPipeline = await viteServer.ssrLoadModule('/src/solver/solverPipeline.ts');
const flowSolverHook = await viteServer.ssrLoadModule('/src/hooks/useFlowSolver.ts');
const registry = await viteServer.ssrLoadModule('/src/data/registry.ts');
const resultStore = await viteServer.ssrLoadModule('/src/stores/useFlowResultStore.ts');
const freshness = await viteServer.ssrLoadModule('/src/utils/flowResultFreshness.ts');
const idGenerator = await viteServer.ssrLoadModule('/src/utils/idGenerator.ts');

after(async () => {
  registry.setSpecialRecipeOverrides({}, []);
  await viteServer.close();
});

const products = lookup.getDefaultProducts();
const machines = lookup.getDefaultMachines();
const recipes = lookup.getDefaultRecipes();
const researches = lookup.getDefaultResearches();
const productIds = new Set(products.map((product) => product.id));
const machineIds = new Set(machines.map((machine) => machine.id));
const researchIds = new Set(researches.map((research) => research.id));

function recipeNode(id, recipeId, settings = {}) {
  return {
    id,
    type: 'recipe',
    position: { x: 0, y: 0 },
    data: { recipeId, machineCount: 1, settings },
  };
}

function installDriftingSteamRecipe() {
  const recipeId = 'r_steam_turbine_01';
  const baseRecipe = lookup.getRecipe(recipeId);
  const originalSpecialRecipe = registry.getSpecialRecipe(recipeId);
  assert.ok(baseRecipe);
  assert.ok(originalSpecialRecipe);

  registry.setSpecialRecipeOverrides(
    {
      [recipeId]: {
        ...originalSpecialRecipe,
        settings: {
          drift_temp: { type: 'number', label: 'Drift temperature', default: 18 },
        },
        inputTemperatureSettings: { 0: 'drift_temp' },
        compute: (settings) => ({
          ...baseRecipe,
          inputs: [{ product_id: 'p_steam', quantity: 1 }],
          outputs: [
            {
              ...baseRecipe.outputs[0],
              product_id: 'p_steam',
              quantity: 1,
              temperature: Number(settings.drift_temp) + 1,
            },
          ],
        }),
      },
    },
    [],
  );
}

function installAlternatingTemperatureCouplingRecipe() {
  const recipeId = 'r_steam_turbine_01';
  const baseRecipe = lookup.getRecipe(recipeId);
  const originalSpecialRecipe = registry.getSpecialRecipe(recipeId);
  assert.ok(baseRecipe);
  assert.ok(originalSpecialRecipe);

  registry.setSpecialRecipeOverrides(
    {
      [recipeId]: {
        ...originalSpecialRecipe,
        settings: {
          role: {
            type: 'select',
            label: 'Role',
            default: 'switch',
            options: [
              { label: 'Switch', value: 'switch' },
              { label: 'Hot source', value: 'hot-source' },
              { label: 'Cold source', value: 'cold-source' },
            ],
          },
          loop_temp: { type: 'number', label: 'Loop temperature', default: 0 },
        },
        inputTemperatureSettings: { 0: 'loop_temp' },
        compute: (settings) => {
          if (settings.role === 'hot-source') {
            return {
              ...baseRecipe,
              inputs: [],
              outputs: [{ product_id: 'p_steam', quantity: 1, temperature: 100 }],
            };
          }
          if (settings.role === 'cold-source') {
            return {
              ...baseRecipe,
              inputs: [],
              outputs: [{ product_id: 'p_steam', quantity: 1, temperature: 18 }],
            };
          }
          return {
            ...baseRecipe,
            inputs: [
              {
                product_id: 'p_steam',
                quantity: Number(settings.loop_temp) < 50 ? 1.75 : 1.25,
              },
            ],
            outputs: [],
          };
        },
      },
    },
    [],
  );
}

test('built-in database remains valid under finite, identity, and reference checks', () => {
  const result = validation.validateFullDatabase(products, machines, recipes, researches);
  assert.equal(result.valid, true, JSON.stringify(result, null, 2));
});

test('convergent temperature propagation reports its iteration count', () => {
  const node = recipeNode('steam', 'r_steam_turbine_01');
  const result = propagator.propagateTemperatures([node], [], {}, {});

  assert.equal(result.converged, true);
  assert.equal(result.iterationsRun, 2);
});

test('temperature propagation safely handles prototype-named graph IDs', () => {
  const recipe = recipes.find(
    (candidate) =>
      !registry.getSpecialRecipe(candidate.id) &&
      candidate.inputs.length > 0 &&
      candidate.outputs.length > 0,
  );
  assert.ok(recipe);
  const node = recipeNode('__proto__', recipe.id);
  const edge = {
    id: '__proto__',
    source: node.id,
    sourceHandle: idGenerator.buildHandleId(node.id, 'output', 0),
    target: node.id,
    targetHandle: idGenerator.buildHandleId(node.id, 'input', 0),
  };
  const edgeFlows = Object.create(null);
  edgeFlows[edge.id] = 1;
  const result = propagator.propagateTemperatures([node], [edge], edgeFlows, {});

  assert.equal(Object.hasOwn(result.inputTemps, node.id), true);
  assert.equal(Object.getPrototypeOf(result.inputTemps), null);
  assert.equal(Object.getPrototypeOf(result.inputTemps[node.id]), null);
  assert.equal(Object.hasOwn(result.edgeTemps, edge.id), true);
  assert.equal(Object.getPrototypeOf(result.edgeTemps), null);
  assert.equal(Object.getPrototypeOf(result.settingsOverrides), null);
});

test('temperature propagation reports the iteration cap for a nonconvergent special recipe', () => {
  const recipeId = 'r_steam_turbine_01';
  installDriftingSteamRecipe();

  const node = recipeNode('drifting-steam', recipeId);
  const edge = {
    id: 'self-edge',
    source: node.id,
    sourceHandle: idGenerator.buildHandleId(node.id, 'output', 0),
    target: node.id,
    targetHandle: idGenerator.buildHandleId(node.id, 'input', 0),
  };
  const result = propagator.propagateTemperatures([node], [edge], { [edge.id]: 1 }, {});

  assert.equal(result.converged, false);
  assert.equal(result.iterationsRun, propagator.MAX_TEMPERATURE_PROPAGATION_ITERATIONS);
});

test('pipeline diagnostics are committed into flow results and stale graph or database versions fail the commit guard', () => {
  installDriftingSteamRecipe();
  const node = recipeNode('steam-pipeline', 'r_steam_turbine_01');
  const edge = {
    id: 'pipeline-self-edge',
    source: node.id,
    sourceHandle: idGenerator.buildHandleId(node.id, 'output', 0),
    target: node.id,
    targetHandle: idGenerator.buildHandleId(node.id, 'input', 0),
  };
  const result = solverPipeline.solveFlowPipeline([node], [edge], {});
  const graphVersion = 11;
  const dataDbVersion = 7;

  assert.equal(result.temperatureDiagnostics.converged, false);
  assert.equal(result.temperatureDiagnostics.propagation.limitReached, true);
  assert.equal(result.temperatureDiagnostics.coupling.converged, true);
  assert.equal(result.temperatureDiagnostics.coupling.limitReached, false);

  const beforeStaleCommit = resultStore.useFlowResultStore.getState();
  assert.equal(
    flowSolverHook.commitFlowSolverResultIfCurrent(
      result,
      graphVersion,
      dataDbVersion,
      graphVersion + 1,
      dataDbVersion,
    ),
    false,
  );
  assert.equal(
    flowSolverHook.commitFlowSolverResultIfCurrent(
      result,
      graphVersion,
      dataDbVersion,
      graphVersion,
      dataDbVersion + 1,
    ),
    false,
  );
  assert.equal(
    resultStore.useFlowResultStore.getState().temperatureDiagnostics,
    beforeStaleCommit.temperatureDiagnostics,
  );
  assert.equal(
    flowSolverHook.commitFlowSolverResultIfCurrent(
      result,
      graphVersion,
      dataDbVersion,
      graphVersion,
      dataDbVersion,
    ),
    true,
  );

  const committed = resultStore.useFlowResultStore.getState();
  assert.deepEqual(committed.temperatureDiagnostics, result.temperatureDiagnostics);
  assert.equal(committed.temperatureDiagnostics.propagation.converged, false);
  assert.equal(committed.temperatureDiagnostics.propagation.limitReached, true);
  assert.equal(committed.graphVersion, graphVersion);
  assert.equal(committed.dataDbVersion, dataDbVersion);
  assert.equal(
    freshness.areFlowResultVersionsCurrent(
      graphVersion,
      dataDbVersion,
      graphVersion,
      dataDbVersion,
    ),
    true,
  );
  assert.equal(
    freshness.areFlowResultVersionsCurrent(
      graphVersion,
      dataDbVersion,
      graphVersion + 1,
      dataDbVersion,
    ),
    false,
  );
  assert.equal(
    freshness.areFlowResultVersionsCurrent(
      graphVersion,
      dataDbVersion,
      graphVersion,
      dataDbVersion + 1,
    ),
    false,
  );
});

test('temperature coupling reports its pass limit and version-current diagnostics remain nonconverged', () => {
  const recipeId = 'r_steam_turbine_01';
  installAlternatingTemperatureCouplingRecipe();
  const nodes = [
    recipeNode('coupled-hot-source', recipeId, { role: 'hot-source' }),
    recipeNode('coupled-cold-source', recipeId, { role: 'cold-source' }),
    recipeNode('coupled-switch', recipeId, { role: 'switch' }),
  ];
  const edges = [
    {
      id: 'coupled-cold-to-switch',
      source: 'coupled-cold-source',
      sourceHandle: idGenerator.buildHandleId('coupled-cold-source', 'output', 0),
      target: 'coupled-switch',
      targetHandle: idGenerator.buildHandleId('coupled-switch', 'input', 0),
    },
    {
      id: 'coupled-hot-to-switch',
      source: 'coupled-hot-source',
      sourceHandle: idGenerator.buildHandleId('coupled-hot-source', 'output', 0),
      target: 'coupled-switch',
      targetHandle: idGenerator.buildHandleId('coupled-switch', 'input', 0),
    },
  ];
  const result = solverPipeline.solveFlowPipeline(nodes, edges, {});
  const diagnostics = result.temperatureDiagnostics;
  const graphVersion = 21;
  const dataDbVersion = 8;

  assert.equal(
    diagnostics.coupling.converged,
    false,
    JSON.stringify({
      diagnostics,
      edgeFlows: result.edgeFlows,
      inputTemps: result.inputTemps,
      switchRecipe: result.nodeRecipes['coupled-switch'],
    }),
  );
  assert.equal(diagnostics.coupling.passesRun, diagnostics.coupling.passLimit);
  assert.equal(diagnostics.coupling.limitReached, true);
  assert.equal(diagnostics.converged, false);

  assert.equal(
    flowSolverHook.commitFlowSolverResultIfCurrent(
      result,
      graphVersion,
      dataDbVersion,
      graphVersion,
      dataDbVersion,
    ),
    true,
  );
  const committed = resultStore.useFlowResultStore.getState();
  assert.equal(committed.graphVersion, graphVersion);
  assert.equal(committed.dataDbVersion, dataDbVersion);
  assert.equal(committed.temperatureDiagnostics.coupling.converged, false);
  assert.equal(committed.temperatureDiagnostics.coupling.passesRun, diagnostics.coupling.passLimit);
  assert.equal(
    flowSolverHook.commitFlowSolverResultIfCurrent(
      result,
      graphVersion,
      dataDbVersion,
      graphVersion + 1,
      dataDbVersion,
    ),
    false,
  );
  assert.equal(
    resultStore.useFlowResultStore.getState().temperatureDiagnostics,
    committed.temperatureDiagnostics,
  );
});

test('numeric validators reject non-finite values while preserving the machine cost sentinel', () => {
  for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
    const product = {
      id: 'p_phase3_validation',
      name: 'Validation product',
      sell_price: value,
      rp_multiplier: 1,
      type: 'Item',
    };
    assert.ok(
      validation.validateProduct(product).errors.some((error) => error.field === 'sell_price'),
    );
    assert.ok(
      validation
        .validateProduct({ ...product, sell_price: 1, rp_multiplier: value })
        .errors.some((error) => error.field === 'rp_multiplier'),
    );
  }

  const machine = machines.find((entry) => Number.isFinite(entry.cost) && entry.cost > 0);
  assert.ok(machine);
  assert.equal(validation.validateMachine(machine, researchIds, machineIds).valid, true);
  assert.equal(
    validation.validateMachine(
      { ...machine, cost: Number.POSITIVE_INFINITY },
      researchIds,
      machineIds,
    ).valid,
    true,
  );
  assert.equal(
    validation.validateMachine({ ...machine, cost: 'infinity' }, researchIds, machineIds).valid,
    true,
  );
  for (const value of [Number.NEGATIVE_INFINITY, Number.NaN]) {
    assert.ok(
      validation
        .validateMachine({ ...machine, cost: value }, researchIds, machineIds)
        .errors.some((error) => error.field === 'cost'),
    );
  }

  const recipe = recipes.find((entry) => entry.id === 'r_steam_turbine_01');
  assert.ok(recipe);
  assert.equal(validation.validateRecipe(recipe, productIds, machineIds).valid, true);
  for (const field of ['cycle_time', 'power_use', 'pollution']) {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      assert.ok(
        validation
          .validateRecipe({ ...recipe, [field]: value }, productIds, machineIds)
          .errors.some((error) => error.field === field),
      );
    }
  }

  const nestedRecipeFields = [
    ['inputs[0].quantity', (value) => ({ inputs: [{ ...recipe.inputs[0], quantity: value }] })],
    ['outputs[0].quantity', (value) => ({ outputs: [{ ...recipe.outputs[0], quantity: value }] })],
    [
      'outputs[0].temperature',
      (value) => ({ outputs: [{ ...recipe.outputs[0], temperature: value }] }),
    ],
    [
      'powerEffects[0].power_use',
      (value) => ({ powerEffects: [{ power_type: 'MV', power_use: value }] }),
    ],
  ];
  for (const [field, update] of nestedRecipeFields) {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      assert.ok(
        validation
          .validateRecipe({ ...recipe, ...update(value) }, productIds, machineIds)
          .errors.some((error) => error.field === field),
      );
    }
  }

  const validResearch = researches.find((entry) => entry.prerequisites.length === 0);
  assert.ok(validResearch);
  for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
    assert.ok(
      validation
        .validateResearch({ ...validResearch, rp_cost: value }, researchIds)
        .errors.some((error) => error.field === 'rp_cost'),
    );
  }
});

test('recipe and research references are checked while optional fields and text prerequisites remain valid', () => {
  const recipe = recipes.find((entry) => entry.id === 'r_steam_turbine_01');
  const research = researches.find((entry) => entry.prerequisites.length === 0);
  assert.ok(recipe);
  assert.ok(research);

  const missingProduct = {
    ...recipe,
    inputs: [{ ...recipe.inputs[0], product_id: 'p_missing_phase3' }],
  };
  assert.ok(
    validation
      .validateRecipe(missingProduct, productIds, machineIds)
      .errors.some((error) => error.field === 'inputs[0].product_id'),
  );

  const invalidDependency = {
    ...recipe,
    inputs: [
      {
        ...recipe.inputs[0],
        flowDependencies: [{ sourceInputIndex: 4, coefficient: Number.POSITIVE_INFINITY }],
      },
    ],
  };
  const dependencyErrors = validation.validateRecipe(
    invalidDependency,
    productIds,
    machineIds,
  ).errors;
  assert.ok(dependencyErrors.some((error) => error.field.endsWith('.sourceInputIndex')));
  assert.ok(dependencyErrors.some((error) => error.field.endsWith('.coefficient')));

  const optionalInput = {
    ...recipe,
    inputs: [{ ...recipe.inputs[0], flowDependencies: undefined, pollutionPerFlow: undefined }],
  };
  assert.equal(validation.validateRecipe(optionalInput, productIds, machineIds).valid, true);
  assert.equal(
    validation.validateRecipe(
      { ...recipe, inputs: [{ product_id: 'any_fluid', quantity: 1 }] },
      productIds,
      machineIds,
    ).valid,
    true,
  );

  const textPrerequisite = { ...research, prerequisites: ['Sell 1 validation item'] };
  assert.equal(validation.validateResearch(textPrerequisite, researchIds).valid, true);
  const unresolvedPrerequisite = { ...research, prerequisites: ['s_missing_phase3'] };
  assert.ok(
    validation
      .validateResearch(unresolvedPrerequisite, researchIds)
      .errors.some((error) => error.field === 'prerequisites[0]'),
  );
});

test('duplicate identifiers are reported with both database context and record indexes', () => {
  const result = validation.validateFullDatabase(
    [...products, { ...products[0] }],
    machines,
    recipes,
    researches,
  );

  assert.equal(result.valid, false);
  assert.ok(
    result.productErrors.some((entry) =>
      entry.errors.some((error) => /Duplicate product ID/.test(error.message)),
    ),
  );

  const duplicateCases = [
    ['machines', 'machineErrors', 'Duplicate machine ID'],
    ['recipes', 'recipeErrors', 'Duplicate recipe ID'],
    ['researches', 'researchErrors', 'Duplicate research ID'],
  ];
  for (const [recordsKey, errorsKey, expectedMessage] of duplicateCases) {
    const database = { products, machines, recipes, researches };
    const records = database[recordsKey];
    const duplicateDatabase = {
      products: recordsKey === 'products' ? [...records, { ...records[0] }] : products,
      machines: recordsKey === 'machines' ? [...records, { ...records[0] }] : machines,
      recipes: recordsKey === 'recipes' ? [...records, { ...records[0] }] : recipes,
      researches: recordsKey === 'researches' ? [...records, { ...records[0] }] : researches,
    };
    const duplicateResult = validation.validateFullDatabase(
      duplicateDatabase.products,
      duplicateDatabase.machines,
      duplicateDatabase.recipes,
      duplicateDatabase.researches,
    );
    assert.ok(
      duplicateResult[errorsKey].some((entry) =>
        entry.errors.some((error) => error.message.includes(expectedMessage)),
      ),
      expectedMessage,
    );
  }

  assert.deepEqual(validation.findDuplicateIdentifiers(['product:a', 'product:a', 'machine:a']), [
    { id: 'product:a', index: 1, firstIndex: 0 },
  ]);
});
