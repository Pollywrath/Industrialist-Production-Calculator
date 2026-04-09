import defaultProductsData from './products.json';
import defaultMachinesData from './machines.json';
import defaultRecipesData from './recipes.json';

const STORAGE_KEYS = { 
  CANVAS_STATE: 'industrialist_canvas_state' 
};

const loadFromStorage = (key, defaultData) => {
  try {
    if (typeof localStorage === 'undefined') return defaultData;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
  } catch (e) {
    console.error(`Error loading ${key}:`, e);
    return defaultData;
  }
};

const saveToStorage = (key, data) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
};

let products = defaultProductsData;
let machines = defaultMachinesData;
let recipes = defaultRecipesData;

export { products, machines, recipes };

export const updateProducts = (newProducts) => { products = newProducts; };
export const updateMachines = (newMachines) => { machines = newMachines; };
export const updateRecipes = (newRecipes) => { recipes = newRecipes; };

export const getProduct = (productId) => products.find(p => p.id === productId);
export const getMachine = (machineId) => machines.find(m => m.id === machineId);
export const getRecipe = (recipeId) => recipes.find(r => r.id === recipeId);
export const getRecipesProducingProduct = (productId) => 
  recipes.filter(r => r.outputs.some(o => o.product_id === productId));

export const getDisposalRecipes = () => 
  recipes.filter(r => ['r_underground_waste_facility', 'r_liquid_dump', 'r_liquid_burner'].includes(r.id));

export const saveCanvasState = (nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts = {}) => {
  saveToStorage(STORAGE_KEYS.CANVAS_STATE, { 
    nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts 
  });
};

export const loadCanvasState = () => loadFromStorage(STORAGE_KEYS.CANVAS_STATE, null);
export const clearCanvasState = () => {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEYS.CANVAS_STATE);
};

export const restoreDefaults = () => {
  clearCanvasState();
};