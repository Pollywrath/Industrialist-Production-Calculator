export interface TipCategory {
  id: string;
  title: string;
  summary: string;
  icon: string;
  tips: string[];
}

export const CATEGORIZED_TIPS: TipCategory[] = [
  {
    id: 'tips-shortcuts',
    title: 'Canvas & Shortcuts',
    summary: 'Keyboard shortcuts and canvas navigation tips.',
    icon: 'MousePointerSquareDashed',
    tips: [
      'Hold Alt to temporarily switch to Delete mode for quick node and edge removal.',
      'Hold Ctrl or Cmd to temporarily enter Multi-select mode, allowing you to select and move multiple nodes at once.',
      'Hold Shift to temporarily activate Target mode for quickly marking nodes for optimization.',
      'Double-click straight or bezier edges while selected to add editable control points for custom routing paths.',
      'Dragging a node while multiple recipe nodes are selected moves the entire selected batch together.',
      'Large graphs automatically swap detailed nodes to flat colored CAD boxes when zoomed out to bypass expensive DOM rendering.',
      'Group nodes together using Multi-select and clicking Add Group to simplify your canvas and utilize compact proxy handles.',
      'Single-click any input or output row to open the Recipe Selector pre-filtered to that specific product on the selected side.'
    ]
  },
  {
    id: 'tips-solver',
    title: 'Flow Solver & Optimization',
    summary: 'Mastering the linear programming ratio optimizer.',
    icon: 'Zap',
    tips: [
      'Set target nodes using the Target tool or Shift-click to anchor the linear programming optimization.',
      'Sinks (variable inputs/outputs) represent maximum capacity limits; they are resolved dynamically up to that limit based on connected flow.',
      'Double-click a connected input or output handle to automatically balance that node\'s machine count to the active network flow.',
      'Unconnected input ports are ignored by the optimizer to prevent shutting down downstream nodes during partial builds.',
      'The LP Solver evaluates the entire recipe network in the background and proposes optimal machine counts for all nodes.',
      'Waste products (like excess fluid or byproducts) can be routed to waste dumps or burners to prevent the system from backing up.',
      'The systemic balancer\'s rate solver uses a synchronous numerical Golden-Section search running exactly 40 iterations for absolute precision.',
      'The solver does not propagate materials or temperatures through effectively zero-flow edges.',
      'The solver pipeline runs iterative loops to resolve flow-dependent special recipe rates until stable convergence is reached.'
    ]
  },
  {
    id: 'tips-recipes',
    title: 'Node Settings & Recipes',
    summary: 'Customizing settings, machine scaling, and special recipes.',
    icon: 'Settings',
    tips: [
      'Open the Node Editor settings to adjust temperature, water inputs, or coolant settings for boilers and heat exchangers.',
      'Reset Handles in the Node Editor restores the recipe handle order back to its default layout.',
      'Apply to Chain in the Node Editor automatically scales all connected upstream and downstream nodes based on the machine count ratio.',
      'Sinks (variable handles) display \'(Sets max sink capacity, not current flow)\' in the Node Editor to indicate capacity semantics.',
      'The Node Editor Settings tab appears only for recipes backed by a special recipe definition.',
      'Special recipe files like heat exchanger and vertical heat exchanger are fully self-contained to allow independent modification.'
    ]
  },
  {
    id: 'tips-saves',
    title: 'Save Manager & Dashboards',
    summary: 'Managing layouts, difficulty levels, and performance.',
    icon: 'Save',
    tips: [
      'Use the Save Manager to save, load, merge, and export your production layouts to shareable JSON files.',
      'Export your canvas layout to a high-quality PNG image using the Save Manager for offline planning and documentation.',
      'Switch between per-second, per-minute, per-hour, or raw cycle quantities using the Rate mode control in the bottom tray.',
      'Research new technologies in the Machines Overlay to unlock advanced production tiers and recipe variations.',
      'Check the Diagnostics panel in More Stats to quickly find and center any nodes with shortages or excess byproducts.',
      'The save file acts as a pure, unopinionated data carrier, deferring clamping and settings validation to runtime solver evaluation.',
      'The autosave system commits your layout to local storage every 5 seconds as a fail-safe backup.'
    ]
  }
];

export const ALL_TIPS: string[] = CATEGORIZED_TIPS.flatMap((cat) => cat.tips);
