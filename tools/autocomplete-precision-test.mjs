import assert from 'node:assert/strict';
import { createServer } from 'vite';

const viteServer = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

const {
  getGeneratedOutputNoiseIds,
  isAutocompleteCandidateActive,
  isAutocompleteEdgeActive,
} = await viteServer.ssrLoadModule('/src/solver/autocomplete.ts');

assert.equal(isAutocompleteEdgeActive(1e-12), false);
assert.equal(isAutocompleteEdgeActive(1.001e-12), true);
assert.equal(isAutocompleteEdgeActive(1e-6), true);
assert.equal(isAutocompleteEdgeActive(undefined), false);

assert.equal(isAutocompleteCandidateActive(false, 1e-8, false, false), true);
assert.equal(isAutocompleteCandidateActive(false, 1e-12, false, false), false);
assert.equal(isAutocompleteCandidateActive(false, 0, true, false), true);
assert.equal(isAutocompleteCandidateActive(false, 0, false, true), true);
assert.equal(isAutocompleteCandidateActive(true, 0, false, false), true);

const makeCandidate = (id, kind, machineCount, isTarget, quantity = 1) => ({
  kind,
  key: id,
  node: { id, data: { isTarget, machineCount, recipeId: id } },
  recipe: {
    id,
    name: id,
    cycle_time: 1,
    inputs: [],
    outputs: [{ product_id: 'iron', quantity }],
  },
});

const target = makeCandidate('target', 'existing', 1, true, 1);
const tinyNormalCandidate = makeCandidate('tiny-normal', 'generated', 1e-8, false, 1);
const tinyNormalEdge = {
  id: 'tiny-normal-edge',
  source: 'tiny-normal',
  sourceHandle: 'tiny-normal-output-0',
  target: 'target',
  targetHandle: 'target-input-0',
};
const normalNoiseModel = {
  candidates: [target, tinyNormalCandidate],
  edges: [tinyNormalEdge],
  preservedEdgeEndpointKeys: new Set(),
};
assert.deepEqual(
  [...getGeneratedOutputNoiseIds(normalNoiseModel, { 'tiny-normal': 1e-8 }, { 'tiny-normal-edge': 1e-8 })],
  ['tiny-normal'],
);

const tinyTarget = makeCandidate('tiny-target', 'existing', 1e-8, true, 1);
const tinyProportionalCandidate = makeCandidate('tiny-proportional', 'generated', 1e-8, false, 1);
const tinyProportionalEdge = {
  id: 'tiny-proportional-edge',
  source: 'tiny-proportional',
  sourceHandle: 'tiny-proportional-output-0',
  target: 'tiny-target',
  targetHandle: 'tiny-target-input-0',
};
assert.deepEqual(
  [...getGeneratedOutputNoiseIds(
    {
      candidates: [tinyTarget, tinyProportionalCandidate],
      edges: [tinyProportionalEdge],
      preservedEdgeEndpointKeys: new Set(),
    },
    { 'tiny-proportional': 1e-8 },
    { 'tiny-proportional-edge': 1e-8 },
  )],
  [],
);

await viteServer.close();
console.log('Autocomplete precision tests passed.');
