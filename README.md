# Industrialist Production Calculator

Visual production planning tool for the Industrialist game. Build flowcharts, calculate machine counts, and optimize factory layouts. Live app here:
https://pollywrath.github.io/Industrialist-Production-Calculator/

## Features

- **Visual Planning**: Drag-and-drop recipe nodes with auto-balancing
- **LP Solver**: Set targets and compute optimal machine counts
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
- **Auto-Balance**: Double-click handle
- **Set Target**: Shift+Click node
- **Delete**: Ctrl+Alt+Click node
- **Duplicate**: Middle-click node, left-click to place
- **Configure**: Click ⚙️ on special recipes

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
- **Compute Machines**: Calculate optimal counts

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
src/
├── components/          # React components
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
│   └── dataUtilities.js
├── solvers/             # Production analysis (MIT)
│   ├── productionSolver.js
│   ├── graphBuilder.js
│   ├── flowCalculator.js
│   ├── excessCalculator.js
│   ├── suggestionCalculator.js
│   ├── lpSolver.js
│   └── computeMachinesSolver.js
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
  - `src/utils/temperatureHandler.js` (heat source definitions, temperature calculations)
  - `src/utils/temperatureDependentCycles.js` (temperature-dependent cycle formulas)

**Summary**: Code is freely usable (including commercial). Game data is non-commercial only with attribution.

## Credits

- **Game Data**: [Industrialist Wiki](https://industrialist.miraheze.org/)
- **Development**: Pollywrath
- **Built With**: React, ReactFlow, Vite

## Support

- **Issues**: [GitHub Issues](https://github.com/Pollywrath/Industrialist-Production-Calculator/issues)
- **Source**: [GitHub Repository](https://github.com/Pollywrath/Industrialist-Production-Calculator)
- **Wiki**: [Industrialist Wiki](https://industrialist.miraheze.org/)

---

**Note**: Fan-made tool, not officially affiliated with Industrialist.
