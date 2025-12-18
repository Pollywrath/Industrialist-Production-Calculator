import defaultProductsData from './products.json';
import defaultMachinesData from './machines.json';
import defaultRecipesData from './recipes.json';

// Storage keys
const STORAGE_KEYS = {
  PRODUCTS: 'industrialist_products',
  MACHINES: 'industrialist_machines',
  RECIPES: 'industrialist_recipes',
  CANVAS_STATE: 'industrialist_canvas_state',
};

// Load data from localStorage or use defaults
const loadFromStorage = (key, defaultData) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
  } catch (e) {
    console.error(`Error loading ${key}:`, e);
    return defaultData;
  }
};

// Save data to localStorage
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
};

// Initialize data
let products = loadFromStorage(STORAGE_KEYS.PRODUCTS, defaultProductsData);
let machines = loadFromStorage(STORAGE_KEYS.MACHINES, defaultMachinesData);
let recipes = loadFromStorage(STORAGE_KEYS.RECIPES, defaultRecipesData);

// Export current data
export { products, machines, recipes };

// Helper function to get product by id
export const getProduct = (productId) => products.find(p => p.id === productId);

// Helper function to get machine by id
export const getMachine = (machineId) => machines.find(m => m.id === machineId);

// Helper function to get recipe by id
export const getRecipe = (recipeId) => recipes.find(r => r.id === recipeId);

// Helper function to get all recipes that produce a specific product
export const getRecipesProducingProduct = (productId) => {
  return recipes.filter(recipe => 
    recipe.outputs.some(output => output.product_id === productId)
  );
};

// Update products and save to localStorage
export const updateProducts = (newProducts) => {
  products.length = 0;
  products.push(...newProducts);
  saveToStorage(STORAGE_KEYS.PRODUCTS, products);
};

// Update machines and save to localStorage
export const updateMachines = (newMachines) => {
  machines.length = 0;
  machines.push(...newMachines);
  saveToStorage(STORAGE_KEYS.MACHINES, machines);
};

// Update recipes and save to localStorage
export const updateRecipes = (newRecipes) => {
  recipes.length = 0;
  recipes.push(...newRecipes);
  saveToStorage(STORAGE_KEYS.RECIPES, recipes);
};

// Save canvas state
export const saveCanvasState = (nodes, edges, targetProducts, nodeId, targetIdCounter) => {
  const state = {
    nodes,
    edges,
    targetProducts,
    nodeId,
    targetIdCounter,
  };
  saveToStorage(STORAGE_KEYS.CANVAS_STATE, state);
};

// Load canvas state
export const loadCanvasState = () => {
  return loadFromStorage(STORAGE_KEYS.CANVAS_STATE, null);
};

// Clear canvas state
export const clearCanvasState = () => {
  localStorage.removeItem(STORAGE_KEYS.CANVAS_STATE);
};

// Restore to defaults
export const restoreDefaults = () => {
  updateProducts(defaultProductsData);
  updateMachines(defaultMachinesData);
  updateRecipes(defaultRecipesData);
  clearCanvasState();
};