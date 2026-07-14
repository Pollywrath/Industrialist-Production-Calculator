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

if (scip._industrialist_native_abi_version() !== 2) {
  throw new Error(
    `Expected Industrialist native ABI 2, got ${scip._industrialist_native_abi_version()}.`,
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

function makeSingleNodePayload({
  currentMachineCount = 2,
  machineCost = 0,
  machineCostWeight = 0,
  hasInfiniteMachineCost = false,
} = {}) {
  const payload = new Float64Array(52);
  payload.set([NATIVE_PAYLOAD_MAGIC, 4, 52, 1, 0, 0, 0, 1, 0]);
  for (let metricIndex = 0; metricIndex < 6; metricIndex += 1) {
    payload.set([0, 0, 1, -1, -1], 9 + metricIndex * 5);
  }
  if (machineCostWeight > 0) {
    payload.set([1, machineCostWeight, 1, -1, -1], 9 + 3 * 5);
  }
  payload.set(
    [
      currentMachineCount,
      1,
      0,
      0,
      0,
      machineCost,
      0,
      0,
      0,
      0,
      0,
      0,
      hasInfiniteMachineCost ? 1 : 0,
    ],
    39,
  );
  return payload;
}

function makeInfiniteCostChoicePayload() {
  const payload = new Float64Array(92);
  payload.set([NATIVE_PAYLOAD_MAGIC, 4, 92, 3, 2, 1, 2, 1, 0]);
  for (let metricIndex = 0; metricIndex < 6; metricIndex += 1) {
    payload.set([0, 0, 1, -1, -1], 9 + metricIndex * 5);
  }
  payload.set([1, 1, 1, -1, -1], 9 + 3 * 5);

  payload.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], 39);
  payload.set([0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 1, 1, 0], 52);
  payload.set([1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0], 65);
  payload.set([1, 0], 78);
  payload.set([1, 0, 1, 0], 80);
  payload.set([0, 0, 2, 0, 1, 0, 2, 0], 84);
  return payload;
}

function makeTargetlessPowerOutputPayload() {
  const payload = new Float64Array(52);
  payload.set([NATIVE_PAYLOAD_MAGIC, 4, 52, 1, 0, 0, 0, 1, 0]);
  for (let metricIndex = 0; metricIndex < 6; metricIndex += 1) {
    payload.set([0, 0, 1, -1, -1], 9 + metricIndex * 5);
  }
  payload.set([1, 1, 1, -1, 250], 9 + 1 * 5);
  payload.set([0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0], 39);
  return payload;
}

function makeMixedScaleTargetsPayload() {
  const payload = new Float64Array(65);
  payload.set([NATIVE_PAYLOAD_MAGIC, 4, 65, 2, 0, 0, 0, 1, 0]);
  for (let metricIndex = 0; metricIndex < 6; metricIndex += 1) {
    payload.set([0, 0, 1, -1, -1], 9 + metricIndex * 5);
  }
  payload.set([1e12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 39);
  payload.set([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 52);
  return payload;
}

function makeScaledStagePriorityPayload({ targetMachineCount = 0.01, outputGoal = 1 } = {}) {
  const payload = new Float64Array(107);
  payload.set([NATIVE_PAYLOAD_MAGIC, 4, 107, 4, 2, 2, 2, 1, 0]);
  for (let metricIndex = 0; metricIndex < 6; metricIndex += 1) {
    payload.set([0, 0, 1, -1, -1], 9 + metricIndex * 5);
  }
  payload.set([1, 1, 1, -1, outputGoal], 9 + 1 * 5);

  payload.set([1e12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 39);
  payload.set([0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0], 52);
  payload.set([targetMachineCount, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0], 65);
  payload.set([0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 1, 0], 78);
  payload.set([2, 0, 1, 0], 91);
  payload.set([1, 1, 0, 0], 95);
  payload.set([3, 0, 1, 0, 1, 0, 2, 0], 99);
  return payload;
}

function getNativeResultSectionOffsets(result) {
  const machineOffset = NATIVE_RESULT_HEADER_DOUBLES + result[15] * 3;
  const flowOffset = machineOffset + result[16];
  return {
    machineOffset,
    deficitOffset: flowOffset + result[17],
  };
}

async function runAsyncNativeJob(payload, cancelImmediately = false) {
  const payloadPtr = scip._malloc(payload.byteLength);
  if (!payloadPtr) {
    throw new Error('Failed to allocate asynchronous native payload memory.');
  }

  let resultPtr = 0;
  try {
    scip.HEAPF64.set(payload, payloadPtr / Float64Array.BYTES_PER_ELEMENT);
    if (scip._industrialist_start_ratio_job_f64(payloadPtr, payload.length, 0) !== 1) {
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
  throw new Error(`Mixed-scale targets lost physical output precision: ${mixedScaleCounts.join(', ')}.`);
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
