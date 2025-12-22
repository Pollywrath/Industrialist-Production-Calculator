# Industrialist Production Calculator

A visual production planning tool for the Industrialist game. Create interactive flowcharts of your production chains, calculate required machines, and optimize your factory layouts.

## Features

- **Visual Recipe Planning**: Drag-and-drop interface for building production chains
- **Smart Connections**: Automatically connect compatible inputs and outputs
- **Machine Count Editing**: Double-click nodes to set precise machine counts
- **Target Production**: Set production goals for optimizing your factory
- **Production Analysis**: Track excess products, deficiencies, and profit calculations
- **Custom Data**: Import/export custom recipes, products, and machines
- **Persistent Storage**: Your work is automatically saved in browser storage
- **Variable Support**: Handle recipes with variable inputs/outputs/cycle times
- **Special Recipes**: Full support for Mineshaft Drill, Logic Assembler, Tree Farm, and Industrial Firebox
- **Temperature System**: Model heat sources, boilers, and temperature-dependent production
- **Theme Customization**: Built-in theme editor with multiple presets

## Data Sources

All game data (products, machines, recipes, and mechanics) were sourced from the [Industrialist Wiki](https://industrialist.miraheze.org/).

### Custom Calculations & Assumptions

**Residue Production Formula**  
The Air Separation Unit's residue output is calculated based on global pollution using a custom formula:

```
residue_amount = (ln(1 + (5429 × pollution) / 7322))^1.1
```

where `pollution` is the global pollution percentage. This formula was chosen because it produced 5L/s of residue at 100 pollution, change if you want.

**Microchip Pricing**  
Microchip prices follow the established pattern from the wiki for basic stages. For advanced microchips (outer stage 2x and above, excluding 64x inner stage variants), prices were extrapolated by analyzing the pricing progression of first-stage microchips and applying similar growth rates to maintain economic balance.

## Upcoming Features

- **Compute Machines Button**: Automatic calculation of optimal machine counts to meet production targets
- **Machine Multiplier Propagation**: Change one recipe's machine count and automatically scale connected recipes proportionally throughout your production chain

## Local Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup

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
```

The app will be available at `http://localhost:5173`

## Usage Guide

### Basic Controls

- **Add Recipe**: Click "+ Select Recipe" to browse and add recipe nodes
- **Edit Machine Count**: Double-click any node to edit its machine count
- **Connect Nodes**: Drag from output (red) to input (green) handles
- **Delete Connection**: Ctrl+Click on an input or output rectangle to remove all connections
- **Set Target**: Shift+Click a node to mark it as a target product
- **Delete Node**: Ctrl+Alt+Click a node to remove it
- **Pan Canvas**: Click and drag on empty space
- **Zoom**: Mouse wheel or pinch gesture

### Display Modes

- **Per Second / Per Cycle**: Toggle how quantities are displayed
- **Total / Per Machine**: Toggle whether totals include machine count multiplication

### Special Recipes

**Mineshaft Drill**  
Configure drill head type, consumable acid, machine oil usage, and target depth. The system automatically calculates deterioration rates, cycle times, and output quantities based on your configuration.

**Logic Assembler**  
Set target microchip (outer and inner stage), enable machine oil for 5x speed boost, and adjust tick circuit delay. The calculator determines required materials, cycle time, and power consumption.

**Tree Farm**  
Configure number of trees, harvesters, sprinklers, and outputs. The system calculates sustainable harvest rates based on current global pollution levels (pollution affects tree growth time).

**Industrial Firebox**  
Select fuel type (Coal, Coke Fuel, Planks, Oak Log) and the system calculates energy-based cycle times and fuel consumption rates.

### Temperature System

Some machines produce temperature-dependent outputs:
- **Heat Sources**: Geothermal Wells, Fireboxes, Electric Water Heaters, Gas Burners
- **Boilers**: Convert hot water to steam (click wrench icon to configure heat loss)
- **Temperature-Dependent Cycles**: Industrial Drill, Alloyer, Coal Liquefaction Plant, Steam Cracking Plant, Water Treatment Plant

Temperature is tracked through connections and affects cycle times where applicable.

### Target Products

1. Shift+Click any recipe node to set it as a target
2. Click "View Targets" to manage target production rates
3. Enter desired output per second
4. (Automatic machine count calculation coming soon)

## Customizing Data

### Adding New Recipes via Import

Create a JSON file with your custom data:

```json
{
  "products": [
    {
      "id": "p_custom_item",
      "name": "Custom Item",
      "type": "item",
      "price": 100,
      "rp_multiplier": 1.5
    }
  ],
  "machines": [
    {
      "id": "m_custom_machine",
      "name": "Custom Machine",
      "cost": 5000
    }
  ],
  "recipes": [
    {
      "id": "r_custom_recipe",
      "name": "Make Custom Item",
      "machine_id": "m_custom_machine",
      "cycle_time": 5,
      "power_consumption": 1000000,
      "pollution": 10,
      "inputs": [
        {
          "product_id": "p_iron_ore",
          "quantity": 2
        }
      ],
      "outputs": [
        {
          "product_id": "p_custom_item",
          "quantity": 1
        }
      ]
    }
  ]
}
```

**Import Steps:**
1. Click the menu toggle (`<`) in the top-right corner
2. Click "Import JSON"
3. Select your JSON file
4. Choose whether to clear the current canvas or keep it

**Notes:**
- Products: If `id` matches existing product, it will be replaced; otherwise added
- Machines: Must have unique IDs
- Recipes: All recipes using imported machine IDs are replaced
- Variable values: Use `"Variable"` for flexible quantities/times
- Power consumption: In MF/s (e.g., 1000000 = 1 MMF/s)

### Exporting Your Work

1. Click the menu toggle (`<`)
2. Click "Export JSON"
3. Downloads a timestamped file with all current data

This exports everything: products, machines, recipes, and your current canvas state.

## Theme Customization

The app includes a built-in theme editor with multiple presets:

**Built-in Themes:**
- Golden Industrial (Default)
- Dracula
- Nord
- Solarized Dark/Light
- Midnight Blue
- Forest Green
- Sunset Orange
- Cyberpunk

**To Customize:**
1. Open the menu (`<` button)
2. Click "Theme Editor"
3. Choose a preset or use "Advanced Editing" for full control
4. All changes are saved automatically

### Manual Theme Editing

All visual styling uses CSS variables in `src/index.css`. Edit the `:root` section:

```css
:root {
  /* Primary theme color */
  --color-primary: #d4a637;
  --color-primary-hover: #f5d56a;
  
  /* Background colors */
  --bg-main: #0a0a0a;
  --bg-secondary: #1a1a1a;
  
  /* Input (green) / Output (red) colors */
  --input-bg: #1a3a2a;
  --input-border: #22c55e;
  --output-bg: #3a1a1a;
  --output-border: #ef4444;
}
```

## Data Management

### Storage Location

All data is stored in browser `localStorage`:
- `industrialist_products` - Product definitions
- `industrialist_machines` - Machine types  
- `industrialist_recipes` - Recipe data
- `industrialist_canvas_state` - Current canvas layout
- `industrialist_theme` - Theme settings

### Restoring Defaults

Click "Restore Defaults" in the menu to reset all data to original values. **This clears your canvas and any custom data.**

## Project Structure

```
Industrialist-Production-Calculator/
├── src/
│   ├── components/
│   │   ├── CustomNode.jsx           # Recipe node rendering
│   │   ├── CustomEdge.jsx           # Connection lines
│   │   ├── DrillSettings.jsx        # Mineshaft drill config
│   │   ├── LogicAssemblerSettings.jsx
│   │   ├── TreeFarmSettings.jsx
│   │   ├── IndustrialFireboxSettings.jsx
│   │   ├── TemperatureSettings.jsx
│   │   ├── BoilerSettings.jsx
│   │   ├── ChemicalPlantSettings.jsx
│   │   └── ThemeEditor.jsx          # Theme customization UI
│   ├── data/
│   │   ├── dataLoader.js            # Data management & storage
│   │   ├── mineshaftDrill.js        # Drill calculations
│   │   ├── logicAssembler.js        # Logic assembler calculations
│   │   ├── treeFarm.js              # Tree farm calculations
│   │   ├── industrialFirebox.js     # Firebox calculations
│   │   ├── chemicalPlant.js         # Chemical plant calculations
│   │   ├── products.json            # Default products
│   │   ├── machines.json            # Default machines
│   │   └── recipes.json             # Default recipes
│   ├── utils/
│   │   ├── variableHandler.js       # Variable value formatting
│   │   ├── temperatureHandler.js    # Temperature system
│   │   ├── temperatureDependentCycles.js
│   │   └── appUtilities.js          # Helper functions
│   ├── solvers/
│   │   ├── productionSolver.js      # Production network analysis
│   │   ├── graphBuilder.js          # Build production graph
│   │   ├── flowCalculator.js        # Calculate product flows
│   │   └── excessCalculator.js      # Find excess/deficiencies
│   ├── App.jsx                      # Main application
│   ├── index.css                    # Global styles
│   └── main.jsx                     # Entry point
├── index.html
├── package.json
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/Pollywrath/Industrialist-Production-Calculator).

## License

MIT License - see LICENSE file for details

## Credits

- Game data sourced from [Industrialist Wiki](https://industrialist.miraheze.org/)
- Built with React, ReactFlow, and Vite
- Created by Pollywrath