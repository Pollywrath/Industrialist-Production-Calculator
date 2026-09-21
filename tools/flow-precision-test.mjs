import assert from 'node:assert/strict';
import { calculateFlows } from '../src/solver/flowSolver.ts';

function makeGraph(outputRate, inputRate, id = 'connection') {
  return {
    nodes: {
      producer: {
        inputs: [],
        outputs: [{ productId: 'fluid', rate: outputRate }],
      },
      consumer: {
        inputs: [{ productId: 'fluid', rate: inputRate }],
        outputs: [],
      },
    },
    products: {
      fluid: {
        producers: [{ type: 'output', nodeId: 'producer', index: 0, rate: outputRate }],
        consumers: [{ type: 'input', nodeId: 'consumer', index: 0, rate: inputRate }],
        connections: [
          {
            id,
            sourceNodeId: 'producer',
            sourceOutputIndex: 0,
            sourceRate: outputRate,
            targetNodeId: 'consumer',
            targetInputIndex: 0,
            targetRate: inputRate,
          },
        ],
      },
    },
  };
}

const normal = calculateFlows(makeGraph(2, 1.5));
const normalInput = normal.results.get('consumer')?.inputFlows[0];
const normalOutput = normal.results.get('producer')?.outputFlows[0];
assert.equal(normalInput?.connected, 1.5);
assert.equal(normalInput?.deficit, 0);
assert.equal(normalInput?.hasDeficiency, false);
assert.equal(normalOutput?.excess, 0.5);
assert.equal(normalOutput?.hasExcess, true);

const tiny = calculateFlows(makeGraph(1.001e-12, 1.001e-12, 'tiny'));
const tinyInput = tiny.results.get('consumer')?.inputFlows[0];
const tinyOutput = tiny.results.get('producer')?.outputFlows[0];
assert.ok((tiny.edgeFlows.tiny ?? 0) > 1e-12);
assert.equal(tinyInput?.deficit, 0);
assert.equal(tinyInput?.hasDeficiency, false);
assert.equal(tinyOutput?.excess, 0);
assert.equal(tinyOutput?.hasExcess, false);

const shortage = calculateFlows(makeGraph(0, 1e-9, 'shortage'));
const shortageInput = shortage.results.get('consumer')?.inputFlows[0];
assert.equal(shortage.edgeFlows.shortage, 0);
assert.equal(shortageInput?.deficit, 1e-9);
assert.equal(shortageInput?.hasDeficiency, true);

console.log('Flow precision contract tests passed.');
