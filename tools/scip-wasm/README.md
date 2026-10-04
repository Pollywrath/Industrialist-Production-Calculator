# Native solver bundle

The ratio optimizer calls SCIP through a WebAssembly bundle checked into
`public/scip/`. The app loads it in a browser Worker, so solver calls do not
freeze the canvas. You can run the app with the checked-in bundle; Docker is
only needed when changing or rebuilding the native solver.

## What the solver optimizes

The native model solves these stages in order:

1. Reduce shortages at connected inputs.
2. Reduce excess sent to sink outputs.
3. Optimize the enabled metrics, in their configured priority tiers.
4. Reduce fractional machine counts to settle ties.

Metrics in stage 3 are Power Use, Produced Pollution, Machine Cost, Machine
Space, and Machine Model Count. Metrics in the same tier are combined using
their configured weights. Produced Pollution counts positive recipe and flow
emissions; pollution reductions do not offset it. The dashboard separately
reports Net Pollution.

Power Use and Pollution are continuous objectives. Machine Cost, Machine
Space, and Machine Model Count can use whole-machine accounting. Continuous
models use SoPlex. If a whole-machine objective is enabled, the solver uses
SCIP's mixed-integer path for that objective stage. The optimizer configuration
and objective definitions live in `src/solver/optimizationConfig.ts`.

Targets set lower bounds: the solver can add machines to support downstream
targets, but it cannot reduce the target count. Locked counts use the same
lower and upper bound; capped counts add an upper bound.

## Precision and validation

`src/utils/precision.ts` is the source of truth for rate tolerances and
whole-machine rounding. The native checks in
`industrialist_ratio_wrapper.cpp` should follow the same tolerance rules. The
wrapper validates returned values before the Worker lets the app apply them.

Each connected component is scaled independently so a large target in one part
of the graph does not wash out small flows elsewhere. Stage locks and result
validation convert back to application units. Do not use one global scale to
interpret every component's values.

Autocomplete builds candidate recipes in TypeScript and sends them through the
same ratio solver. It prefers finite-cost machines when they can satisfy the
earlier shortage and sink stages. After a solve, it materializes and verifies
the resulting graph before applying it.

## Bundle and Worker

The bundle includes SCIP 10.0.2 and SoPlex 8.0.2, built with Emscripten 6.0.2.
The production build is single-threaded and does not require cross-origin
isolation or `SharedArrayBuffer`. PaPILO and oneTBB are disabled in the default
build.

The JavaScript Worker owns the WebAssembly runtime and serializes requests. A
cancel request terminates that Worker; the next solve creates and warms a new
one. The request and result use typed `Float64Array` payloads. ABI details and
stage codes are defined in `industrialist_ratio_wrapper.cpp` and
`src/solver/ratioOptimizerWorker.ts`.

## Rebuild the bundle

Use Docker Buildx from the repository root. Rebuild the image when the wrapper,
build script, Dockerfile, or smoke test changes; an older image can otherwise
produce stale native code.

PowerShell:

```powershell
docker buildx build --load -t industrialist-scip-wasm -f tools/scip-wasm/Dockerfile .
docker run --rm -e BUILD_JOBS=4 -v "${PWD}:/workspace" industrialist-scip-wasm
```

Command Prompt:

```bat
docker buildx build --load -t industrialist-scip-wasm -f tools/scip-wasm/Dockerfile .
docker run --rm -e BUILD_JOBS=4 -v "%cd%:/workspace" industrialist-scip-wasm
```

The build writes these files:

```text
public/scip/scip.js
public/scip/scip.wasm
public/scip/VERSION.txt
public/scip/THIRD_PARTY_LICENSES.txt
```

`VERSION.txt` records the pinned component versions, source hashes, build flags,
and ABI version. The build verifies the pinned hashes and regenerates the
license notices before finishing.

## Checks

The Docker build runs the native smoke suite against the bundle it just built.
It covers LP and mixed-integer results, precision and stage locks, progress,
repeated solves, and a cancellation-sensitive flow case. Run the source
checks separately when needed:

```sh
npm run lint
npm run build
node --check tools/scip-wasm/smoke-test.mjs
```

The optional rounded-MILP search profiles can be selected with
`VITE_SCIP_ROUNDED_MILP_PROFILE` (`0` through `3`). They change SCIP's search
settings, not the objective definition. The selected profile appears in solver
telemetry.
