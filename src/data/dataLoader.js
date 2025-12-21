import defaultProductsData from './products.json';
import defaultMachinesData from './machines.json';
import defaultRecipesData from './recipes.json';

const STORAGE_KEYS = { 
  PRODUCTS: 'industrialist_products', 
  MACHINES: 'industrialist_machines', 
  RECIPES: 'industrialist_recipes', 
  CANVAS_STATE: 'industrialist_canvas_state' 
};

const loadFromStorage = (key, defaultData) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
  } catch (e) {
    console.error(`Error loading ${key}:`, e);
    return defaultData;
  }
};

const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
};

let products = loadFromStorage(STORAGE_KEYS.PRODUCTS, defaultProductsData);
let machines = loadFromStorage(STORAGE_KEYS.MACHINES, defaultMachinesData);
let recipes = loadFromStorage(STORAGE_KEYS.RECIPES, defaultRecipesData);

export { products, machines, recipes };

export const getProduct = (productId) => products.find(p => p.id === productId);
export const getMachine = (machineId) => machines.find(m => m.id === machineId);
export const getRecipe = (recipeId) => recipes.find(r => r.id === recipeId);
export const getRecipesProducingProduct = (productId) => 
  recipes.filter(r => r.outputs.some(o => o.product_id === productId));

const updateArray = (arr, newData, key) => {
  arr.length = 0;
  arr.push(...newData);
  saveToStorage(key, arr);
};

export const updateProducts = (newProducts) => updateArray(products, newProducts, STORAGE_KEYS.PRODUCTS);
export const updateMachines = (newMachines) => updateArray(machines, newMachines, STORAGE_KEYS.MACHINES);
export const updateRecipes = (newRecipes) => updateArray(recipes, newRecipes, STORAGE_KEYS.RECIPES);

export const saveCanvasState = (nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts = {}) => {
  saveToStorage(STORAGE_KEYS.CANVAS_STATE, { 
    nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts 
  });
};

export const loadCanvasState = () => loadFromStorage(STORAGE_KEYS.CANVAS_STATE, null);
export const clearCanvasState = () => localStorage.removeItem(STORAGE_KEYS.CANVAS_STATE);

export const restoreDefaults = () => {
  updateProducts(defaultProductsData);
  updateMachines(defaultMachinesData);
  updateRecipes(defaultRecipesData);
  clearCanvasState();
};