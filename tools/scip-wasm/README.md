# Industrialist SCIP WASM

This directory builds the single canonical solver bundle served from
`public/scip/`. The bundle supports the fast staged ratio LP, exact rounded
machine-cost/model-count objectives, recipe autocomplete, and Worker-level
cancellation.

## Bundled Components

- SCIP Optimization Suite 10.0.2.
- SoPlex 8.0.2 from that suite.
- PaPILO 3.0.0 (optional; disabled by default for the serial Emscripten build).
- Emscripten 6.0.2 with serial SCIP execution and resizable WASM memory.
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
to exactly zero. Flow-rate stages (shortage and sink excess) use the shared
scale-aware rate tolerance, with a `1e-12` absolute floor and `1e-9` relative
term. Other objective stages retain the larger of `1e-6` physical units and a
model-size-aware floating-point roundoff allowance. This keeps tiny real flows
from being locked away while avoiding large relative slack in later stages.

Target machine counts remain lower bounds: the optimizer may increase a target
to support downstream targets, but it must not reduce it. A locked node uses the
same finite lower and upper bound; a capped node adds only a finite upper bound.
Returned physical values below `1e-12` are normalized to zero; solver-space
values are never discarded using a fixed threshold before conversion.

Variable sink inputs remain capacity inequalities even when their node is a
target. Flow-dependent fixed inputs can reference accepted flow on other inputs
with exact linear coefficients. The Underground Waste Facility uses this to
require concrete at 2% and lead at 1% of its combined accepted waste flow.

## Native ABI 4

The typed request and result formats use `Float64Array` buffers. The native
capability bitset is `31`:

- Bit 0: typed payload.
- Bit 1: typed result.
- Bit 2: synchronous native solve.
- Bit 3: native stage-progress bridge.
- Bit 4: exact rounded-objective MILP.

Request payload version 6 adds explicit machine lower/upper bounds, the
whole-versus-continuous accounting flag, sparse input-flow dependency terms, and
linear pollution-per-input-flow terms.

Result statuses are `optimal`, `cancelled`, `infeasible`, `unbounded`,
`limit_reached_not_proven`, `numerical_failure`, `invalid_payload`, and
`internal_error`. Only `optimal` results may be applied to the canvas.

The JavaScript worker owns one warmed WASM runtime and serializes solve jobs.
Each native solve is synchronous inside that browser Worker, while the native
wrapper emits stage codes through a small Emscripten message bridge so the UI
still receives staged progress. All SoPlex and SCIP stages use ordinary
single-threaded solve calls. Rounded MILP tiers remain sequential and retain
their fresh SCIP instances and lexicographic locks.

Cancellation terminates the browser Worker, discarding its active WASM runtime.
The next request creates a fresh Worker and warms a new runtime. This keeps the
UI cancellation contract immediate without native pthreads or in-solver
interrupt state.

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

`BUILD_JOBS` caps compiler parallelism only. Four jobs is a reliable default for
Docker Desktop; increase it only when Docker has enough memory for concurrent
PaPILO and SCIP translation units.

The canonical defaults are already encoded in `build.sh`: PaPILO disabled until
its upstream package metadata supports the serial Emscripten toolchain, oneTBB
disabled, no pthreads, serial SCIP execution, memory growth, and output to
`/workspace/public/scip`. Environment overrides are intended only for isolated
experiments; enabling `WITH_PAPILO=ON` currently fails fast if SCIP cannot link
the package without Threads.

The build emits:

```text
public/scip/scip.js
public/scip/scip.wasm
public/scip/VERSION.txt
public/scip/THIRD_PARTY_LICENSES.txt
```

Emscripten 6.0.2 uses `scip.js` itself as the module-worker entrypoint, so this
build does not emit a separate `scip.worker.js` file.

It then runs shell LP/MILP tests plus ABI 4 regression tests against those exact
emitted files. Coverage includes mixed target scales, tiny physical shortage,
large-objective stage locks, exact and near-integer machine ceilings, a
flow-forced ceiling just above an integer, rounded profile selection and support
polishing, targetless power output, required and avoidable infinite-cost
machines, autocomplete's finite-machine preference, stage ordering, and repeated
synchronous solves for cleanup and state isolation. Browser acceptance should
cover Worker termination cancellation, immediate cancellation UI, stale-message
protection, and successful reruns. `VERSION.txt`
records component URLs, actual archive hashes, build flags, and native ABI
version.
`THIRD_PARTY_LICENSES.txt` is regenerated from the pinned solver and toolchain
sources so the deployed WASM bundle carries its required licenses and notices.
The build verifies its pinned SHA-256 before writing the actual hash to
`VERSION.txt`; any unexpected notice change fails the build. The Emscripten base
image is pinned by manifest digest as well as version.

## Browser Requirements

The ratio optimizer runs in a dedicated browser Web Worker so synchronous WASM
solver calls do not block the UI. Cross-origin isolation and
`SharedArrayBuffer` are not required by the single-threaded bundle.

## Validation

Run source checks before rebuilding Docker:

```powershell
npm run lint
npm run build
node --check tools/scip-wasm/smoke-test.mjs
```

The Docker build automatically runs native LP, rounded-MILP, typed ABI,
numerical-scaling, stage-lock, stage-progress, and repeated-lifecycle smoke tests
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
