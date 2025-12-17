# Industrialist Production Line Planner 🎯

A production line planning and computation tool for the game **Industrialist**. Visualize and design your factory layouts using an interactive node-based flow editor with a dark mode theme and yellow/mustard accents.

## 🛠️ Tech Stack

- **React** 18.3.1 - UI library
- **Vite** 6.1.7 - Build tool and dev server
- **@xyflow/react** 12.3.4 - Node-based graph editor
- **JavaScript (ES6+)** - Modern JavaScript features

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Local Installation

```bash
# 1. Clone or create project directory
mkdir industrialist-planner
cd industrialist-planner

# 2. Create all project files
# (Copy all files: package.json, index.html, vite.config.js, and src/ folder)

# 3. Install dependencies
npm install

# 4. Run development server
npm run dev
```

Visit `http://localhost:5173` to start using the planner!

## ✨ Current Features

- ✅ **Add Boxes** - Click "+ Add Box" to create new nodes with configurable inputs/outputs
- ✅ **Move Boxes** - Drag boxes anywhere on the canvas to arrange your layout
- ✅ **Connect Nodes** - Drag from right side (outputs) to left side (inputs) to represent connections
- ✅ **Delete Boxes** - Hold `Ctrl+Alt` and click to delete boxes
- ✅ **Animated Flow Lines** - Dashed lines animate toward the target to visualize flow direction
- ✅ **Configurable I/O** - Each box can have 0-10 input nodes (left, green) and output nodes (right, red)
- ✅ **Clear All** - Reset the canvas to start fresh
- ✅ **Dark Theme** - Professional dark mode with yellow/mustard accents

## 🎯 Planned Features

### Machine & Recipe System
- **Machine Boxes** - Boxes will represent machines executing specific recipes
- **Recipe Database** - Store and select from available recipes for each machine
- **Input/Output Products** - Left nodes (green) will represent input products, right nodes (red) will represent output products

### Production Computation Engine
- **Simple Demand Calculation** - Automatically compute the number of machines needed to satisfy a demand per second by dividing total demand by output capability
- **Complex Graph Solver** - For interconnected production chains, use linear programming and optimization algorithms to solve for optimal machine counts
- **Real-time Throughput Analysis** - Calculate and display throughput rates across the entire production network

### Enhanced Visualization
- **Bottleneck Detection** - Highlight machines that are limiting production

### Factory Management
- **Save/Load Layouts** - Persist production line designs
- **Export/Import** - Share factory layouts with other players
- **Production Templates** - Pre-built common production chains

## 📁 Project Structure

```
industrialist-planner/
├── package.json              # Dependencies and scripts
├── vite.config.js           # Vite configuration
├── index.html               # Entry HTML
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Main application
│   ├── index.css           # Global styles
│   └── components/
│       ├── CustomNode.jsx  # Box node component
│       └── CustomEdge.jsx  # Connection edge component
└── README.md
```

## 📦 Dependencies

- `react` v18.3.1 - UI library
- `react-dom` v18.3.1 - React DOM renderer
- `@xyflow/react` v12.3.4 - Node graph editor
- `vite` v6.1.7 - Build tool

## 📧 Scripts

```bash
npm run dev      # Start development server (localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

## 💡 Usage Guide

### Creating a Layout

1. Click **"+ Add Box"** to create a new box
2. Configure the number of input nodes (left, green) and output nodes (right, red)
3. Drag boxes to position them on your layout
4. Connect outputs to inputs by dragging from red nodes to green nodes
5. Use **Ctrl+Alt+Click** to delete boxes
6. Use **Clear All** to reset the entire canvas

### Understanding Connections

- **Left nodes (Green)** - Will represent input products (planned)
- **Right nodes (Red)** - Will represent output products (planned)
- **Animated lines** - Show flow direction from one box to another

## 🚀 Development Roadmap

The modular structure is ready for adding production planning features:

1. **Recipe System** - Database of recipes with input/output ratios
2. **Machine Assignment** - Assign recipes to boxes
3. **Demand Calculator** - Simple division-based machine count optimization
4. **Linear Programming Solver** - For complex production chains
5. **Throughput Metrics** - Real-time calculation and bottleneck analysis
6. **Save/Load System** - Persist factory layouts
7. **Production Templates** - Pre-built common production chains

## 📄 License

MIT

## 🎮 About the Game

**Industrialist** is a factory-building game on Roblox created by MamyTema. Inspired by games like Factorio and Mindustry, it challenges players to design and optimize production lines using a variety of machines and products. Players can choose from numerous products to manufacture and different machines to produce them, creating complex and efficient factory layouts.