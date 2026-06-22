# Industrialist Production Calculator

Visual production planning tool for the Industrialist game. Build flowcharts, calculate machine counts, and optimize factory layouts. Live app here:
https://pollywrath.github.io/Industrialist-Production-Calculator/

## Notice

This site is no longer being updated. A new version of the calculator is available at:
https://industrialist-calculator.pages.dev/

## Features

- **Visual Planning**: Drag-and-drop recipe nodes with auto-balancing
- **LP Solver**: Set targets and compute optimal machine counts with lock/cap constraints
- **Machine Count Control**: Lock nodes to prevent changes or cap them to limit LP solver/suggestions
- **Special Recipes**: Mineshaft Drill, Logic Assembler, Tree Farm, Industrial Firebox, Chemical Plant, Underground Waste Facility, Liquid Dump/Burner
- **Temperature System**: Heat sources, boilers, and temperature-dependent cycles
- **Analysis**: Real-time excess/deficiency detection, flow visualization, pollution tracking
- **Customization**: Theme editor, custom data import/export, favorite recipes
- **Persistent Storage**: Auto-save to browser

## Installation

**Requirements**: Node.js v16+, npm or yarn

```bash
git clone https://github.com/Pollywrath/Industrialist-Production-Calculator.git
cd Industrialist-Production-Calculator
npm install
npm run dev
```

App runs at `http://localhost:5173`

**Build**: `npm run build`  
**Preview**: `npm run preview`

## Controls

### Basic
- **Add Recipe**: Click "+ Select Recipe"
- **Pan**: Left-drag on canvas
- **Zoom**: Mouse wheel
- **Connect**: Drag from output (red, right) to input (green, left)

### Node Actions
- **Edit Count**: Double-click node
- **Lock/Cap Count**: Click 🔒/📊 icon on node to cycle modes (Free → Capped → Locked → Free)
- **Auto-Balance**: Double-click handle (respects locks/caps)
- **Set Target**: Shift+Click node
- **Delete**: Ctrl+Alt+Click node
- **Duplicate**: Middle-click node, left-click to place
- **Configure**: Click ⚙️ on special recipes

### Machine Count Modes
- **🔓 Free**: LP solver and suggestions can modify count freely
- **📊 Capped**: LP solver and suggestions cannot exceed the cap value (cap is set when Apply is pressed)
- **🔒 Locked**: LP solver and suggestions cannot change count at all
- **Note**: You can always manually edit counts regardless of mode

### Connection Actions
- **Delete**: Ctrl+Click input/output rectangle
- **Auto-Connect**: Click input/output rectangle

### Display
- **Per Second/Cycle**: Toggle in extended panel
- **Total/Per Machine**: Toggle in extended panel
- **Pause Pollution**: ▶/❚❚ button

### Canvas
- **Clear All**: Remove all nodes
- **View Targets**: Manage production targets
- **Compute Machines**: Calculate optimal counts (respects locks/caps)

## Data Management

### Import/Export
- **Import JSON**: Products, machines, recipes, or full canvas
- **Export Data**: Products, machines, recipes only
- **Export Canvas**: Layout and configuration
- **Export JSON**: Everything

### Restore Defaults
Resets all data to original game values. **Warning**: Clears canvas and custom data except for themes.

## Project Structure
```
public/                  # Static assets (Apache 2.0 — see License)
├── scip.js
├── scip.js.mem
├── scip.wasm
└── scip.wasm.js
src/
├── components/          # React components
│   ├── ComputeModal.jsx
│   ├── CustomNode.jsx
│   ├── CustomEdge.jsx
│   ├── UnifiedSettings.jsx
│   ├── settingsConfig.jsx
│   ├── ThemeEditor.jsx
│   ├── HelpModal.jsx
│   ├── SaveManager.jsx
│   ├── DataManager.jsx
│   └── RecipeEditor.jsx
├── data/                # Game data (CC BY-NC-SA 4.0)
│   ├── products.json
│   ├── machines.json
│   ├── recipes.json
│   ├── dataLoader.js
│   ├── mineshaftDrill.js
│   ├── logicAssembler.js
│   ├── treeFarm.js
│   ├── industrialFirebox.js
│   ├── chemicalPlant.js
│   ├── undergroundWasteFacility.js
│   ├── liquidDump.js
│   └── liquidBurner.js
├── utils/               # Utilities (MIT)
│   ├── variableHandler.js
│   ├── temperatureUtils.js
│   ├── appUtilities.js
│   ├── recipeBoxCreation.js
│   ├── machineCountPropagator.js
│   ├── dataUtilities.js
│   ├── autoLayout.js
│   └── saveDB.js
├── solvers/             # Production analysis (MIT)
│   ├── productionSolver.js
│   ├── graphBuilder.js
│   ├── flowCalculator.js
│   ├── excessCalculator.js
│   ├── suggestionCalculator.js
│   ├── lpSolver.js
│   └── lpWorker.js
├── App.jsx
├── index.css
└── main.jsx
```

## License

**Dual License**:

### MIT License (Code)
All source code, React components, JavaScript logic, CSS, and utilities are MIT licensed.

### CC BY-NC-SA 4.0 (Game Data)
Game data from [Industrialist Wiki](https://industrialist.miraheze.org/):
- `src/data/*.json` (products, machines, recipes)
- Game constants in:
  - `src/data/mineshaftDrill.js` (drill mechanics, deterioration rates, depth outputs)
  - `src/data/logicAssembler.js` (microchip stages, assembly mechanics)
  - `src/data/treeFarm.js` (growth times, harvest mechanics)
  - `src/data/industrialFirebox.js` (fuel types, energy values)
  - `src/data/chemicalPlant.js` (speed/efficiency calculations)
  - `src/data/undergroundWasteFacility.js` (storage, consumption rates)
  - `src/data/liquidDump.js` (pollution rates)
  - `src/data/liquidBurner.js` (pollution rates)
  - `src/utils/temperatureUtils.js` (heat source definitions, temperature calculations, temperature-dependent cycle formulas)

**Summary**: Code is freely usable (including commercial). Game data is non-commercial only with attribution.

## Credits

- **Game Data**: [Industrialist Wiki](https://industrialist.miraheze.org/)
- **Development**: Pollywrath
- **Built With**: React, ReactFlow, Vite
- **LP/MIP Solver**: [SCIP Optimization Suite](https://www.scipopt.org/) (Apache 2.0) — compiled to WebAssembly by [Jacob Strieb](https://github.com/jstrieb/poker-chipper)

## Support

- **Issues**: [GitHub Issues](https://github.com/Pollywrath/Industrialist-Production-Calculator/issues)
- **Source**: [GitHub Repository](https://github.com/Pollywrath/Industrialist-Production-Calculator)
- **Wiki**: [Industrialist Wiki](https://industrialist.miraheze.org/)

---

**Note**: Fan-made tool, not officially affiliated with Industrialist.
