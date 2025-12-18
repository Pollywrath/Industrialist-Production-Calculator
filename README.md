# Industrialist Production Calculator

A visual production planning tool for the Industrialist game. Create interactive flowcharts of your production chains, calculate required machines, and optimize your factory layouts.

## Features

- **Visual Recipe Planning**: Drag-and-drop interface for building production chains
- **Smart Connections**: Automatically connect compatible inputs and outputs
- **Target Production**: Set production goals and calculate required machines
- **Custom Data**: Import/export custom recipes, products, and machines
- **Persistent Storage**: Your work is automatically saved in browser storage
- **Variable Support**: Handle recipes with variable inputs/outputs/cycle times

## Local Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd industrialist-planner

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
- **Connect Nodes**: Drag from output (red) to input (green) handles
- **Set Target**: `Shift + Click` a node to mark it as a target product
- **Delete Node**: `Ctrl + Alt + Click` a node to remove it
- **Pan Canvas**: Click and drag on empty space
- **Zoom**: Mouse wheel or pinch gesture

### Target Products

1. `Shift + Click` any recipe node to set it as a target
2. Click "View Targets" to manage target production rates
3. Enter desired output per second
4. (Machine count calculation coming in future updates)

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
      "name": "Custom Machine"
    }
  ],
  "recipes": [
    {
      "id": "r_custom_recipe",
      "name": "Make Custom Item",
      "machine_id": "m_custom_machine",
      "cycle_time": 5,
      "power_consumption": 1000,
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
- Machines: Must have unique IDs (import fails if duplicates found)
- Recipes: All recipes using imported machine IDs are replaced
- Variable values: Use `"Variable"` for flexible quantities/times

### Exporting Your Work

1. Click the menu toggle (`<`)
2. Click "Export JSON"
3. Saves current canvas layout + all data

This exports everything: products, machines, recipes, and your current canvas state.

## Customizing Appearance

All visual styling is controlled via CSS variables in `src/index.css`. Edit the `:root` section:

### Colors

```css
:root {
  /* Primary theme color (gold) */
  --color-primary: #d4a637;
  --color-primary-hover: #f5d56a;
  
  /* Background colors */
  --bg-main: #0a0a0a;
  --bg-secondary: #1a1a1a;
  
  /* Text colors */
  --text-primary: #f5d56a;
  --text-secondary: #999;
  
  /* Input (green) / Output (red) colors */
  --input-bg: #1a3a2a;
  --input-border: #22c55e;
  --input-text: #86efac;
  --output-bg: #3a1a1a;
  --output-border: #ef4444;
  --output-text: #fca5a5;
}
```

### Typography

```css
:root {
  /* Font sizes */
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-md: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;
}
```

Change the font family in the `body` selector:

```css
body {
  font-family: 'Your Font', -apple-system, sans-serif;
}
```

### Spacing & Layout

```css
:root {
  /* Spacing scale */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 15px;
  --spacing-xl: 20px;
  
  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

## Data Management

### Storage Location

All data is stored in browser `localStorage`:
- `industrialist_products` - Product definitions
- `industrialist_machines` - Machine types  
- `industrialist_recipes` - Recipe data
- `industrialist_canvas_state` - Current canvas layout

### Restoring Defaults

Click "Restore Defaults" in the menu to reset all data to original values. **This clears your canvas and any custom data.**

## Project Structure

```
industrialist-planner/
├── src/
│   ├── components/
│   │   ├── CustomNode.jsx    # Recipe node rendering
│   │   └── CustomEdge.jsx    # Connection lines
│   ├── data/
│   │   ├── dataLoader.js     # Data management & storage
│   │   ├── products.json     # Default products
│   │   ├── machines.json     # Default machines
│   │   └── recipes.json      # Default recipes
│   ├── utils/
│   │   └── variableHandler.js # Variable value formatting
│   ├── App.jsx               # Main application
│   ├── index.css             # Global styles
│   └── main.jsx              # Entry point
├── index.html
└── package.json
```

## License

MIT License - see [LICENSE](LICENSE) file for details
