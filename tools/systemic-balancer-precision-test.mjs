import assert from 'node:assert/strict';
import { createServer } from 'vite';

const viteServer = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { calculateBalancedRate } = await viteServer.ssrLoadModule(
  '/src/solver/systemicBalancer.ts',
);

const recipe = {
  id: 'consumer',
  name: 'Consumer',
  machine_id: 'machine',
  cycle_time: 1,
  power_use: 0,
  power_type: 'MV',
  pollution: 0,
  inputs: [{ product_id: 'p_test', quantity: 1 }],
  outputs: [],
};
const nodes = [
  {
    id: 'source',
    type: 'recipe',
    position: { x: 0, y: 0 },
    data: { recipeId: 'source', machineCount: 1, settings: {} },
  },
  {
    id: 'consumer',
    type: 'recipe',
    position: { x: 200, y: 0 },
    data: { recipeId: 'consumer', machineCount: 1, settings: {} },
  },
];
const edges = [
  {
    id: 'supply',
    source: 'source',
    sourceHandle: 'source-output-0',
    target: 'consumer',
    targetHandle: 'consumer-input-0',
    type: 'default',
  },
];
const flowResults = new Map([
  [
    'source',
    {
      inputFlows: [],
      outputFlows: [
        {
          rate: 1.001e-8,
          connected: 1.001e-8,
          deficit: 0,
          excess: 0,
          hasDeficiency: false,
          hasExcess: false,
        },
      ],
    },
  ],
  [
    'consumer',
    {
      inputFlows: [
        {
          rate: 1.001e-8,
          connected: 1.001e-8,
          deficit: 0,
          excess: 0,
          hasDeficiency: false,
          hasExcess: false,
        },
      ],
      outputFlows: [],
    },
  ],
]);

const balancedRate = calculateBalancedRate(
  'consumer',
  { side: 'input', index: 0 },
  recipe,
  nodes,
  edges,
  flowResults,
  {
    'source-output-0': 'p_test',
    'consumer-input-0': 'p_test',
  },
);
assert.ok(balancedRate > 1e-8, 'internal balancing must preserve sub-1e-8 rates');
assert.ok(Math.abs(balancedRate - 1.001e-8) < 1e-12);

await viteServer.close();
console.log('Systemic balancer precision tests passed.');
