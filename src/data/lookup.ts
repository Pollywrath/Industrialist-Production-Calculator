import type { Recipe, Machine, Product, Research } from '../types/data';
import { getAllSpecialRecipes, getSpecialRecipe } from './registry';
import { getDataOverrides } from '../persistence/idb';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { clearFlowCache } from '../solver/flowSolver';

let recipes: Recipe[] = [];
let machines: Machine[] = [];
let products: Product[] = [];
let researches: Research[] = [];

const overriddenProducts = new Set<string>();
const overriddenMachines = new Set<string>();
const overriddenResearches = new Set<string>();

let defaultRecipes: Recipe[] = [];
let defaultMachines: Machine[] = [];
let defaultProducts: Product[] = [];
let defaultResearches: Research[] = [];

const recipeMap = new Map<string, Recipe>();
const machineMap = new Map<string, Machine>();
const productMap = new Map<string, Product>();
const researchMap = new Map<string, Research>();

let initPromise: Promise<void> | null = null;

function processCategory<T extends { id: string }>(
  prefix: string,
  defaults: T[],
  overrides: { id: string; data: Record<string, unknown> }[]
): T[] {
  const activeMap = new Map<string, T>(defaults.map((item) => [item.id, item]));

  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith(prefix)) {
      const entityId = override.id.substring(prefix.length);
      const data = override.data;
      if (data._tombstone) {
        activeMap.delete(entityId);
      } else {
        const existing = activeMap.get(entityId);
        activeMap.set(entityId, {
          ...(existing || {}),
          ...data,
        } as T);
      }
    }
  }

  return Array.from(activeMap.values());
}

export function rebuildActiveDatabase(
  overrides: { id: string; data: Record<string, unknown> }[]
): void {
  // Clear solver flow cache as active database attributes have changed
  clearFlowCache();

  // Clear maps
  recipeMap.clear();
  machineMap.clear();
  productMap.clear();
  researchMap.clear();

  // Process categories in O(N + M) linear time
  products = processCategory('product:', defaultProducts, overrides);
  machines = processCategory('machine:', defaultMachines, overrides);
  recipes = processCategory('recipe:', defaultRecipes, overrides);
  researches = processCategory('research:', defaultResearches, overrides);

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

  // Precompute overrides
  overriddenProducts.clear();
  overriddenMachines.clear();
  overriddenResearches.clear();

  const defaultProductMap = new Map(defaultProducts.map((p) => [p.id, p]));
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const baseline = defaultProductMap.get(p.id);
    if (baseline && JSON.stringify(baseline) !== JSON.stringify(p)) {
      overriddenProducts.add(p.id);
    }
  }

  const defaultMachineMap = new Map(defaultMachines.map((m) => [m.id, m]));
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    const baseline = defaultMachineMap.get(m.id);
    if (baseline && JSON.stringify(baseline) !== JSON.stringify(m)) {
      overriddenMachines.add(m.id);
    }
  }

  const defaultResearchMap = new Map(defaultResearches.map((r) => [r.id, r]));
  for (let i = 0; i < researches.length; i++) {
    const r = researches[i];
    const baseline = defaultResearchMap.get(r.id);
    if (baseline && JSON.stringify(baseline) !== JSON.stringify(r)) {
      overriddenResearches.add(r.id);
    }
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

export function resolveActiveRecipe(
  recipeId: string,
  nodeSettings?: Record<string, unknown>
): Recipe | undefined {
  const recipe = recipeMap.get(recipeId);
  if (!recipe) return undefined;

  const sr = getSpecialRecipe(recipeId);
  if (sr && nodeSettings) {
    const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
      string,
      unknown
    >;
    return sr.compute(nodeSettings, globalSettings);
  }

  return recipe;
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

export function isBaselineResearch(id: string): boolean {
  return defaultResearches.some((r) => r.id === id);
}

export function hasProductOverride(id: string): boolean {
  return overriddenProducts.has(id);
}

export function hasMachineOverride(id: string): boolean {
  return overriddenMachines.has(id);
}

export function hasResearchOverride(id: string): boolean {
  return overriddenResearches.has(id);
}
