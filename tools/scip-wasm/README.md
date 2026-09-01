# Industrialist SCIP WASM

This directory builds the single canonical solver bundle served from
`public/scip/`. The bundle supports the fast staged ratio LP, exact rounded
machine-cost/model-count objectives, recipe autocomplete, and native
cancellation.

## Bundled Components

- SCIP Optimization Suite 10.0.2.
- SoPlex 8.0.2 from that suite.
- PaPILO 3.0.0.
- oneTBB 2021.13.0.
- Emscripten 6.0.2 with pthreads, SCIP's TinyCThread task-processing interface,
  and resizable WASM memory.
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
machine cost, machine space, and model count. Cost, space, and model count can
use either exact whole-machine accounting or a faster continuous estimate:

```text
weighted_metric = user_importance * normalized_metric

whole = ceil(machine)

continuous_metric = metric_per_machine * machine
```

Power use and power output are separate metrics. Net pollution treats zero and
negative pollution equally when it is minimized. Effects independent of machine
count are constant for the existing graph and are omitted from ratio selection.
The dashboard and optimizer obtain per-node metrics and normalizers from
`src/utils/optimizationMetrics.ts`.

When no enabled objective depends on whole-machine counts, all stages
reuse one direct SoPlex LP model. When machine cost, machine space, or model
count requires whole-machine counts, Stages 1 and 2 stay in SoPlex, Stage 3 first
solves an LP relaxation, and one direct SCIP model proves the rounded Stage 3
MILP and final tie-break.

Machine ceilings use the shared tolerance in `src/utils/precision.ts`: values
within `max(1e-7, 8 ULP)` of an integer snap to that integer. "Exact rounded"
means exact integer optimization under this documented floating-point contract,
not rational-arithmetic certification. The native ceiling rows reserve SCIP's
configured feasibility tolerance inside this boundary, and result validation
independently checks every returned whole-machine value against the shared
rounding function.

Autocomplete asks the native solver to exclude avoidable infinite-cost machines
before applying the user's first objective tier. If no finite-machine solution
can satisfy the locked shortage and sink-excess stages, those machines remain
available. This feasibility preference does not turn a continuous autocomplete
objective into a rounded MILP.

### Rounded MILP Performance

The production rounded profile uses SCIP's optimality emphasis, aggressive
presolving, and downward branching for whole-machine variables. Before the full
solve, models with at least 24 rounded variables may run a temporary
support-polishing solve. It fixes only recipes whose LP machine count is already
zero and stops after two seconds or 500 nodes. A feasible polished result is used
only as a stronger incumbent and to tighten objective-derived upper bounds. The
unrestricted model still proves every tier to optimality, so polishing cannot
remove a globally optimal recipe combination or turn the result into an
approximation.

One WASM bundle contains comparison profiles for development benchmarks. Set
`VITE_SCIP_ROUNDED_MILP_PROFILE` before starting Vite:

- `0`: tuned profile with support polishing (default).
- `1`: previous numerical-emphasis and fast-presolve profile.
- `2`: unmodified SCIP defaults.
- `3`: tuned profile without support polishing.

The selected profile and polishing time are reported in solver telemetry. These
profiles change search strategy only; all of them require SCIP's optimal status
before a result can be applied.

### Numerical Scaling and Locks

Each undirected connected graph component receives its own value scale. The
largest target in a component is mapped to at most 10,000 solver units; machine,
flow, shortage, and excess variables in that component share that scale. This
keeps a very large target in one disconnected component from erasing meaningful
small values in another component at SoPlex feasibility tolerances.

Objective coefficients, rounded-machine links, returned values, and
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
to support downstream targets, but it must not reduce it. A locked node uses the
same finite lower and upper bound; a capped node adds only a finite upper bound.
Returned physical values below `1e-12` are normalized to zero; solver-space
values are never discarded using a fixed threshold before conversion.

Variable sink inputs remain capacity inequalities even when their node is a
target. Flow-dependent fixed inputs can reference accepted flow on other inputs
with exact linear coefficients. The Underground Waste Facility uses this to
require concrete at 2% and lead at 1% of its combined accepted waste flow.

## Native ABI 3

The typed request and result formats use `Float64Array` buffers. The native
capability bitset is `31`:

- Bit 0: typed payload.
- Bit 1: typed result.
- Bit 2: asynchronous native job.
- Bit 3: in-solver cancellation.
- Bit 4: exact rounded-objective MILP.

Request payload version 5 adds explicit machine lower/upper bounds, the
whole-versus-continuous accounting flag, and sparse input-flow dependency terms.

Result statuses are `optimal`, `cancelled`, `infeasible`, `unbounded`,
`limit_reached_not_proven`, `numerical_failure`, `invalid_payload`, and
`internal_error`. Only `optimal` results may be applied to the canvas.

The JavaScript worker owns one warmed WASM runtime and serializes solve jobs.
The native async job copies its payload before returning, runs on one Emscripten
pthread, exposes stage progress, and is always joined before another job starts.
Each rounded MILP model's initial SCIP search uses SCIP's concurrent solve API
with a maximum of four cooperating SCIP solver threads (or fewer if the runtime
cannot provide them). The later lexicographic lock stages reuse that model with
ordinary SCIP solves because SCIP's concurrent API is not safely re-entered on
the same mutable model under the threaded WASM TPI. This remains one
coordinated solve of one model, not four independent application requests.
Continuous LP stages continue to use the single-threaded SoPlex path.
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
docker run --rm -e BUILD_JOBS=4 -v "${PWD}:/workspace" industrialist-scip-wasm
```

Command Prompt:

```bat
docker buildx build --load -t industrialist-scip-wasm -f tools/scip-wasm/Dockerfile .
docker run --rm -e BUILD_JOBS=4 -v "%cd%:/workspace" industrialist-scip-wasm
```

`BUILD_JOBS` caps compiler parallelism. Four jobs is a reliable default for
Docker Desktop; increase it only when Docker has enough memory for concurrent
PaPILO and SCIP translation units.

The canonical defaults are already encoded in `build.sh`: PaPILO, oneTBB,
SCIP TPI via TinyCThread, pthreads, a five-thread Emscripten pool (one native
coordinator plus four SCIP solver threads), memory growth, and output to
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

It then runs shell LP/MILP tests plus ABI 3 regression tests against those exact
emitted files. Coverage includes mixed target scales, tiny physical shortage,
large-objective stage locks, exact and near-integer machine ceilings, a
flow-forced ceiling just above an integer, rounded profile selection and support
polishing, targetless power output, required and avoidable infinite-cost
machines, autocomplete's finite-machine preference, cancellation, and repeated
asynchronous solves for cleanup and state isolation. `VERSION.txt`
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
clear initialization error when isolation or ABI 3 capabilities are missing.

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
nodes, primal/dual bounds, gap, rounded-variable count, incumbent-polishing time,
WASM memory, and graph presolve reductions.

## Autocomplete

TypeScript builds and filters the available recipe candidates, resolves special
recipe settings and temperature-compatible connections, then sends the compact
candidate graph through the same native staged ratio API. Continuous objectives
stay on the direct SoPlex path. Enabling machine cost, machine space, or model
count introduces exact whole-machine variables and uses SCIP's MILP path.
