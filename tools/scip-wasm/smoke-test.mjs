import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [bundleDir, smokeTestsDir] = process.argv.slice(2);

if (!bundleDir || !smokeTestsDir) {
  throw new Error('Usage: node smoke-test.mjs <bundleDir> <smokeTestsDir>');
}

const moduleUrl = pathToFileURL(path.join(bundleDir, 'scip.js')).href;
const { default: createSCIP } = await import(moduleUrl);

const stdout = [];
const stderr = [];
const scip = await createSCIP({
  locateFile: (file) => path.join(bundleDir, file),
  print: (text) => stdout.push(text),
  printErr: (text) => stderr.push(text),
});

async function runModel(fileName, assertSolution) {
  stdout.length = 0;
  stderr.length = 0;

  try {
    scip.FS.unlink(fileName);
  } catch {
    // It is fine when this is the first smoke-test run.
  }

  const modelText = await readFile(path.join(smokeTestsDir, fileName), 'utf8');
  scip.FS.writeFile(fileName, modelText);

  scip.callMain([
    '-c',
    `read ${fileName}`,
    '-c',
    'optimize',
    '-c',
    'display solution',
    '-c',
    'quit',
  ]);

  const output = [...stdout, ...stderr].join('\n');
  if (!output.includes('optimal solution found') && !output.includes('solution status: optimal')) {
    throw new Error(`SCIP did not report an optimal solution for ${fileName}:\n${output}`);
  }

  assertSolution(output);
}

await runModel('tiny.lp', (output) => {
  if (!/\bx\s+1(?:\.0+)?\b/.test(output) && !/\by\s+1(?:\.0+)?\b/.test(output)) {
    throw new Error(`tiny.lp solved, but expected x or y to cover demand:\n${output}`);
  }
});

await runModel('integer-ceil.lp', (output) => {
  if (!/\bn\s+3(?:\.0+)?\b/.test(output)) {
    throw new Error(`integer-ceil.lp solved, but expected rounded integer n = 3:\n${output}`);
  }
});

console.log('Smoke: SCIP shell models passed.');

if (
  typeof scip._industrialist_has_native_ratio_solver !== 'function' ||
  scip._industrialist_has_native_ratio_solver() !== 1 ||
  typeof scip._industrialist_native_abi_version !== 'function' ||
  typeof scip._industrialist_native_capabilities !== 'function' ||
  typeof scip._industrialist_start_ratio_job_f64 !== 'function' ||
  typeof scip._industrialist_get_ratio_job_state !== 'function' ||
  typeof scip._industrialist_get_ratio_job_stage !== 'function' ||
  typeof scip._industrialist_get_ratio_job_elapsed_ms !== 'function' ||
  typeof scip._industrialist_cancel_ratio_job !== 'function' ||
  typeof scip._industrialist_take_ratio_job_result !== 'function' ||
  typeof scip._industrialist_get_ratio_job_error !== 'function' ||
  typeof scip._industrialist_free_string !== 'function' ||
  typeof scip._industrialist_free_result_buffer !== 'function' ||
  typeof scip.UTF8ToString !== 'function' ||
  typeof scip._malloc !== 'function' ||
  !(scip.HEAPF64 instanceof Float64Array) ||
  typeof scip._free !== 'function'
) {
  throw new Error('Native Industrialist ratio solver exports were not found.');
}

if (scip._industrialist_native_abi_version() !== 3) {
  throw new Error(
    `Expected Industrialist native ABI 3, got ${scip._industrialist_native_abi_version()}.`,
  );
}
if ((scip._industrialist_native_capabilities() & 31) !== 31) {
  throw new Error(
    `Industrialist native ABI did not report all required capabilities: ${scip._industrialist_native_capabilities()}.`,
  );
}

const NATIVE_MAGIC = 444926465;
const NATIVE_RESULT_VERSION = 2;
const NATIVE_RESULT_HEADER_DOUBLES = 28;
const NATIVE_PAYLOAD_MAGIC = 444926466;
const NATIVE_PAYLOAD_VERSION = 6;
const METRIC_IDS = [
  'powerUse',
  'powerOutput',
  'pollution',
  'machineCost',
  'machineSpace',
  'modelCount',
];

function readNativeResult(resultPtr) {
  if (!resultPtr) {
    throw new Error('Native Industrialist solver returned a null result pointer.');
  }
  const baseIndex = resultPtr / Float64Array.BYTES_PER_ELEMENT;
  const totalDoubles = scip.HEAPF64[baseIndex + 1];
  if (
    !Number.isInteger(totalDoubles) ||
    totalDoubles < NATIVE_RESULT_HEADER_DOUBLES ||
    baseIndex + totalDoubles > scip.HEAPF64.length
  ) {
    throw new Error(
      `Native Industrialist solver returned an invalid result length: ${totalDoubles}.`,
    );
  }
  const result = scip.HEAPF64.slice(baseIndex, baseIndex + totalDoubles);
  if (result[0] !== NATIVE_MAGIC || result[2] !== NATIVE_RESULT_VERSION) {
    throw new Error(
      `Native Industrialist solver returned an invalid header: ${result.slice(0, 4).join(', ')}.`,
    );
  }
  return result;
}

function makeNativePayload({
  nodes,
  connections = [],
  metrics = {},
  excludeAvoidableInfiniteCostMachines = false,
  useWholeMachineCounts = true,
}) {
  const flatInputs = nodes.flatMap((node) => node.inputs ?? []);
  const flatOutputs = nodes.flatMap((node) => node.outputs ?? []);
  const flatDependencies = flatInputs.flatMap((input) => input.flowDependencies ?? []);
  const totalDoubles =
    41 +
    nodes.length * 15 +
    flatInputs.length * 6 +
    flatOutputs.length * 2 +
    connections.length * 4 +
    flatDependencies.length * 2;
  const payload = new Float64Array(totalDoubles);
  const tierCount = Math.max(1, ...Object.values(metrics).map((metric) => metric.tier ?? 1));
  payload.set([
    NATIVE_PAYLOAD_MAGIC,
    NATIVE_PAYLOAD_VERSION,
    totalDoubles,
    nodes.length,
    connections.length,
    flatInputs.length,
    flatOutputs.length,
    tierCount,
    excludeAvoidableInfiniteCostMachines ? 1 : 0,
    useWholeMachineCounts ? 1 : 0,
  ]);
  payload[40] = flatDependencies.length;
  for (let metricIndex = 0; metricIndex < METRIC_IDS.length; metricIndex += 1) {
    const metric = metrics[METRIC_IDS[metricIndex]];
    payload.set(
      metric
        ? [1, metric.weight ?? 1, metric.tier ?? 1, -1, metric.outputGoal ?? -1]
        : [0, 0, 1, -1, -1],
      10 + metricIndex * 5,
    );
  }

  const inputOffset = 41 + nodes.length * 15;
  const outputOffset = inputOffset + flatInputs.length * 6;
  const connectionOffset = outputOffset + flatOutputs.length * 2;
  const dependencyOffset = connectionOffset + connections.length * 4;
  let nextInput = 0;
  let nextOutput = 0;
  let nextDependency = 0;
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    const current = node.currentMachineCount ?? 0;
    const minimum = node.minimumMachineCount ?? (node.isTarget ? current : 0);
    payload.set(
      [
        current,
        minimum,
        node.maximumMachineCount ?? -1,
        node.powerUse ?? 0,
        node.powerOutput ?? 0,
        node.pollution ?? 0,
        node.machineCost ?? 0,
        node.machineSpace ?? 0,
        node.modelCount ?? 0,
        nextInput,
        node.inputs?.length ?? 0,
        nextOutput,
        node.outputs?.length ?? 0,
        node.hasInfiniteMachineCost ? 1 : 0,
        node.isTarget ? 1 : 0,
      ],
      41 + nodeIndex * 15,
    );
    for (const input of node.inputs ?? []) {
      const dependencies = input.flowDependencies ?? [];
      payload.set(
        [
          input.quantity,
          input.isSink ? 1 : 0,
          input.independentOfMachineCount ? 1 : 0,
          nextDependency,
          dependencies.length,
          input.pollutionPerFlow ?? 0,
        ],
        inputOffset + nextInput * 6,
      );
      for (const dependency of dependencies) {
        payload.set(
          [dependency.sourceInputIndex, dependency.coefficient],
          dependencyOffset + nextDependency * 2,
        );
        nextDependency += 1;
      }
      nextInput += 1;
    }
    for (const output of node.outputs ?? []) {
      payload.set(
        [output.quantity, output.hasSinkConnection ? 1 : 0],
        outputOffset + nextOutput * 2,
      );
      nextOutput += 1;
    }
  }
  for (let index = 0; index < connections.length; index += 1) {
    const connection = connections[index];
    payload.set(
      [
        connection.sourceNode,
        connection.sourceOutputIndex,
        connection.targetNode,
        connection.targetInputIndex,
      ],
      connectionOffset + index * 4,
    );
  }
  return payload;
}

function makeSingleNodePayload({
  currentMachineCount = 2,
  machineCost = 0,
  machineCostWeight = 0,
  hasInfiniteMachineCost = false,
  minimumMachineCount,
  maximumMachineCount = null,
  useWholeMachineCounts = true,
} = {}) {
  return makeNativePayload({
    nodes: [
      {
        currentMachineCount,
        minimumMachineCount,
        maximumMachineCount,
        isTarget: true,
        machineCost,
        hasInfiniteMachineCost,
      },
    ],
    metrics: machineCostWeight > 0 ? { machineCost: { weight: machineCostWeight } } : {},
    useWholeMachineCounts,
  });
}

function makeConnectedAboveIntegerProducerPayload() {
  return makeNativePayload({
    nodes: [
      { machineCost: 10, outputs: [{ quantity: 1 }] },
      {
        currentMachineCount: 1,
        isTarget: true,
        inputs: [{ quantity: 2.000000105 }],
      },
    ],
    connections: [{ sourceNode: 0, sourceOutputIndex: 0, targetNode: 1, targetInputIndex: 0 }],
    metrics: { machineCost: { weight: 1 } },
  });
}

function makeIncumbentPolishPayload() {
  return makeNativePayload({
    nodes: Array.from({ length: 24 }, (_, index) => ({
      currentMachineCount: index === 0 ? 2.2 : 0,
      isTarget: index === 0,
      machineCost: 10,
    })),
    metrics: { machineCost: { weight: 1 } },
  });
}

function makeInfiniteCostChoicePayload({
  machineCostWeight = 1,
  excludeAvoidableInfiniteCostMachines = false,
} = {}) {
  return makeNativePayload({
    nodes: [
      { hasInfiniteMachineCost: true, outputs: [{ quantity: 1 }] },
      { machineCost: 100, outputs: [{ quantity: 1 }] },
      { currentMachineCount: 1, isTarget: true, inputs: [{ quantity: 1 }] },
    ],
    connections: [
      { sourceNode: 0, sourceOutputIndex: 0, targetNode: 2, targetInputIndex: 0 },
      { sourceNode: 1, sourceOutputIndex: 0, targetNode: 2, targetInputIndex: 0 },
    ],
    metrics: machineCostWeight > 0 ? { machineCost: { weight: machineCostWeight } } : {},
    excludeAvoidableInfiniteCostMachines,
  });
}

function makeTargetlessPowerOutputPayload() {
  return makeNativePayload({
    nodes: [{ powerOutput: 100 }],
    metrics: { powerOutput: { weight: 1, outputGoal: 250 } },
  });
}

function makeMixedScaleTargetsPayload() {
  return makeNativePayload({
    nodes: [
      { currentMachineCount: 1e12, isTarget: true },
      { currentMachineCount: 1, isTarget: true },
    ],
  });
}

function makeScaledStagePriorityPayload({ targetMachineCount = 0.01, outputGoal = 1 } = {}) {
  return makeNativePayload({
    nodes: [
      { currentMachineCount: 1e12, isTarget: true },
      {
        powerOutput: 1,
        inputs: [{ quantity: 2 }],
        outputs: [{ quantity: 1, hasSinkConnection: true }],
      },
      { currentMachineCount: targetMachineCount, isTarget: true, inputs: [{ quantity: 1 }] },
      { outputs: [{ quantity: 0 }] },
    ],
    connections: [
      { sourceNode: 3, sourceOutputIndex: 0, targetNode: 1, targetInputIndex: 0 },
      { sourceNode: 1, sourceOutputIndex: 0, targetNode: 2, targetInputIndex: 0 },
    ],
    metrics: { powerOutput: { weight: 1, outputGoal } },
  });
}

function makeBoundedProducerPayload({ minimum = 0, maximum }) {
  return makeNativePayload({
    nodes: [
      {
        minimumMachineCount: minimum,
        maximumMachineCount: maximum,
        outputs: [{ quantity: 1 }],
      },
      { currentMachineCount: 5, isTarget: true, inputs: [{ quantity: 1 }] },
    ],
    connections: [{ sourceNode: 0, sourceOutputIndex: 0, targetNode: 1, targetInputIndex: 0 }],
  });
}

function makeUndergroundWastePayload() {
  return makeNativePayload({
    nodes: [
      {
        currentMachineCount: 100,
        isTarget: true,
        outputs: [{ quantity: 1, hasSinkConnection: true }],
      },
      {
        currentMachineCount: 50,
        isTarget: true,
        outputs: [{ quantity: 1, hasSinkConnection: true }],
      },
      { outputs: [{ quantity: 1, hasSinkConnection: true }] },
      { outputs: [{ quantity: 1, hasSinkConnection: true }] },
      {
        inputs: [
          { quantity: 240, isSink: true },
          { quantity: 240, isSink: true },
          {
            quantity: 0,
            independentOfMachineCount: true,
            flowDependencies: [
              { sourceInputIndex: 0, coefficient: 0.02 },
              { sourceInputIndex: 1, coefficient: 0.02 },
            ],
          },
          {
            quantity: 0,
            independentOfMachineCount: true,
            flowDependencies: [
              { sourceInputIndex: 0, coefficient: 0.01 },
              { sourceInputIndex: 1, coefficient: 0.01 },
            ],
          },
        ],
      },
    ],
    connections: [
      { sourceNode: 0, sourceOutputIndex: 0, targetNode: 4, targetInputIndex: 0 },
      { sourceNode: 1, sourceOutputIndex: 0, targetNode: 4, targetInputIndex: 1 },
      { sourceNode: 2, sourceOutputIndex: 0, targetNode: 4, targetInputIndex: 2 },
      { sourceNode: 3, sourceOutputIndex: 0, targetNode: 4, targetInputIndex: 3 },
    ],
  });
}

function getNativeResultSectionOffsets(result) {
  const machineOffset = NATIVE_RESULT_HEADER_DOUBLES + result[15] * 3;
  const flowOffset = machineOffset + result[16];
  return {
    machineOffset,
    deficitOffset: flowOffset + result[17],
  };
}

async function runAsyncNativeJob(payload, cancelImmediately = false, roundedMilpProfile = 0) {
  const payloadPtr = scip._malloc(payload.byteLength);
  if (!payloadPtr) {
    throw new Error('Failed to allocate asynchronous native payload memory.');
  }

  let resultPtr = 0;
  try {
    scip.HEAPF64.set(payload, payloadPtr / Float64Array.BYTES_PER_ELEMENT);
    if (
      scip._industrialist_start_ratio_job_f64(payloadPtr, payload.length, roundedMilpProfile) !== 1
    ) {
      throw new Error('Failed to start asynchronous native ratio job.');
    }

    const cancellationAccepted = cancelImmediately
      ? scip._industrialist_cancel_ratio_job() === 1
      : false;
    const deadline = Date.now() + 30_000;
    while (scip._industrialist_get_ratio_job_state() === 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    if (scip._industrialist_get_ratio_job_state() !== 2) {
      throw new Error(
        `Asynchronous native ratio job did not complete; state=${scip._industrialist_get_ratio_job_state()}, stage=${scip._industrialist_get_ratio_job_stage()}, elapsed=${scip._industrialist_get_ratio_job_elapsed_ms()}ms.`,
      );
    }

    const errorPtr = scip._industrialist_get_ratio_job_error();
    let nativeError = '';
    try {
      if (errorPtr) nativeError = scip.UTF8ToString(errorPtr);
    } finally {
      if (errorPtr) scip._industrialist_free_string(errorPtr);
    }

    resultPtr = scip._industrialist_take_ratio_job_result();
    return {
      cancellationAccepted,
      nativeError,
      result: readNativeResult(resultPtr),
    };
  } finally {
    if (resultPtr) scip._industrialist_free_result_buffer(resultPtr);
    scip._free(payloadPtr);
  }
}

console.log('Smoke: tuned rounded MILP profile.');
const roundedJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 2.2,
    machineCost: 10,
    machineCostWeight: 1,
  }),
);
if (roundedJob.nativeError || roundedJob.result[3] !== 1) {
  throw new Error(
    `Rounded native job failed with status ${roundedJob.result[3]}: ${roundedJob.nativeError}`,
  );
}
if (roundedJob.result[4] !== 4 || roundedJob.result[25] !== 1) {
  throw new Error(
    `Rounded native job did not use the exact MILP profile: profile=${roundedJob.result[4]}, roundedVars=${roundedJob.result[25]}.`,
  );
}
if (roundedJob.result[26] !== 10 || roundedJob.result[27] < 0) {
  throw new Error(
    `Rounded native job did not report tuned profile telemetry: profile=${roundedJob.result[26]}, polishMs=${roundedJob.result[27]}.`,
  );
}
const roundedStageCount = roundedJob.result[15];
const weightedStageOffset = Array.from(
  { length: roundedStageCount },
  (_, index) => NATIVE_RESULT_HEADER_DOUBLES + index * 3,
).find((offset) => roundedJob.result[offset] === 3);
if (
  weightedStageOffset === undefined ||
  Math.abs(roundedJob.result[weightedStageOffset + 1] - 30) > 1e-6
) {
  throw new Error('Rounded native job did not price ceil(2.2) = 3 whole machines exactly.');
}
const roundedMachineOffset = NATIVE_RESULT_HEADER_DOUBLES + roundedStageCount * 3;
if (Math.abs(roundedJob.result[roundedMachineOffset] - 2.2) > 1e-7) {
  throw new Error(
    `Rounded native job changed the target lower bound to ${roundedJob.result[roundedMachineOffset]}.`,
  );
}

const continuousAccountingJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 2.2,
    machineCost: 10,
    machineCostWeight: 1,
    useWholeMachineCounts: false,
  }),
);
if (continuousAccountingJob.nativeError || continuousAccountingJob.result[3] !== 1) {
  throw new Error(
    `Continuous accounting job failed with status ${continuousAccountingJob.result[3]}: ${continuousAccountingJob.nativeError}`,
  );
}
if (continuousAccountingJob.result[25] !== 0) {
  throw new Error('Continuous machine accounting unexpectedly created rounded integer variables.');
}

for (const profile of [1, 2, 3]) {
  console.log(`Smoke: rounded MILP comparison profile ${profile}.`);
  const profileJob = await runAsyncNativeJob(
    makeSingleNodePayload({
      currentMachineCount: 2.2,
      machineCost: 10,
      machineCostWeight: 1,
    }),
    false,
    profile,
  );
  if (profileJob.nativeError || profileJob.result[3] !== 1) {
    throw new Error(
      `Rounded profile ${profile} failed with status ${profileJob.result[3]}: ${profileJob.nativeError}`,
    );
  }
  if (profileJob.result[26] !== profile + 10) {
    throw new Error(`Rounded profile ${profile} reported telemetry code ${profileJob.result[26]}.`);
  }
}

console.log('Smoke: rounded MILP incumbent polishing.');
const incumbentPolishJob = await runAsyncNativeJob(makeIncumbentPolishPayload());
if (incumbentPolishJob.nativeError || incumbentPolishJob.result[3] !== 1) {
  throw new Error(
    `Incumbent-polish native job failed with status ${incumbentPolishJob.result[3]}: ${incumbentPolishJob.nativeError}`,
  );
}
if (incumbentPolishJob.result[25] !== 24 || incumbentPolishJob.result[27] <= 0) {
  throw new Error(
    `Incumbent polishing was not exercised: roundedVars=${incumbentPolishJob.result[25]}, polishMs=${incumbentPolishJob.result[27]}.`,
  );
}

console.log('Smoke: remaining native ratio cases.');
console.log('Smoke: bounded producer with locked minimum/maximum.');
const lockedProducerJob = await runAsyncNativeJob(
  makeBoundedProducerPayload({ minimum: 4, maximum: 4 }),
);
const lockedProducerOffset = getNativeResultSectionOffsets(lockedProducerJob.result).machineOffset;
if (
  lockedProducerJob.nativeError ||
  lockedProducerJob.result[3] !== 1 ||
  Math.abs(lockedProducerJob.result[lockedProducerOffset] - 4) > 1e-7
) {
  throw new Error(
    `Locked producer bound was not preserved: ${lockedProducerJob.nativeError || lockedProducerJob.result[lockedProducerOffset]}.`,
  );
}

console.log('Smoke: bounded producer with maximum.');
const cappedProducerJob = await runAsyncNativeJob(makeBoundedProducerPayload({ maximum: 3 }));
const cappedProducerOffset = getNativeResultSectionOffsets(cappedProducerJob.result).machineOffset;
if (
  cappedProducerJob.nativeError ||
  cappedProducerJob.result[3] !== 1 ||
  cappedProducerJob.result[cappedProducerOffset] > 3 + 1e-7
) {
  throw new Error(
    `Capped producer exceeded its maximum: ${cappedProducerJob.nativeError || cappedProducerJob.result[cappedProducerOffset]}.`,
  );
}

const undergroundWasteJob = await runAsyncNativeJob(makeUndergroundWastePayload());
const undergroundWasteOffset = getNativeResultSectionOffsets(
  undergroundWasteJob.result,
).machineOffset;
if (undergroundWasteJob.nativeError || undergroundWasteJob.result[3] !== 1) {
  throw new Error(
    `Underground Waste Facility flow-dependency job failed with status ${undergroundWasteJob.result[3]}: ${undergroundWasteJob.nativeError}`,
  );
}
const undergroundWasteCounts = undergroundWasteJob.result.slice(
  undergroundWasteOffset,
  undergroundWasteOffset + 5,
);
if (
  Math.abs(undergroundWasteCounts[2] - 3) > 1e-6 ||
  Math.abs(undergroundWasteCounts[3] - 1.5) > 1e-6 ||
  Math.abs(undergroundWasteCounts[4] - 100 / 240) > 1e-6
) {
  throw new Error(
    `Underground Waste Facility dependencies were incorrect: ${undergroundWasteCounts.join(', ')}.`,
  );
}

const nearIntegerJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 2.00000005,
    machineCost: 10,
    machineCostWeight: 1,
  }),
);
if (nearIntegerJob.nativeError || nearIntegerJob.result[3] !== 1) {
  throw new Error(
    `Near-integer native job failed with status ${nearIntegerJob.result[3]}: ${nearIntegerJob.nativeError}`,
  );
}
const nearIntegerStageOffset = Array.from(
  { length: nearIntegerJob.result[15] },
  (_, index) => NATIVE_RESULT_HEADER_DOUBLES + index * 3,
).find((offset) => nearIntegerJob.result[offset] === 3);
if (
  nearIntegerStageOffset === undefined ||
  Math.abs(nearIntegerJob.result[nearIntegerStageOffset + 1] - 20) > 1e-6
) {
  throw new Error('Near-integer native job did not price 2.00000005 as 2 whole machines.');
}

const aboveIntegerToleranceJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 2.000000105,
    machineCost: 10,
    machineCostWeight: 1,
  }),
);
if (aboveIntegerToleranceJob.nativeError || aboveIntegerToleranceJob.result[3] !== 1) {
  throw new Error(
    `Above-tolerance native job failed with status ${aboveIntegerToleranceJob.result[3]}: ${aboveIntegerToleranceJob.nativeError}`,
  );
}
const aboveIntegerToleranceStageOffset = Array.from(
  { length: aboveIntegerToleranceJob.result[15] },
  (_, index) => NATIVE_RESULT_HEADER_DOUBLES + index * 3,
).find((offset) => aboveIntegerToleranceJob.result[offset] === 3);
if (
  aboveIntegerToleranceStageOffset === undefined ||
  Math.abs(aboveIntegerToleranceJob.result[aboveIntegerToleranceStageOffset + 1] - 30) > 1e-6
) {
  throw new Error('Above-tolerance native job did not price 2.000000105 as 3 whole machines.');
}

const aboveZeroToleranceJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 0.000000105,
    machineCost: 10,
    machineCostWeight: 1,
  }),
);
if (aboveZeroToleranceJob.nativeError || aboveZeroToleranceJob.result[3] !== 1) {
  throw new Error(
    `Above-zero-tolerance native job failed with status ${aboveZeroToleranceJob.result[3]}: ${aboveZeroToleranceJob.nativeError}`,
  );
}
const aboveZeroToleranceStageOffset = Array.from(
  { length: aboveZeroToleranceJob.result[15] },
  (_, index) => NATIVE_RESULT_HEADER_DOUBLES + index * 3,
).find((offset) => aboveZeroToleranceJob.result[offset] === 3);
if (
  aboveZeroToleranceStageOffset === undefined ||
  Math.abs(aboveZeroToleranceJob.result[aboveZeroToleranceStageOffset + 1] - 10) > 1e-6
) {
  throw new Error('Above-zero-tolerance native job did not price 0.000000105 as 1 whole machine.');
}

const connectedAboveIntegerProducerJob = await runAsyncNativeJob(
  makeConnectedAboveIntegerProducerPayload(),
);
if (
  connectedAboveIntegerProducerJob.nativeError ||
  connectedAboveIntegerProducerJob.result[3] !== 1
) {
  throw new Error(
    `Connected above-integer producer job failed with status ${connectedAboveIntegerProducerJob.result[3]}: ${connectedAboveIntegerProducerJob.nativeError}`,
  );
}
const connectedAboveIntegerProducerStageOffset = Array.from(
  { length: connectedAboveIntegerProducerJob.result[15] },
  (_, index) => NATIVE_RESULT_HEADER_DOUBLES + index * 3,
).find((offset) => connectedAboveIntegerProducerJob.result[offset] === 3);
if (
  connectedAboveIntegerProducerStageOffset === undefined ||
  Math.abs(
    connectedAboveIntegerProducerJob.result[connectedAboveIntegerProducerStageOffset + 1] - 30,
  ) > 1e-6
) {
  throw new Error('Connected producer just above 2 machines was not priced as 3 whole machines.');
}

const targetlessPowerOutputJob = await runAsyncNativeJob(makeTargetlessPowerOutputPayload());
if (targetlessPowerOutputJob.nativeError || targetlessPowerOutputJob.result[3] !== 1) {
  throw new Error(
    `Targetless production job failed with status ${targetlessPowerOutputJob.result[3]}: ${targetlessPowerOutputJob.nativeError}`,
  );
}

const mixedScaleJob = await runAsyncNativeJob(makeMixedScaleTargetsPayload());
if (mixedScaleJob.nativeError || mixedScaleJob.result[3] !== 1) {
  throw new Error(
    `Mixed-scale target job failed with status ${mixedScaleJob.result[3]}: ${mixedScaleJob.nativeError}`,
  );
}
const mixedScaleOffsets = getNativeResultSectionOffsets(mixedScaleJob.result);
const mixedScaleCounts = mixedScaleJob.result.slice(
  mixedScaleOffsets.machineOffset,
  mixedScaleOffsets.machineOffset + 2,
);
if (
  Math.abs(mixedScaleJob.result[10] - 1e8) > 1e-6 ||
  Math.abs(mixedScaleCounts[0] - 1e12) > 1 ||
  Math.abs(mixedScaleCounts[1] - 1) > 1e-8
) {
  throw new Error(
    `Mixed-scale targets lost physical output precision: ${mixedScaleCounts.join(', ')}.`,
  );
}

const scaledPriorityJob = await runAsyncNativeJob(makeScaledStagePriorityPayload());
if (scaledPriorityJob.nativeError || scaledPriorityJob.result[3] !== 1) {
  throw new Error(
    `Scaled priority job failed with status ${scaledPriorityJob.result[3]}: ${scaledPriorityJob.nativeError}`,
  );
}
const scaledPriorityOffsets = getNativeResultSectionOffsets(scaledPriorityJob.result);
const scaledPrioritySourceCount = scaledPriorityJob.result[scaledPriorityOffsets.machineOffset + 1];
const scaledPriorityDeficits = scaledPriorityJob.result.slice(
  scaledPriorityOffsets.deficitOffset,
  scaledPriorityOffsets.deficitOffset + 2,
);
const scaledPriorityDeficit = scaledPriorityDeficits.reduce((total, value) => total + value, 0);
if (scaledPrioritySourceCount > 1e-5 || scaledPriorityDeficit > 0.01001) {
  const scaledPriorityMachines = scaledPriorityJob.result.slice(
    scaledPriorityOffsets.machineOffset,
    scaledPriorityOffsets.machineOffset + scaledPriorityJob.result[16],
  );
  const scaledPriorityFlows = scaledPriorityJob.result.slice(
    scaledPriorityOffsets.machineOffset + scaledPriorityJob.result[16],
    scaledPriorityOffsets.deficitOffset,
  );
  const scaledPriorityStages = scaledPriorityJob.result.slice(
    NATIVE_RESULT_HEADER_DOUBLES,
    scaledPriorityOffsets.machineOffset,
  );
  throw new Error(
    `A later objective consumed scaled shortage-lock slack: stages=${scaledPriorityStages.join(', ')}, machines=${scaledPriorityMachines.join(', ')}, flows=${scaledPriorityFlows.join(', ')}, deficits=${scaledPriorityDeficits.join(', ')}, scale=${scaledPriorityJob.result[10]}, vars=${scaledPriorityJob.result[7]}, rows=${scaledPriorityJob.result[8]}.`,
  );
}

const largePriorityJob = await runAsyncNativeJob(
  makeScaledStagePriorityPayload({ targetMachineCount: 1e9, outputGoal: 1e6 }),
);
if (largePriorityJob.nativeError || largePriorityJob.result[3] !== 1) {
  throw new Error(
    `Large priority job failed with status ${largePriorityJob.result[3]}: ${largePriorityJob.nativeError}`,
  );
}
const largePriorityOffsets = getNativeResultSectionOffsets(largePriorityJob.result);
const largePrioritySourceCount = largePriorityJob.result[largePriorityOffsets.machineOffset + 1];
const largePriorityDeficit = largePriorityJob.result
  .slice(largePriorityOffsets.deficitOffset, largePriorityOffsets.deficitOffset + 2)
  .reduce((total, value) => total + value, 0);
if (largePrioritySourceCount > 0.01 || largePriorityDeficit > 1e9 + 0.01) {
  throw new Error(
    `A later objective consumed relative shortage-lock slack: source=${largePrioritySourceCount}, shortage=${largePriorityDeficit}.`,
  );
}
const targetlessMachineOffset =
  NATIVE_RESULT_HEADER_DOUBLES + targetlessPowerOutputJob.result[15] * 3;
if (Math.abs(targetlessPowerOutputJob.result[targetlessMachineOffset] - 2.5) > 1e-5) {
  throw new Error(
    `Targetless production component was removed or under-produced: ${targetlessPowerOutputJob.result[targetlessMachineOffset]}.`,
  );
}

const requiredInfiniteJob = await runAsyncNativeJob(
  makeSingleNodePayload({
    currentMachineCount: 1,
    machineCostWeight: 1,
    hasInfiniteMachineCost: true,
  }),
);
if (requiredInfiniteJob.nativeError || requiredInfiniteJob.result[3] !== 1) {
  throw new Error(
    `Required infinite-cost native job failed with status ${requiredInfiniteJob.result[3]}: ${requiredInfiniteJob.nativeError}`,
  );
}

const infiniteChoiceJob = await runAsyncNativeJob(makeInfiniteCostChoicePayload());
if (infiniteChoiceJob.nativeError || infiniteChoiceJob.result[3] !== 1) {
  throw new Error(
    `Infinite-cost choice native job failed with status ${infiniteChoiceJob.result[3]}: ${infiniteChoiceJob.nativeError}`,
  );
}
const infiniteChoiceMachineOffset = NATIVE_RESULT_HEADER_DOUBLES + infiniteChoiceJob.result[15] * 3;
const infiniteChoiceCounts = infiniteChoiceJob.result.slice(
  infiniteChoiceMachineOffset,
  infiniteChoiceMachineOffset + 3,
);
if (
  Math.abs(infiniteChoiceCounts[0]) > 1e-7 ||
  Math.abs(infiniteChoiceCounts[1] - 1) > 1e-7 ||
  Math.abs(infiniteChoiceCounts[2] - 1) > 1e-7
) {
  throw new Error(
    `Infinite-cost choice did not select the finite supplier: ${infiniteChoiceCounts.join(', ')}.`,
  );
}

const autocompleteInfiniteChoiceJob = await runAsyncNativeJob(
  makeInfiniteCostChoicePayload({
    machineCostWeight: 0,
    excludeAvoidableInfiniteCostMachines: true,
  }),
);
if (autocompleteInfiniteChoiceJob.nativeError || autocompleteInfiniteChoiceJob.result[3] !== 1) {
  throw new Error(
    `Autocomplete infinite-cost choice job failed with status ${autocompleteInfiniteChoiceJob.result[3]}: ${autocompleteInfiniteChoiceJob.nativeError}`,
  );
}
const autocompleteInfiniteChoiceMachineOffset =
  NATIVE_RESULT_HEADER_DOUBLES + autocompleteInfiniteChoiceJob.result[15] * 3;
const autocompleteInfiniteChoiceCounts = autocompleteInfiniteChoiceJob.result.slice(
  autocompleteInfiniteChoiceMachineOffset,
  autocompleteInfiniteChoiceMachineOffset + 3,
);
if (
  Math.abs(autocompleteInfiniteChoiceCounts[0]) > 1e-7 ||
  Math.abs(autocompleteInfiniteChoiceCounts[1] - 1) > 1e-7 ||
  Math.abs(autocompleteInfiniteChoiceCounts[2] - 1) > 1e-7
) {
  throw new Error(
    `Autocomplete did not exclude the avoidable infinite-cost supplier: ${autocompleteInfiniteChoiceCounts.join(', ')}.`,
  );
}

let observedCancellation = false;
for (let attempt = 0; attempt < 5 && !observedCancellation; attempt += 1) {
  const cancelledJob = await runAsyncNativeJob(
    makeSingleNodePayload({
      currentMachineCount: 2.2,
      machineCost: 10,
      machineCostWeight: 1,
    }),
    true,
  );
  observedCancellation = cancelledJob.cancellationAccepted && cancelledJob.result[3] === 2;
}
if (!observedCancellation) {
  throw new Error('Native asynchronous job cancellation was never observed across five attempts.');
}

for (let iteration = 0; iteration < 20; iteration += 1) {
  const repeatedJob = await runAsyncNativeJob(makeSingleNodePayload());
  if (repeatedJob.nativeError || repeatedJob.result[3] !== 1) {
    throw new Error(`Repeated native job ${iteration + 1} failed: ${repeatedJob.nativeError}`);
  }
}

console.log('Smoke tests passed.');
