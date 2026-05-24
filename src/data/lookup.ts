import type { Recipe, Machine, Product, Research } from '../types/data';
import { getAllSpecialRecipes, getSpecialRecipe } from './registry';
import { getDataOverrides } from '../persistence/idb';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { clearFlowCache } from '../solver/flowSolver';
import { buildEdgeLookupMap } from '../utils/productResolver';

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
let filteredProducts: Product[] = [];

function processCategory<T extends { id: string }>(
  prefix: string,
  defaults: T[],
  overrides: { id: string; data: Record<string, unknown> }[],
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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!deepEqual(objA[key], objB[key])) return false;
  }
  return true;
}

export function rebuildActiveDatabase(
  overrides: { id: string; data: Record<string, unknown> }[],
): void {
  clearFlowCache();

  recipeMap.clear();
  machineMap.clear();
  productMap.clear();
  researchMap.clear();

  products = processCategory('product:', defaultProducts, overrides);
  machines = processCategory('machine:', defaultMachines, overrides);
  recipes = processCategory('recipe:', defaultRecipes, overrides);
  researches = processCategory('research:', defaultResearches, overrides);

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

  overriddenProducts.clear();
  overriddenMachines.clear();
  overriddenResearches.clear();

  const defaultProductMap = new Map(defaultProducts.map((p) => [p.id, p]));
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const baseline = defaultProductMap.get(p.id);
    if (baseline && !deepEqual(baseline, p)) {
      overriddenProducts.add(p.id);
    }
  }

  const defaultMachineMap = new Map(defaultMachines.map((m) => [m.id, m]));
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    const baseline = defaultMachineMap.get(m.id);
    if (baseline && !deepEqual(baseline, m)) {
      overriddenMachines.add(m.id);
    }
  }

  const defaultResearchMap = new Map(defaultResearches.map((r) => [r.id, r]));
  for (let i = 0; i < researches.length; i++) {
    const r = researches[i];
    const baseline = defaultResearchMap.get(r.id);
    if (baseline && !deepEqual(baseline, r)) {
      overriddenResearches.add(r.id);
    }
  }

  filteredProducts = products.filter((p) => p.id !== 'any_fluid' && p.id !== 'any_item');
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
    defaultProducts = [
      ...(productsJson.default as Product[]),
      {
        id: 'any_fluid',
        name: 'Any Fluid',
        sell_price: 0,
        rp_multiplier: 0,
        type: 'Fluid',
      },
      {
        id: 'any_item',
        name: 'Any Item',
        sell_price: 0,
        rp_multiplier: 0,
        type: 'Item',
      },
    ];
    defaultResearches = researchesJson.default as Research[];

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

    const overrides = await getDataOverrides();

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
  nodeSettings?: Record<string, unknown>,
  nodeId?: string,
  helpers?: {
    resolveProduct: (side: 'input' | 'output', index: number) => string;
    hasConnection: (side: 'input' | 'output', index: number) => boolean;
  },
): Recipe | undefined {
  const recipe = recipeMap.get(recipeId);
  if (!recipe) return undefined;

  const sr = getSpecialRecipe(recipeId);
  if (sr) {
    const defaultSettings = Object.entries(sr.settings).reduce(
      (acc, [key, def]) => {
        acc[key] = def.default;
        return acc;
      },
      {} as Record<string, unknown>,
    );
    nodeSettings = {
      ...defaultSettings,
      ...(nodeSettings || {}),
    };
    const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
      string,
      unknown
    >;
    const activeHelpers = helpers ?? {
      resolveProduct: (side: 'input' | 'output', index: number) => {
        if (!nodeId) return '';
        const handleId = `${nodeId}-${side}-${index}`;
        return useFlowStore.getState().resolvedProducts[handleId] ?? '';
      },
      hasConnection: (side: 'input' | 'output', index: number) => {
        if (!nodeId) return false;
        const handleId = `${nodeId}-${side}-${index}`;
        const edges = useFlowStore.getState().edges;
        const edgeLookup = buildEdgeLookupMap(edges);
        return (edgeLookup.get(handleId)?.length ?? 0) > 0;
      },
    };

    let resolvedSettings = nodeSettings;
    if (!helpers && nodeId && sr.inputTemperatureSettings) {
      let hasOverrides = false;
      const overrides: Record<string, unknown> = {};
      const inputTempsMap = useFlowResultStore.getState().inputTemps[nodeId];

      for (const [inpIdxStr, settingKey] of Object.entries(sr.inputTemperatureSettings)) {
        const inpIdx = Number(inpIdxStr);
        if (
          activeHelpers.hasConnection('input', inpIdx) &&
          inputTempsMap &&
          inputTempsMap[inpIdx] !== undefined
        ) {
          overrides[settingKey] = inputTempsMap[inpIdx];
          hasOverrides = true;
        }
      }

      if (hasOverrides) {
        resolvedSettings = {
          ...nodeSettings,
          ...overrides,
        };
      }
    }

    return sr.compute(resolvedSettings, globalSettings, nodeId, activeHelpers);
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
  return filteredProducts;
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
