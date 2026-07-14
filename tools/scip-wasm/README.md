# Industrialist SCIP WASM

This directory builds the single canonical solver bundle served from
`public/scip/`. The bundle supports the fast staged ratio LP, exact rounded
machine-cost/model-count objectives, native cancellation, and future SCIP MILP
models such as recipe autocomplete.

## Bundled Components

- SCIP Optimization Suite 10.0.2.
- SoPlex 8.0.2 from that suite.
- PaPILO 3.0.0.
- oneTBB 2021.13.0.
- Emscripten 6.0.2 with pthreads and resizable WASM memory.
- The native wrapper in `industrialist_ratio_wrapper.cpp`.

The build intentionally excludes GCG, UG, ZIMPL, GMP, MPFR, exact-LP support,
commercial solvers, LAPACK, readline, and compression libraries. SCIP's default
MILP plugins remain enabled until autocomplete-shaped benchmarks justify safe
plugin pruning.

## Solver Contract

The ratio optimizer is lexicographic across four stages:

1. Minimize connected-input shortage.
2. Lock shortage and minimize excess on outputs routed to sink nodes.
3. Lock sink excess and minimize the configured weighted objective.
4. Lock the weighted objective and minimize fractional machine count as the
   final tie-breaker.

Stage 3 supports three user-configurable priority tiers. Objectives in the same
tier form a weighted sum, while nonempty tiers are solved lexicographically in
order. The available metrics are power use, power output, net pollution,
machine cost, machine space, and model count. Cost, space, and model count use
the whole-machine variable:

```text
weighted_metric = user_importance * normalized_metric

whole = ceil(machine)
```

Power use and power output are separate metrics. Net pollution treats zero and
negative pollution equally when it is minimized. Effects independent of machine
count are constant for the existing graph and are omitted from ratio selection.
The dashboard and optimizer obtain per-node metrics and normalizers from
`src/utils/optimizationMetrics.ts`.

When no enabled objective or limit depends on whole-machine counts, all stages
reuse one direct SoPlex LP model. When machine cost, machine space, or model
count requires whole-machine counts, Stages 1 and 2 stay in SoPlex, Stage 3 first
solves an LP relaxation, and one direct SCIP model proves the rounded Stage 3
MILP and final tie-break.

Machine ceilings use the shared tolerance in `src/utils/precision.ts`: values
within `max(1e-7, 8 ULP)` of an integer snap to that integer. "Exact rounded"
means exact integer optimization under this documented floating-point contract,
not rational-arithmetic certification.

### Numerical Scaling and Locks

Each undirected connected graph component receives its own value scale. The
largest target in a component is mapped to at most 10,000 solver units; machine,
flow, shortage, and excess variables in that component share that scale. This
keeps a very large target in one disconnected component from erasing meaningful
small values in another component at SoPlex feasibility tolerances.

Objective coefficients, limits, rounded-machine links, returned values, and
stage locks convert through the variable's component scale. Consequently,
shortage, sink excess, and machine-count objectives remain measured in physical
application units. The model-wide `valueScale` telemetry field reports the
largest component scale; it is not used as a global conversion factor.

Stage optima are locked in physical objective units. A zero optimum is locked
to exactly zero. A nonzero optimum permits only the larger of `1e-6` physical
units and a model-size-aware floating-point roundoff allowance. This avoids the
large relative lock slack that could otherwise trade away real shortage in a
later stage.

Target machine counts remain lower bounds: the optimizer may increase a target
to support downstream targets, but it must not reduce it. Returned physical
values below `1e-12` are normalized to zero; solver-space values are never
discarded using a fixed threshold before conversion.

## Native ABI 2

The typed request and result formats use `Float64Array` buffers. The native
capability bitset is `31`:

- Bit 0: typed payload.
- Bit 1: typed result.
- Bit 2: asynchronous native job.
- Bit 3: in-solver cancellation.
- Bit 4: exact rounded-objective MILP.

Result statuses are `optimal`, `cancelled`, `infeasible`, `unbounded`,
`limit_reached_not_proven`, `numerical_failure`, `invalid_payload`, and
`internal_error`. Only `optimal` results may be applied to the canvas.

The JavaScript worker owns one warmed WASM runtime and serializes solve jobs.
The native async job copies its payload before returning, runs on one Emscripten
pthread, exposes stage progress, and is always joined before another job starts.
Wrapper-owned cancellation state is atomic; a separate volatile flag exists only
for SoPlex's interrupt API. SCIP cancellation uses `SCIPinterruptSolve()` while a
mutex protects the active SCIP pointer's lifetime. Cancelling does not terminate
the browser worker or discard the WASM runtime.

Worker exceptions are converted to `internal_error` results instead of escaping
the pthread entry point. Model data is moved into the active solver, the SoPlex
engine is destroyed before a rounded SCIP solve begins, and completed result
storage is released after JavaScript accepts it. If result-buffer allocation
fails, the native result remains available for a later read.

## Build

The Dockerfile copies the wrapper, build script, and smoke tests into the image.
Therefore, rebuild the image after any of those files changes. Running an old
image with a new checkout can silently emit stale native code.

PowerShell:

```powershell
docker buildx build --load -t industrialist-scip-wasm -f tools/scip-wasm/Dockerfile .
docker run --rm -v "${PWD}:/workspace" industrialist-scip-wasm
```

Command Prompt:

```bat
docker buildx build --load -t industrialist-scip-wasm -f tools/scip-wasm/Dockerfile .
docker run --rm -v "%cd%:/workspace" industrialist-scip-wasm
```

The canonical defaults are already encoded in `build.sh`: PaPILO, oneTBB,
pthreads, a four-thread Emscripten pool, memory growth, and output to
`/workspace/public/scip`. Environment overrides are intended only for isolated
experiments.

The build emits:

```text
public/scip/scip.js
public/scip/scip.wasm
public/scip/VERSION.txt
public/scip/THIRD_PARTY_LICENSES.txt
```

Emscripten 6.0.2 uses `scip.js` itself as the module-worker entrypoint, so this
build does not emit a separate `scip.worker.js` file.

It then runs shell LP/MILP tests plus ABI 2 regression tests against those exact
emitted files. Coverage includes mixed target scales, tiny physical shortage,
large-objective stage locks, exact and near-integer machine ceilings, targetless
power output, required and avoidable infinite-cost machines, cancellation, and
repeated asynchronous solves for cleanup and state isolation. `VERSION.txt`
records component URLs, actual archive hashes, build flags, and native ABI
version.
`THIRD_PARTY_LICENSES.txt` is regenerated from the pinned solver and toolchain
sources so the deployed WASM bundle carries its required licenses and notices.
The build verifies its pinned SHA-256 before writing the actual hash to
`VERSION.txt`; any unexpected notice change fails the build. The Emscripten base
image is pinned by manifest digest as well as version.

## Browser Requirements

Pthread WASM requires `SharedArrayBuffer` and a cross-origin-isolated page. Every
HTML/document response must include:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Vite dev and preview headers are configured in `vite.config.ts`. Production
hosting must set equivalent headers. Cross-origin images, scripts, workers, and
iframes also need compatible CORS/CORP/COEP headers. The ratio worker reports a
clear initialization error when isolation or ABI 2 capabilities are missing.

## Validation

Run source checks before rebuilding Docker:

```powershell
npm run lint
npm run build
node --check tools/scip-wasm/smoke-test.mjs
```

The Docker build automatically runs native LP, rounded-MILP, typed ABI,
cancellation, numerical-scaling, stage-lock, and repeated-lifecycle smoke tests
against the emitted bundle.

Telemetry includes profile, status, per-stage objective/time, model dimensions,
coefficient/bound ranges, payload/result sizes, SoPlex/SCIP LP iterations, MILP
nodes, primal/dual bounds, gap, rounded-variable count, WASM memory, and graph
presolve reductions.

## Future Autocomplete

The same WASM file is suitable for a future recipe-selection model: SCIP,
integer variables, direct model construction, cancellation, compact typed
buffers, and proof telemetry are already present. Autocomplete still needs its
own native model/API with recipe-activity variables, product-balance rows,
candidate filtering, and optional recipe-use binaries for fixed per-recipe
effects. It should not be forced into the current fixed-graph ratio payload.
