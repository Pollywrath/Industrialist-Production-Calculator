# Industrialist Calculator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![React: 19](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Vite: 8](https://img.shields.io/badge/Vite-8-6474f2.svg)](https://vite.dev)
[![TypeScript: 6](https://img.shields.io/badge/TypeScript-6-blue.svg)](https://www.typescriptlang.org)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

An interactive, flowchart-based calculator and factory solver for the Roblox game **Industrialist**. This tool helps players design layouts, calculate production rates, and manage recipe databases.

**Live Application:** [industrialist-calculator.pages.dev](https://industrialist-calculator.pages.dev/)

Created and maintained by [Pollywrath](https://github.com/pollywrath).

---

## Features

*   **Node Graph Canvas:** Built on `@xyflow/react` (React Flow) supporting interactive machine nodes, input/output nodes, group containers, and custom edge lines.
*   **Flow Solver Pipeline:** A deterministic graph solver that computes product rate allocation, handles complex splits and merges, and calculates deficiency/excess rates at each node port.
*   **Temperature Propagation:** Simulates heat transport along connected edges using flow-weighted averages, utilizing an iterative loop (up to 80 passes) to resolve recirculating systems.
*   **Systemic Rate Balancer:** A rate optimizer that runs a Golden-Section Search (GSS) algorithm (40 iterations, $1e-8$ precision threshold) on isolated sub-graphs to balance rate outputs.
*   **Linear Programming (LP) Solver:** Provides an LP interface to solve resource optimization problems using the SCIP Optimization Suite compiled to WebAssembly.
*   **Custom Data Manager:** View and override recipes, machines, and product items. Custom database configurations are validated and bundled inside save files.
*   **Persistence & Autosave:** Uses a dual-path persistence strategy combining a 5-second background interval with a `beforeunload` event handler. Startup restoration is gated to avoid async state issues in React Strict Mode.
*   **Theme Editor & Clean Styling:** A flat, technical blueprint-style interface styled via CSS Modules and unified CSS custom properties (variables), allowing theme switching without inline style contamination.

---

## Architectural Guidelines

To maintain code hygiene, this codebase adheres to strict design contracts:

*   **React Compiler:** This project uses the React Compiler. **Do not** manually add `useMemo`, `useCallback`, or `React.memo` to components, as they are automatically optimized.
*   **Zustand State:** Global state is split into isolated stores (e.g., `useFlowStore` for nodes/edges, `useFlowResultStore` for solver outputs). Do not subscribe high-frequency interactive canvas components directly to global arrays; use selective selectors.
*   **Styling Architecture:** All styling is completely flat, instant, and technical. There are no glows, shadows, gradients, or animations (except loading spinners, save buttons, and material flow dashed edges). Hex, HSL, or RGB colors are strictly prohibited in TSX files and component CSS files; all styling must reference variables defined in [src/index.css](file:///c:/Users/William/Documents/Web%20Apps/industrialist-calculator/src/index.css).
*   **Data Decoupling:** The persistence layer ([src/persistence/](file:///c:/Users/William/Documents/Web%20Apps/industrialist-calculator/src/persistence/)) does not know about recipe formulas or schemas. Save files act as unopinionated data carriers.
*   **TypeScript and Linting:** Strict module compilation is enforced with `verbatimModuleSyntax: true` (explicit `import type` must be used). ESLint warnings/errors must be resolved structurally—do not use `eslint-disable` comments.

---

## Repository Structure

```
├── functions/               # Serverless API functions
│   └── api/
│       └── wiki-bucket.js   # API endpoint for wiki comparison data
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
├── LICENSE                  # MIT Code license
├── ATTRIBUTIONS.md          # CC BY-NC-SA 4.0 asset details & third-party disclaimers
├── README.md                # Project documentation (this file)
├── index.html               # Main HTML document template
├── package.json             # NPM package scripts and dependencies
└── vite.config.ts           # Vite compilation and deployment configuration
```

---

## Getting Started

### Prerequisites

*   **Node.js**: `^18.0.0` or `^20.0.0` (LTS recommended)
*   **NPM**: `^9.0.0` or higher

### Clone & Local Setup

1.  Clone the repository:

    ```bash
    git clone https://github.com/Pollywrath/Industrialist-Production-Calculator.git
    cd Industrialist-Production-Calculator
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Start the local development server:

    ```bash
    npm run dev
    ```

### Production Build & Linting

Build the production bundle:

```bash
npm run build
```

Run linter checks:

```bash
npm run lint
```

Format code automatically with Prettier:

```bash
npm run format
```

Check code formatting status:

```bash
npm run format:check
```

---

## Licensing & Attribution

*   **Codebase:** The application source code is licensed under the [MIT License](./LICENSE).
*   **Assets & Disclaimers:** All third-party game assets, sprites, icons, trademarks, and third-party WebAssembly solver licenses/disclaimers are detailed in [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).