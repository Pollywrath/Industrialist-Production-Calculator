import type { Recipe, Machine, Product, Research } from '../types/data';
import { getAllSpecialRecipes } from './registry';
import { getDataOverrides } from '../persistence/idb';

let recipes: Recipe[] = [];
let machines: Machine[] = [];
let products: Product[] = [];
let researches: Research[] = [];

let defaultRecipes: Recipe[] = [];
let defaultMachines: Machine[] = [];
let defaultProducts: Product[] = [];
let defaultResearches: Research[] = [];

const recipeMap = new Map<string, Recipe>();
const machineMap = new Map<string, Machine>();
const productMap = new Map<string, Product>();
const researchMap = new Map<string, Research>();

let initPromise: Promise<void> | null = null;

export function rebuildActiveDatabase(
  overrides: { id: string; data: Record<string, unknown> }[]
): void {
  // Clear maps
  recipeMap.clear();
  machineMap.clear();
  productMap.clear();
  researchMap.clear();

  // 1. Process products
  let activeProducts = [...defaultProducts];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith('product:')) {
      const entityId = override.id.substring('product:'.length);
      const data = override.data;
      if (data._tombstone) {
        activeProducts = activeProducts.filter((p) => p.id !== entityId);
      } else {
        const existingIdx = activeProducts.findIndex((p) => p.id === entityId);
        if (existingIdx !== -1) {
          activeProducts[existingIdx] = {
            ...activeProducts[existingIdx],
            ...data,
          } as unknown as Product;
        } else {
          activeProducts.push(data as unknown as Product);
        }
      }
    }
  }
  products = activeProducts;

  // 2. Process machines
  let activeMachines = [...defaultMachines];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith('machine:')) {
      const entityId = override.id.substring('machine:'.length);
      const data = override.data;
      if (data._tombstone) {
        activeMachines = activeMachines.filter((m) => m.id !== entityId);
      } else {
        const existingIdx = activeMachines.findIndex((m) => m.id === entityId);
        if (existingIdx !== -1) {
          activeMachines[existingIdx] = {
            ...activeMachines[existingIdx],
            ...data,
          } as unknown as Machine;
        } else {
          activeMachines.push(data as unknown as Machine);
        }
      }
    }
  }
  machines = activeMachines;

  // 3. Process recipes
  let activeRecipes = [...defaultRecipes];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith('recipe:')) {
      const entityId = override.id.substring('recipe:'.length);
      const data = override.data;
      if (data._tombstone) {
        activeRecipes = activeRecipes.filter((r) => r.id !== entityId);
      } else {
        const existingIdx = activeRecipes.findIndex((r) => r.id === entityId);
        if (existingIdx !== -1) {
          activeRecipes[existingIdx] = {
            ...activeRecipes[existingIdx],
            ...data,
          } as unknown as Recipe;
        } else {
          activeRecipes.push(data as unknown as Recipe);
        }
      }
    }
  }
  recipes = activeRecipes;

  // 4. Process researches
  let activeResearches = [...defaultResearches];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith('research:')) {
      const entityId = override.id.substring('research:'.length);
      const data = override.data;
      if (data._tombstone) {
        activeResearches = activeResearches.filter((r) => r.id !== entityId);
      } else {
        const existingIdx = activeResearches.findIndex((r) => r.id === entityId);
        if (existingIdx !== -1) {
          activeResearches[existingIdx] = {
            ...activeResearches[existingIdx],
            ...data,
          } as unknown as Research;
        } else {
          activeResearches.push(data as unknown as Research);
        }
      }
    }
  }
  researches = activeResearches;

  // Re-build maps
  for (let i = 0; i < recipes.length; i++) {
    recipeMap.set(recipes[i].id, recipes[i]);
  }
  for (let i = 0; i < machines.length; i++) {
    machineMap.set(machines[i].id, machines[i]);
  }
  for (let i = 0; i < products.length; i++) {
    productMap.set(products[i].id, products[i]);
  }
  for (let i = 0; i < researches.length; i++) {
    researchMap.set(researches[i].id, researches[i]);
  }
}

export async function reloadDatabase(): Promise<void> {
  const overrides = await getDataOverrides();
  rebuildActiveDatabase(overrides);
}

export function initializeDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [recipesJson, machinesJson, productsJson, researchesJson] = await Promise.all([
      import('../data/recipes.json'),
      import('../data/machines.json'),
      import('../data/products.json'),
      import('../data/researches.json'),
    ]);

    defaultRecipes = recipesJson.default as Recipe[];
    defaultMachines = machinesJson.default as Machine[];
    defaultProducts = productsJson.default as Product[];
    defaultResearches = researchesJson.default as Research[];

    // Integrate Special Recipes into defaults
    const specialRecipes = getAllSpecialRecipes().map((sr) => {
      const defaults = Object.entries(sr.settings).reduce(
        (acc, [key, def]) => {
          acc[key] = def.default;
          return acc;
        },
        {} as Record<string, unknown>,
      );

      return sr.compute(defaults);
    });

    defaultRecipes = [...defaultRecipes, ...specialRecipes];

    // Load overrides from IndexedDB
    const overrides = await getDataOverrides();

    // Compile active database structures
    rebuildActiveDatabase(overrides);

    if (import.meta.env.DEV) {
      const { validateFullDatabase, getDatabaseChecksums } =
        await import('../utils/dataValidation');
      const checksums = getDatabaseChecksums(products, machines, recipes, researches);
      const validation = validateFullDatabase(products, machines, recipes, researches);
      if (!validation.valid) {
        console.error(
          `[Data Validator] Active database contains structural or format schema violations! [Combined Checksum: ${checksums.combined}]`,
          validation,
        );
      } else {
        console.log(
          `%c[Data Validator] Static JSON database validated successfully [Combined Checksum: ${checksums.combined}]`,
          'color: #00bb66; font-weight: bold;',
        );
        console.log(
          `%cDatabase Checksums:\n- Products:   ${checksums.products}\n- Machines:   ${checksums.machines}\n- Recipes:    ${checksums.recipes}\n- Researches: ${checksums.researches}`,
          'color: #9e9e9e; font-family: monospace; font-size: 11px;',
        );
      }
    }
  })();

  return initPromise;
}

export function getRecipe(id: string): Recipe | undefined {
  return recipeMap.get(id);
}

export function getMachine(id: string): Machine | undefined {
  return machineMap.get(id);
}

export function getProduct(id: string): Product | undefined {
  return productMap.get(id);
}

export function getResearch(id: string): Research | undefined {
  return researchMap.get(id);
}

export function getProductName(id: string): string {
  return productMap.get(id)?.name ?? id;
}

export function getMachineName(machineId: string): string {
  return machineMap.get(machineId)?.name ?? machineId;
}

export function getAllRecipes(): Recipe[] {
  return recipes;
}

export function getAllProducts(): Product[] {
  return products;
}

export function getAllMachines(): Machine[] {
  return machines;
}

export function getAllResearches(): Research[] {
  return researches;
}

export function getDefaultProducts(): Product[] {
  return defaultProducts;
}

export function getDefaultMachines(): Machine[] {
  return defaultMachines;
}

export function isBaselineProduct(id: string): boolean {
  return defaultProducts.some((p) => p.id === id);
}

export function isBaselineMachine(id: string): boolean {
  return defaultMachines.some((m) => m.id === id);
}

export function hasProductOverride(id: string): boolean {
  const baseline = defaultProducts.find((p) => p.id === id);
  const active = productMap.get(id);
  if (!baseline || !active) return false;
  return JSON.stringify(baseline) !== JSON.stringify(active);
}

export function hasMachineOverride(id: string): boolean {
  const baseline = defaultMachines.find((m) => m.id === id);
  const active = machineMap.get(id);
  if (!baseline || !active) return false;
  return JSON.stringify(baseline) !== JSON.stringify(active);
}
