import assert from 'node:assert/strict';
import { createServer } from 'vite';

const viteServer = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { initializeDatabase } = await viteServer.ssrLoadModule('/src/data/lookup.ts');
await initializeDatabase();
const { solveFlowPipeline } = await viteServer.ssrLoadModule('/src/solver/solverPipeline.ts');

const source = {
  id: 'source',
  type: 'recipe',
  position: { x: 0, y: 0 },
  data: {
    recipeId: 'r_water_pump_01',
    machineCount: 1e-8,
    settings: {},
  },
};
const waste = {
  id: 'waste',
  type: 'recipe',
  position: { x: 200, y: 0 },
  data: {
    recipeId: 'r_underground_waste_facility_01',
    machineCount: 1,
    settings: {},
  },
};
const edge = {
  id: 'water-to-waste',
  type: 'default',
  source: 'source',
  sourceHandle: 'source-output-0',
  target: 'waste',
  targetHandle: 'waste-input-1',
};

const result = solveFlowPipeline([source, waste], [edge]);
const resolvedWaste = result.nodeRecipes.waste;
assert.ok(resolvedWaste, 'flow-dependent recipe should resolve');
assert.ok(
  (resolvedWaste.inputs[2]?.quantity ?? 0) > 0,
  'a meaningful sub-1e-6 flow change should trigger the corrected graph pass',
);
assert.ok(
  (result.edgeFlows['water-to-waste'] ?? 0) > 1e-12,
  'the tiny physical flow should survive the pipeline',
);
assert.ok((result.iterationsRun ?? 0) <= 8, 'temperature coupling must retain its pass limit');

await viteServer.close();
console.log('Solver pipeline precision tests passed.');
