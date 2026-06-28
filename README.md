# Industrialist Calculator

An interactive, flowchart-based calculator and factory solver for the Roblox game **Industrialist**. This tool helps players design layouts, calculate production rates, and manage recipe databases.

---

## Features

*   **Node Graph Canvas:** Built on `@xyflow/react` (React Flow) supporting interactive machine nodes, input/output nodes, group containers, and custom edge lines.
*   **Flow Solver Pipeline:** A deterministic graph solver that computes product rate allocation, handles complex splits and merges, and calculates deficiency/excess rates at each node port.
*   **Temperature Propagation:** Simulates heat transport along connected edges using flow-weighted averages, utilizing an iterative loop (up to 80 passes) to resolve recirculating systems.
*   **Systemic Rate Balancer:** A rate optimizer that runs a Golden-Section Search (GSS) algorithm (40 iterations, $1e-8$ precision threshold) on isolated sub-graphs to balance rate outputs.
*   **Linear Programming (LP) Solver:** Provides an LP interface to solve resource optimization problems.
*   **Custom Data Manager:** View and override recipes, machines, and product items. Custom database configurations are validated and bundled inside save files.
*   **Persistence & Autosave:** Uses a dual-path persistence strategy combining a 5-second background interval with a `beforeunload` event handler. Startup restoration is gated to avoid async state issues in React Strict Mode.
*   **Theme Editor & CAD-like Styling:** A flat, CAD-style interface styled via CSS Modules and unified CSS custom properties (variables), allowing theme switching without inline style contamination.

---

## Repository Structure

```
├── functions/               # Serverless API functions
│   └── api/
│       └── wiki-bucket.js   # Cloudflare Pages API endpoint for wiki comparison data
├── public/                  # Static assets
│   ├── icons/               # Sprites and graphical icons (CC BY-NC-SA 4.0)
│   ├── scip/                # WebAssembly compiled SCIP Solver (Apache 2.0)
│   │   ├── scip.js          # JS loader wrapper for WebAssembly SCIP
│   │   ├── scip.wasm        # WebAssembly binary of the SCIP solver
│   │   └── scip.wasm.js     # SCIP Emscripten build glue code
│   └── induslogo.webp       # Application logo
├── src/
│   ├── components/          # React components
│   │   ├── canvas/          # Custom node elements, custom edges, and the canvas grid
│   │   ├── menu/            # Canvas menu controls and buttons
│   │   ├── overlays/        # Help, Saves, Themes, Data, and LP Solver panels
│   │   ├── shared/          # Generic UI components (inputs, virtual lists, dialogs)
│   │   └── tutorial/        # Tutorial controller overlays and steps
│   ├── data/                # Hardcoded static recipes, machines, products, and registry
│   ├── hooks/               # Core React hooks and flow solver execution wrapper
│   ├── persistence/         # Autosave execution, JSON serialization, and IndexedDB adapters
│   ├── services/            # Wiki comparison client and canvas image exporting utilities
│   ├── solver/              # Pipeline orchestrator, graph builders, flow solvers, and temperature models
│   ├── stores/              # Zustand global stores (flow, results, saves, themes)
│   ├── theme/               # Color presets and runtime theme manager
│   ├── tutorials/           # Saved JSON layouts and steps for interactive tutorials
│   ├── types/               # TypeScript interface definitions and schema validation models
│   ├── utils/               # Math utilities, machine taxonomies, and ID generators
│   ├── App.tsx              # Root React component
│   ├── index.css            # Base stylesheet containing global CSS variables
│   └── main.tsx             # Application entrypoint
├── LICENSE                  # MIT Code license & CC BY-NC-SA 4.0 asset disclaimer
├── README.md                # Project documentation (this file)
├── index.html               # Main HTML document template
├── package.json             # NPM package scripts and dependencies
└── vite.config.ts           # Vite compilation and deployment configuration
```

---

## Getting Started

### Installation

Install dependencies:

```bash
npm install
```

### Development

Start the Vite development server:

```bash
npm run dev
```

### Production

Build the production bundle:

```bash
npm run build
```

Run linter checks:

```bash
npm run lint
```

---

## Licensing & Attribution

*   **Codebase:** The application source code is licensed under the [MIT License](./LICENSE).
*   **Sprites, Icons, and Logo:** Sourced from the official [Industrialist Wiki](https://industrialist.miraheze.org) (operated by Mamytema Studios) and licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/). These files (located under `public/icons/` and `public/induslogo.webp`) are not covered by the MIT License.
*   **SCIP WebAssembly Solver:** The compiled solver binaries located under `public/scip/` are a browser-compatible build of the SCIP Optimization Suite compiled to WebAssembly, adapted from Jacob Strieb's [Poker Chipper](https://github.com/jstrieb/poker-chipper) repository with modifications to support dynamic WebAssembly memory growth. The underlying SCIP Optimization Suite is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
*   **Disclaimer:** This is an unofficial community project and is unaffiliated with Mamytema Studios or Roblox.