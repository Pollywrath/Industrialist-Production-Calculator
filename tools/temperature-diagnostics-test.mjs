import assert from 'node:assert/strict';
import { createServer } from 'vite';

const viteServer = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { initializeDatabase } = await viteServer.ssrLoadModule('/src/data/lookup.ts');
await initializeDatabase();
const { propagateTemperatures } = await viteServer.ssrLoadModule('/src/solver/temperaturePropagator.ts');
const { formatDiagnosticQuantity } = await viteServer.ssrLoadModule('/src/utils/unitFormatting.ts');

function makeBoilerNode(id, settings) {
  return {
    id,
    type: 'recipe',
    position: { x: 0, y: 0 },
    data: {
      recipeId: 'r_boiler_01',
      machineCount: 1,
      settings,
    },
  };
}

const source = makeBoilerNode('source', {
  enable_coolant: 'no',
  water_temp: 220,
  heat_loss: 0,
});
const target = makeBoilerNode('target', {
  enable_coolant: 'yes',
  water_temp: 18,
  coolant_temp: 240,
  heat_loss: 0,
});
const edge = {
  id: 'hot-steam',
  source: 'source',
  sourceHandle: 'source-output-0',
  target: 'target',
  targetHandle: 'target-input-1',
  type: 'default',
};

const tinyFlow = propagateTemperatures([source, target], [edge], {
  'hot-steam': 1.001e-12,
});
const sourceTemperature = tinyFlow.edgeTemps['hot-steam'];
assert.ok(sourceTemperature > 200, `expected hot source temperature, got ${sourceTemperature}`);
assert.ok(
  Math.abs(tinyFlow.inputTemps.target[1] - sourceTemperature) < 1e-9,
  'tiny positive flow should contribute to weighted input temperature',
);

const zeroFlow = propagateTemperatures([source, target], [edge], {
  'hot-steam': 1e-12,
});
assert.equal(
  zeroFlow.inputTemps.target[1],
  240,
  'numerically zero flow should use the configured coolant temperature',
);

assert.equal(formatDiagnosticQuantity(1.25e-5), '1.25e-5');
assert.equal(formatDiagnosticQuantity(-1.25e-5), '-1.25e-5');
assert.notEqual(formatDiagnosticQuantity(1e-6), '0');
assert.equal(formatDiagnosticQuantity(1.25), '1.25');

await viteServer.close();
console.log('Temperature and diagnostic precision tests passed.');
