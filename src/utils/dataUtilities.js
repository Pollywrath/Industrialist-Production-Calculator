// Utility functions for managing custom data in localStorage

const CUSTOM_PRODUCTS_KEY = 'industrialist_custom_products';
const CUSTOM_MACHINES_KEY = 'industrialist_custom_machines';
const CUSTOM_RECIPES_KEY = 'industrialist_custom_recipes';

// Initialize custom data from defaults if not present
export const initializeCustomData = (defaultProducts, defaultMachines, defaultRecipes) => {
  if (!localStorage.getItem(CUSTOM_PRODUCTS_KEY)) {
    localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(defaultProducts));
  }
  if (!localStorage.getItem(CUSTOM_MACHINES_KEY)) {
    localStorage.setItem(CUSTOM_MACHINES_KEY, JSON.stringify(defaultMachines));
  }
  if (!localStorage.getItem(CUSTOM_RECIPES_KEY)) {
    localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(defaultRecipes));
  }
};

// Get custom data
export const getCustomProducts = () => {
  try {
    const data = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading custom products:', error);
    return [];
  }
};

export const getCustomMachines = () => {
  try {
    const data = localStorage.getItem(CUSTOM_MACHINES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading custom machines:', error);
    return [];
  }
};

export const getCustomRecipes = () => {
  try {
    const data = localStorage.getItem(CUSTOM_RECIPES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading custom recipes:', error);
    return [];
  }
};

// Save custom data
export const saveCustomProducts = (products) => {
  try {
    localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(products));
    return true;
  } catch (error) {
    console.error('Error saving custom products:', error);
    return false;
  }
};

export const saveCustomMachines = (machines) => {
  try {
    localStorage.setItem(CUSTOM_MACHINES_KEY, JSON.stringify(machines));
    return true;
  } catch (error) {
    console.error('Error saving custom machines:', error);
    return false;
  }
};

export const saveCustomRecipes = (recipes) => {
  try {
    localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(recipes));
    return true;
  } catch (error) {
    console.error('Error saving custom recipes:', error);
    return false;
  }
};

// Update single item
export const updateProduct = (productId, updates) => {
  const products = getCustomProducts();
  const index = products.findIndex(p => p.id === productId);
  if (index >= 0) {
    products[index] = { ...products[index], ...updates };
    return saveCustomProducts(products);
  }
  return false;
};

export const updateMachine = (machineId, updates) => {
  const machines = getCustomMachines();
  const index = machines.findIndex(m => m.id === machineId);
  if (index >= 0) {
    machines[index] = { ...machines[index], ...updates };
    return saveCustomMachines(machines);
  }
  return false;
};

export const updateRecipe = (recipeId, updates) => {
  const recipes = getCustomRecipes();
  const index = recipes.findIndex(r => r.id === recipeId);
  if (index >= 0) {
    recipes[index] = { ...recipes[index], ...updates };
    return saveCustomRecipes(recipes);
  }
  return false;
};

// Restore defaults
export const restoreDefaultProducts = (defaultProducts) => {
  return saveCustomProducts(defaultProducts);
};

export const restoreDefaultMachines = (defaultMachines) => {
  return saveCustomMachines(defaultMachines);
};

export const restoreDefaultRecipes = (defaultRecipes) => {
  return saveCustomRecipes(defaultRecipes);
};

// Export data
export const exportData = (includeProducts, includeMachines, includeRecipes) => {
  const data = {};
  if (includeProducts) data.products = getCustomProducts();
  if (includeMachines) data.machines = getCustomMachines();
  if (includeRecipes) data.recipes = getCustomRecipes();
  return data;
};

// Import data (with deduplication)
export const importData = (importedData) => {
  const results = { products: 0, machines: 0, recipes: 0, errors: [] };

  try {
    if (importedData.products) {
      const currentProducts = getCustomProducts();
      const productMap = new Map(currentProducts.map(p => [p.id, p]));
      
      importedData.products.forEach(newProduct => {
        productMap.set(newProduct.id, newProduct);
      });
      
      const updatedProducts = Array.from(productMap.values());
      if (saveCustomProducts(updatedProducts)) {
        results.products = importedData.products.length;
      }
    }

    if (importedData.machines) {
      const currentMachines = getCustomMachines();
      const machineMap = new Map(currentMachines.map(m => [m.id, m]));
      
      importedData.machines.forEach(newMachine => {
        machineMap.set(newMachine.id, newMachine);
      });
      
      const updatedMachines = Array.from(machineMap.values());
      if (saveCustomMachines(updatedMachines)) {
        results.machines = importedData.machines.length;
      }
    }

    if (importedData.recipes) {
      const currentRecipes = getCustomRecipes();
      const recipeMap = new Map(currentRecipes.map(r => [r.id, r]));
      
      importedData.recipes.forEach(newRecipe => {
        recipeMap.set(newRecipe.id, newRecipe);
      });
      
      const updatedRecipes = Array.from(recipeMap.values());
      if (saveCustomRecipes(updatedRecipes)) {
        results.recipes = importedData.recipes.length;
      }
    }
  } catch (error) {
    results.errors.push(error.message);
  }

  return results;
};