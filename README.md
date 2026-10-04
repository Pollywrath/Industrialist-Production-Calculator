# Industrialist Calculator

Industrialist Calculator is a browser-based production planner for the Roblox
game Industrialist. Build a graph from
recipes, connect inputs and outputs, and inspect production rates, temperatures,
shortages, and excesses. The app also includes machine-count optimization,
recipe autocomplete, editable game data, and local layout saves.

**Live app:** [industrialist-calculator.pages.dev](https://industrialist-calculator.pages.dev/)

## Stack

- TypeScript 6 and React 19, built with Vite 8.
- [`@xyflow/react`](https://xyflow.com/) renders the recipe and group graph.
- Zustand stores canvas, settings, and result state.
- SCIP and SoPlex compiled to WebAssembly run in a browser Worker for ratio
  optimization. The prebuilt bundle is in `public/scip/`.
- IndexedDB stores layouts, autosave state, custom data overrides, and cached
  wiki comparison results. A service worker provides the installable app shell.

## Calculations

The flow pipeline resolves active recipe variants, builds the connected graph,
allocates product flows, and propagates temperatures. Recipes whose settings
depend on connected flow or temperature can trigger additional passes until the
settings settle or the pass limit is reached. See
[`src/solver/solverPipeline.ts`](src/solver/solverPipeline.ts).

The Ratio Optimizer keeps the recipes already on the canvas. Its staged solve
reduces connected-input shortages, then sink excess, then optimizes enabled
metrics in priority order, and finally minimizes fractional machine counts as
a tie-breaker. Complete Production searches for upstream recipes for existing
targets, solves candidate graphs, and verifies the generated graph before
offering a plan. Optimization metrics use Produced Pollution; the dashboard
reports Net Pollution, including reductions.

The native bundle uses a shared precision policy for solver tolerances and
whole-machine rounding. For the native model, payload, rebuild process, and
smoke suite, see [`tools/scip-wasm/README.md`](tools/scip-wasm/README.md).

## Run locally

Install the dependencies and start Vite from the repository root:

```sh
git clone https://github.com/Pollywrath/Industrialist-Production-Calculator.git
cd Industrialist-Production-Calculator
npm install
npm run dev
```

Available scripts:

```sh
npm run build        # TypeScript project build, then production Vite build
npm run preview      # Serve the production build locally
npm run lint         # ESLint checks for src/
npm run format       # Format source files under src/
npm run format:check # Check source formatting
```

The checked-in WebAssembly bundle is sufficient for local app development.
Docker is required only to rebuild the native solver; follow the instructions in
[`tools/scip-wasm/README.md`](tools/scip-wasm/README.md).

## Code map

| Path                       | Responsibility                                                                    |
| -------------------------- | --------------------------------------------------------------------------------- |
| `src/components/canvas/`   | React Flow canvas, recipe and group nodes, ports, edges, and interactions         |
| `src/components/overlays/` | Recipe selector, optimizer, Data Manager, saves, themes, machines, and Help       |
| `src/data/`                | Built-in recipes, machines, products, research, lookups, and special recipe rules |
| `src/solver/`              | Flow and temperature pipeline, balancing, autocomplete, and ratio optimization    |
| `src/stores/`              | Zustand stores for canvas, solver results, settings, and overlays                 |
| `src/persistence/`         | IndexedDB access, autosave, save transformation, and graph merging                |
| `src/tutorials/`           | Guided tutorial steps and tutorial graph definitions                              |
| `functions/api/`           | Wiki data proxy used by the Data Manager comparison view                          |
| `public/scip/`             | Runtime SCIP and SoPlex WebAssembly assets                                        |
| `tools/scip-wasm/`         | Native wrapper, pinned build setup, and smoke tests                               |

## License and data

The application source is licensed under the MIT License; see [LICENSE](LICENSE).
Game data and third-party assets have separate terms documented in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md).
