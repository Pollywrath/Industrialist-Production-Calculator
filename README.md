# Industrialist Production Calculator

A visual production planning tool for the Industrialist game. Create interactive flowcharts of your production chains, calculate required machines, and optimize your factory layouts.

## Features

- **Visual Production Planning**: Build interactive flowcharts with drag-and-drop recipe nodes
- **Auto-Balancing**: Double-click handles to instantly balance machine counts, or use "Apply to All" to propagate changes through connected chains
- **LP Optimization**: Set production targets and let the Linear Programming solver compute optimal machine counts across your entire network
- **Special Recipes**: Support for Mineshaft Drill, Logic Assembler, Tree Farm, Industrial Firebox, Chemical Plant, Underground Waste Facility, and Liquid Dump/Burner
- **Temperature System**: Heat source support with temperature tracking, boiler configuration, and temperature-dependent cycle times
- **Analysis**: Real-time excess/deficiency detection, profit calculation, pollution tracking, and flow visualization
- **Full Customization**: Theme editor with 8+ presets, import/export custom data, favorite recipes, and multiple display modes
- **Persistent Storage**: Automatic browser storage saves your work

### Special Recipe Support
- **Mineshaft Drill**: Configure drill heads, consumable acids, machine oil, and target depth with automatic deterioration calculations
- **Logic Assembler**: Set target microchip stages with machine oil speed boost and tick circuit delay adjustment
- **Tree Farm**: Configure trees, harvesters, sprinklers with pollution-aware growth time calculations
- **Industrial Firebox**: Variable fuel support (Coal, Coke Fuel, Planks, Oak Log) with energy-based cycle times
- **Chemical Plant**: Speed and efficiency factor adjustments with multiplicative resource calculations

### Other Systems
- **Temperature System**: Suupport for heat sources, boilers, and temperature-dependent production cycles
  - Geothermal Wells, Fireboxes, Electric Water Heaters, Gas Burners
  - Boiler heat loss configuration
  - Temperature tracking through production chains
  - Temperature-dependent cycle times for Industrial Drill, Alloyer, Coal Liquefaction, Steam Cracking, Water Treatment
- **Pollution Tracking**: Global pollution affects tree growth rates and residue production from Air Separation Units
- **Display Modes**: Toggle between per-second/per-cycle and per-machine/total views
- **Flow Analysis**: Production flow solver with excess/deficiency detection
- **Custom Data**: Import/export custom recipes, products, and machines via JSON

### Customization
- **Theme Editor**: Built-in theme customization with multiple presets
- **Favorite Recipes**: Mark frequently used recipes for quick access
- **Machine Statistics**: View total machine costs and counts by type

## Controls

### Basic Controls
- **Add Recipe**: Click "+ Select Recipe" to browse and add recipe nodes
- **Pan Canvas**: Left-click and drag on empty space
- **Zoom**: Mouse wheel or pinch gesture
- **Connect Nodes**: Drag from output handle (red, right side) to input handle (green, left side)

### Node Interactions
- **Edit Machine Count**: Double-click any node to manually set machine count
- **Auto-Balance Machine Count**: Double-click an input or output handle to automatically adjust machine count based on excess/shortage
- **Set as Target**: Shift+Click a node to mark it as a target product
- **Delete Node**: Ctrl+Alt+Click a node to remove it
- **Duplicate Node**: Middle-click a node, then left-click on canvas to place the copy (right-click to cancel)
- **Configure Special Recipes**: Click the ⚙️ icon on Mineshaft Drill, Logic Assembler, Tree Farm, Industrial Firebox, or Chemical Plant nodes

### Connection Management
- **Delete Connection**: Ctrl+Click on an input or output rectangle to remove all connections to that port
- **Auto-Connect**: Click an input/output rectangle to open recipe selector with auto-connection enabled
- **Connection Paths**: Supports Bezier curves, straight lines, or orthogonal (90° angles) routing

### Display Toggles
- **Per Second / Per Cycle**: Toggle how quantities are displayed
- **Total / Per Machine**: Toggle whether totals include machine count multiplication
- **Pause Pollution**: Use the ▶/❚❚ button to pause/resume global pollution changes

### Canvas Management
- **Clear All**: Remove all nodes and connections
- **View Targets**: Manage production targets and set desired output rates
- **Compute Machines**: *(Coming Soon)* Automatically calculate optimal machine counts

## Installation

### Requirements
- **Node.js**: v16 or higher
- **npm** or **yarn**: Package manager

### Dependencies
- **React 18**: UI framework
- **ReactFlow 12**: Visual flow editor
- **javascript-lp-solver**: Linear programming optimization
- **Vite**: Build tool and dev server

### Local Setup

```bash
# Clone the repository
git clone https://github.com/Pollywrath/Industrialist-Production-Calculator.git
cd Industrialist-Production-Calculator

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The application will be available at `http://localhost:5173`

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome, Firefox, Edge, Safari (latest versions)
- Local storage must be enabled for save functionality

## Data Management

### Importing Custom Data
1. Click menu toggle (`<` button in top-right)
2. Click "Import JSON"
3. Select your JSON file
4. Choose whether to clear current canvas or keep it

#### Supported Import Types
- **Data Only**: Products, machines, and recipes
- **Canvas Only**: Your current production layout
- **Full Export**: Both data and canvas state

### Exporting
- **Export Data**: Products, machines, and recipes only
- **Export Canvas**: Current layout and configuration
- **Export JSON**: Everything (recommended for backups)

### Restoring Defaults
Click "Restore Defaults" in the menu to reset all data to original game values. **Warning**: This clears your canvas and any custom data.

## Project Structure

```
Industrialist-Production-Calculator/
├── src/
│   ├── components/          # React components
│   │   ├── CustomNode.jsx           # Recipe node rendering
│   │   ├── CustomEdge.jsx           # Connection visualization
│   │   ├── DrillSettings.jsx        # Mineshaft drill config
│   │   ├── LogicAssemblerSettings.jsx
│   │   ├── TreeFarmSettings.jsx
│   │   ├── IndustrialFireboxSettings.jsx
│   │   ├── ChemicalPlantSettings.jsx
│   │   ├── TemperatureSettings.jsx
│   │   ├── BoilerSettings.jsx
│   │   └── ThemeEditor.jsx
│   ├── data/               # Game data (CC BY-NC-SA 4.0)
│   │   ├── products.json
│   │   ├── machines.json
│   │   ├── recipes.json
│   │   ├── dataLoader.js
│   │   ├── mineshaftDrill.js
│   │   ├── logicAssembler.js
│   │   ├── treeFarm.js
│   │   ├── industrialFirebox.js
│   │   └── chemicalPlant.js
│   ├── utils/              # Utility functions (MIT)
│   │   ├── variableHandler.js
│   │   ├── temperatureHandler.js
│   │   ├── temperatureDependentCycles.js
│   │   ├── appUtilities.js
│   │   └── recipeBoxCreation.js
│   ├── solvers/            # Production analysis (MIT)
│   │   ├── productionSolver.js
│   │   ├── graphBuilder.js
│   │   ├── flowCalculator.js
│   │   └── excessCalculator.js
│   ├── App.jsx             # Main application
│   ├── index.css           # Global styles
│   └── main.jsx            # Entry point
├── index.html
├── package.json
├── LICENSE
└── README.md
```

## License

This project uses a **dual-license structure**:

### MIT License (Code)
All source code including React components, JavaScript logic, CSS styling, and application utilities are licensed under the MIT License. See [LICENSE](LICENSE) for full details.

### CC BY-NC-SA 4.0 (Game Data)
Game data including:
- All JSON files in `src/data/`
- Game constants and formulas in data-related JavaScript files
- Drill deterioration rates and mechanics
- Temperature calculations and heat source definitions

This data is sourced from the [Industrialist Wiki](https://industrialist.miraheze.org/) and is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**Summary**: Use the code freely for any purpose (including commercial), but game data is for non-commercial use only and requires attribution.

## Credits

- **Game Data**: All recipes, products, machines, and game mechanics sourced from the [Industrialist Wiki](https://industrialist.miraheze.org/)
- **Development**: Pollywrath
- **Built With**: React, ReactFlow, Vite

## Contributing

Contributions are welcome! Please feel free to:
- Submit pull requests with bug fixes or new features
- Open issues for bug reports or feature requests
- Improve documentation
- Share custom themes or production layouts

## Support

- **Issues**: [GitHub Issues](https://github.com/Pollywrath/Industrialist-Production-Calculator/issues)
- **Source Code**: [GitHub Repository](https://github.com/Pollywrath/Industrialist-Production-Calculator)
- **Wiki Reference**: [Industrialist Wiki](https://industrialist.miraheze.org/)

---

**Note**: This is a fan-made tool and is not officially affiliated with the Industrialist game.