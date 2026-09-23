import assert from 'node:assert/strict';
import { createServer } from 'vite';

const viteServer = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { buildMPS, buildResponseFromRawValues } = await viteServer.ssrLoadModule(
  '/src/solver/ratioOptimizerWorker.ts',
);

function makeNodes(inputQuantity = 6) {
  return [
    {
      id: 'source',
      currentMachineCount: 1,
      minimumMachineCount: 0,
      maximumMachineCount: null,
      isTarget: false,
      powerUse: 0,
      powerOutput: 0,
      pollution: 0,
      machineCost: 1,
      machineCostIndependentOfMachineCount: 0,
      hasInfiniteMachineCost: false,
      modelCount: 1,
      modelCountIndependentOfMachineCount: 0,
      machineSpace: 1,
      machineSpaceIndependentOfMachineCount: 0,
      inputs: [],
      outputs: [{ productId: 'fluid', quantity: inputQuantity, hasSinkConnection: false }],
    },
    {
      id: 'consumer',
      currentMachineCount: 1,
      minimumMachineCount: 0,
      maximumMachineCount: null,
      isTarget: true,
      powerUse: 0,
      powerOutput: 0,
      pollution: 0,
      machineCost: 1,
      machineCostIndependentOfMachineCount: 0,
      hasInfiniteMachineCost: false,
      modelCount: 1,
      modelCountIndependentOfMachineCount: 0,
      machineSpace: 1,
      machineSpaceIndependentOfMachineCount: 0,
      inputs: [
        {
          productId: 'fluid',
          quantity: inputQuantity,
          isSink: false,
          independentOfMachineCount: false,
          flowDependencies: [],
          pollutionPerFlow: 0,
        },
      ],
      outputs: [],
    },
  ];
}

const connections = [
  {
    id: 'supply',
    sourceNodeId: 'source',
    sourceOutputIndex: 0,
    targetNodeId: 'consumer',
    targetInputIndex: 0,
  },
];

function solveRaw(inputQuantity, deficit, flow = 6) {
  return buildResponseFromRawValues(
    {
      'm_source': 1,
      'm_consumer': 1,
      'f_supply': flow,
      'deficit_consumer_0': deficit,
    },
    connections,
    makeNodes(inputQuantity),
  );
}

const meaningful = solveRaw(6.00000001, 1e-8);
assert.equal(meaningful.feasible, false);
assert.equal(meaningful.diagnostics?.deficientInputs[0]?.deficiency, 1e-8);
assert.equal(meaningful.diagnostics?.deficientInputs[0]?.requiredRate, 6.00000001);
assert.equal(meaningful.diagnostics?.deficientInputs[0]?.suppliedRate, 6);

const numericalNoise = solveRaw(6.000000001, 1e-9);
assert.equal(numericalNoise.feasible, true);

const tinyFlow = solveRaw(1.001e-12, 0, 1.001e-12);
assert.ok((tinyFlow.connectionFlows?.supply ?? 0) > 1e-12);
const zeroFlow = solveRaw(1e-12, 0, 1e-12);
assert.equal(zeroFlow.connectionFlows?.supply, 0);

const retainedMachine = buildResponseFromRawValues(
  { m_source: 1.001e-7, m_consumer: 1 },
  [],
  makeNodes(),
);
assert.equal(retainedMachine.machineCounts?.source, 1.001e-7);

const cleanedMachine = buildResponseFromRawValues(
  { m_source: 1e-7, m_consumer: 1 },
  [],
  makeNodes(),
);
assert.equal(cleanedMachine.machineCounts?.source, 0);

const continuousMachine = buildResponseFromRawValues(
  { m_source: 1e-7, m_consumer: 1 },
  [],
  makeNodes(),
  undefined,
  'continuous',
);
assert.equal(continuousMachine.machineCounts?.source, 1e-7);

const smallerContinuousMachine = buildResponseFromRawValues(
  { m_source: 1e-8, m_consumer: 1 },
  [],
  makeNodes(),
  undefined,
  'continuous',
);
assert.equal(smallerContinuousMachine.machineCounts?.source, 1e-8);

const zeroContinuousMachine = buildResponseFromRawValues(
  { m_source: 1e-12, m_consumer: 1 },
  [],
  makeNodes(),
  undefined,
  'continuous',
);
assert.equal(zeroContinuousMachine.machineCounts?.source, 0);

const continuousFlow = buildResponseFromRawValues(
  { m_source: 1e-7, m_consumer: 1, f_supply: 1e-7 },
  connections,
  makeNodes(1),
  undefined,
  'continuous',
);
assert.equal(continuousFlow.machineCounts?.source, 1e-7);
assert.equal(continuousFlow.connectionFlows?.supply, 1e-7);

const repeatedA = solveRaw(6.00000001, 1e-8);
const repeatedB = solveRaw(6.00000001, 1e-8);
assert.deepEqual(repeatedA, repeatedB);

const tinyShortageBound = buildMPS(makeNodes(), connections, {
  objective: 'shortage',
  bounds: { shortage: 5e-12 },
}).mpsString;
const tinyShortageRhs = tinyShortageBound.match(/RHS  limit_shortage  ([^\r\n]+)/)?.[1];
assert.ok(tinyShortageRhs, 'the fallback should emit a shortage lock row');
assert.ok(
  Number(tinyShortageRhs) > 5e-12 && Number(tinyShortageRhs) < 1e-8,
  'tiny shortage locks must use a rate-scale tolerance rather than a 1e-6 floor',
);

const normalShortageBound = buildMPS(makeNodes(), connections, {
  objective: 'shortage',
  bounds: { shortage: 6 },
}).mpsString;
const normalShortageRhs = normalShortageBound.match(/RHS  limit_shortage  ([^\r\n]+)/)?.[1];
assert.ok(normalShortageRhs);
assert.ok(Number(normalShortageRhs) > 6 && Number(normalShortageRhs) < 6.00001);

await viteServer.close();
console.log('Ratio Worker precision tests passed.');
