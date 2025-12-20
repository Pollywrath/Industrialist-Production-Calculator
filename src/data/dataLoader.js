import defaultProductsData from './products.json';
import defaultMachinesData from './machines.json';
import defaultRecipesData from './recipes.json';

// Storage keys for localStorage persistence
const STORAGE_KEYS = { 
  PRODUCTS: 'industrialist_products', 
  MACHINES: 'industrialist_machines', 
  RECIPES: 'industrialist_recipes', 
  CANVAS_STATE: 'industrialist_canvas_state' 
};

/**
 * Load data from localStorage with fallback to defaults
 * @param {string} key - Storage key
 * @param {*} defaultData - Default data if storage is empty/corrupted
 * @returns {*} Stored or default data
 */
const loadFromStorage = (key, defaultData) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
  } catch (e) {
    console.error(`Error loading ${key}:`, e);
    return defaultData;
  }
};

/**
 * Save data to localStorage
 * @param {string} key - Storage key
 * @param {*} data - Data to persist
 */
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
};

// Initialize data from storage with default fallbacks
let products = loadFromStorage(STORAGE_KEYS.PRODUCTS, defaultProductsData);
let machines = loadFromStorage(STORAGE_KEYS.MACHINES, defaultMachinesData);
let recipes = loadFromStorage(STORAGE_KEYS.RECIPES, defaultRecipesData);

export { 
  products, 
  machines, 
  recipes 
};

// ============================================================
// GETTERS - Read-only access to data
// ============================================================

export const getProduct = (productId) => 
  products.find(p => p.id === productId);

export const getMachine = (machineId) => 
  machines.find(m => m.id === machineId);

export const getRecipe = (recipeId) => 
  recipes.find(r => r.id === recipeId);

export const getRecipesProducingProduct = (productId) => 
  recipes.filter(r => r.outputs.some(o => o.product_id === productId));

// ============================================================
// SETTERS - Update global arrays and persist to storage
// ============================================================

export const updateProducts = (newProducts) => { 
  products.length = 0; 
  products.push(...newProducts); 
  saveToStorage(STORAGE_KEYS.PRODUCTS, products); 
};

export const updateMachines = (newMachines) => { 
  machines.length = 0; 
  machines.push(...newMachines); 
  saveToStorage(STORAGE_KEYS.MACHINES, machines); 
};

export const updateRecipes = (newRecipes) => { 
  recipes.length = 0; 
  recipes.push(...newRecipes); 
  saveToStorage(STORAGE_KEYS.RECIPES, recipes); 
};

// ============================================================
// CANVAS STATE - Persist canvas layout and targets
// ============================================================

/**
 * Save canvas state: nodes, edges, target products, sold products, and counters
 */
export const saveCanvasState = (nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts = {}) => {
  saveToStorage(STORAGE_KEYS.CANVAS_STATE, { 
    nodes, 
    edges, 
    targetProducts, 
    nodeId, 
    targetIdCounter,
    soldProducts
  });
};

/**
 * Load previously saved canvas state
 * @returns {object|null} Canvas state or null if none exists
 */
export const loadCanvasState = () => 
  loadFromStorage(STORAGE_KEYS.CANVAS_STATE, null);

/**
 * Clear saved canvas state
 */
export const clearCanvasState = () => 
  localStorage.removeItem(STORAGE_KEYS.CANVAS_STATE);

// ============================================================
// RESTORE DEFAULTS - Reset all data
// ============================================================

/**
 * Reset all products, machines, recipes, and canvas to defaults
 * Used for "Restore Defaults" button
 */
export const restoreDefaults = () => {
  updateProducts(defaultProductsData);
  updateMachines(defaultMachinesData);
  updateRecipes(defaultRecipesData);
  clearCanvasState();
};