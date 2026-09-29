import assert from 'node:assert/strict';
import {
  ceilMachineCount,
  cleanMachineCount,
  getMachineIntegerTolerance,
} from '../src/utils/precision.ts';

const buffer = new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT);
const floatView = new Float64Array(buffer);
const bitsView = new BigUint64Array(buffer);

function nextUp(value) {
  if (Number.isNaN(value) || value === Number.POSITIVE_INFINITY) return value;
  if (value === 0) return Number.MIN_VALUE;
  floatView[0] = value;
  bitsView[0] += value > 0 ? 1n : -1n;
  return floatView[0];
}

function nextDown(value) {
  if (Number.isNaN(value) || value === Number.NEGATIVE_INFINITY) return value;
  if (value === 0) return -Number.MIN_VALUE;
  floatView[0] = value;
  bitsView[0] += value > 0 ? -1n : 1n;
  return floatView[0];
}

const integerMagnitudes = [1, 2, 3, 7, 10, 31, 127, 1024, 1e6, 1e9, 1e12];
for (const integer of integerMagnitudes) {
  assert.equal(ceilMachineCount(integer), integer, `exact integer ${integer}`);

  let above = integer;
  let below = integer;
  for (let index = 0; index < 64; index += 1) {
    above = nextUp(above);
    below = nextDown(below);
  }

  assert.ok(above - integer > getMachineIntegerTolerance(above));
  assert.equal(ceilMachineCount(above), Math.ceil(above), `above boundary ${integer}`);
  assert.equal(ceilMachineCount(below), integer, `below boundary ${integer}`);

  const withinTolerance = integer + getMachineIntegerTolerance(integer) / 2;
  assert.equal(ceilMachineCount(withinTolerance), integer, `ULP noise ${integer}`);
}

assert.equal(ceilMachineCount(0), 0);
assert.equal(ceilMachineCount(-0), 0);
assert.equal(ceilMachineCount(-1), 0);
assert.equal(ceilMachineCount(Number.NaN), 0);
assert.equal(ceilMachineCount(Number.POSITIVE_INFINITY), 0);
assert.equal(ceilMachineCount(9e-8), 1);
assert.equal(ceilMachineCount(2.00000009), 3);
assert.equal(ceilMachineCount(2.0000009), 3);

// Deterministic randomized properties across 18 orders of magnitude.
let state = 0x6d2b79f5;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x1_0000_0000;
};
const samples = [];
for (let index = 0; index < 5000; index += 1) {
  const exponent = -6 + random() * 18;
  const value = 10 ** exponent * (0.1 + random() * 100);
  const rounded = ceilMachineCount(value);
  const tolerance = getMachineIntegerTolerance(value);

  assert.ok(Number.isInteger(rounded), `rounded result must be integral: ${value} -> ${rounded}`);
  assert.ok(rounded >= 0, `rounded result must be nonnegative: ${value} -> ${rounded}`);
  assert.ok(
    rounded === Math.ceil(value) || Math.abs(rounded - value) <= tolerance,
    `rounded result must be ceil or an allowed near-integer snap: ${value} -> ${rounded}`,
  );
  samples.push(value);
}

samples.sort((left, right) => left - right);
let previousRounded = -1;
for (const value of samples) {
  const rounded = ceilMachineCount(value);
  assert.ok(rounded >= previousRounded, `ceiling must be monotonic at ${value}`);
  previousRounded = rounded;
}

// Machine-count cleanup must not move any tested value across an integer edge.
for (const integer of [2, 10, 1e3, 1e6, 1e9]) {
  const beyondTolerance = integer + 12 * Number.EPSILON * integer;
  assert.equal(cleanMachineCount(beyondTolerance), beyondTolerance);
  assert.equal(ceilMachineCount(cleanMachineCount(beyondTolerance)), integer + 1);
}

console.log('Machine-count property tests passed (5,000 seeded samples).');
