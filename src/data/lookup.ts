import type { Recipe, Machine, Product, ProductType, Research } from '../types/data';
import type { SettingDefinition, SpecialRecipe } from '../types/specialRecipes';
import { getAllSpecialRecipes, getSpecialRecipe, setSpecialRecipeOverrides } from './registry';
import { getDataOverrides } from '../persistence/idb';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { clearFlowCache } from '../solver/flowSolver';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { buildVirtualModularMachines } from '../utils/modularMachineFactory';
import { buildHandleId } from '../utils/idGenerator';
import { isRecipeNode } from '../types/nodes';

let recipes: Recipe[] = [];
let machines: Machine[] = [];
let products: Product[] = [];
let researches: Research[] = [];

const overriddenProducts = new Set<string>();
const overriddenMachines = new Set<string>();
const overriddenResearches = new Set<string>();
const overriddenRecipes = new Set<string>();

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
const PLACEHOLDER_PRODUCT_IDS = new Set(['any_fluid', 'any_item']);

function getSpecialPotentialProducts(
  sr: SpecialRecipe,
  kind: 'input' | 'output',
  sourceProducts: Product[],
): string[] | undefined {
  const explicitProductIds = kind === 'input' ? sr.potentialInputs : sr.potentialOutputs;
  const productTypes =
    kind === 'input' ? sr.potentialInputProductTypes : sr.potentialOutputProductTypes;

  if (!productTypes || productTypes.length === 0) {
    return explicitProductIds;
  }

  const allowedTypes = new Set<ProductType>(productTypes);
  const typeProductIds = sourceProducts
    .filter((product) => allowedTypes.has(product.type) && !PLACEHOLDER_PRODUCT_IDS.has(product.id))
    .map((product) => product.id);

  if (!explicitProductIds || explicitProductIds.length === 0) {
    return typeProductIds;
  }

  return Array.from(new Set([...explicitProductIds, ...typeProductIds]));
}

function processCategory<T extends { id: string }>(
  prefix: string,
  defaults: T[],
  overrides: { id: string; data: Record<string, unknown> }[],
  shouldApplyOverride?: (entityId: string, data: Record<string, unknown>) => boolean,
): T[] {
  const activeMap = new Map<string, T>(defaults.map((item) => [item.id, item]));

  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (override.id.startsWith(prefix)) {
      const entityId = override.id.substring(prefix.length);
      const data = override.data;
      if (shouldApplyOverride && !shouldApplyOverride(entityId, data)) {
        continue;
      }
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

function normalizeSettings(
  settings: Record<string, unknown>,
  schema: Record<string, SettingDefinition>,
  productMap: Map<string, Product>,
  globalSettings?: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...settings };
  let hasChanges = false;

  for (const [key, def] of Object.entries(schema)) {
    const value = settings[key];
    const defaultValue = def.default;

    if (value === null || value === undefined) {
      if (value !== defaultValue) {
        normalized[key] = defaultValue;
        hasChanges = true;
        if (import.meta.env.DEV) {
          console.warn(
            `[Setting Normalization] Setting "${key}" is null/undefined, using default: ${JSON.stringify(defaultValue)}`,
          );
        }
      }
      continue;
    }

    if (def.type === 'number') {
      const numValue = typeof value === 'string' ? parseFloat(value) : (value as number);
      if (!Number.isFinite(numValue)) {
        normalized[key] = defaultValue;
        hasChanges = true;
        if (import.meta.env.DEV) {
          console.warn(
            `[Setting Normalization] Setting "${key}" has invalid number value: ${JSON.stringify(value)}, using default: ${defaultValue}`,
          );
        }
      } else {
        let clampedValue = numValue;
        if (def.min !== undefined && clampedValue < def.min) {
          clampedValue = def.min;
          hasChanges = true;
          if (import.meta.env.DEV) {
            console.warn(
              `[Setting Normalization] Setting "${key}" value ${numValue} below min ${def.min}, clamped to ${def.min}`,
            );
          }
        }
        if (def.max !== undefined && clampedValue > def.max) {
          clampedValue = def.max;
          hasChanges = true;
          if (import.meta.env.DEV) {
            console.warn(
              `[Setting Normalization] Setting "${key}" value ${numValue} above max ${def.max}, clamped to ${def.max}`,
            );
          }
        }
        if (clampedValue !== value) {
          normalized[key] = clampedValue;
        }
      }
    } else if (def.type === 'select') {
      const options = def.getOptions?.(normalized, globalSettings) ?? def.options;
      const normalizedDefault = options.some((opt) => opt.value === defaultValue)
        ? defaultValue
        : (options[0]?.value ?? defaultValue);
      const isValidOption = options.some((opt) => {
        if (typeof opt.value === 'number' && typeof value === 'string') {
          return parseFloat(value) === opt.value;
        }
        return opt.value === value;
      });

      if (!isValidOption) {
        normalized[key] = normalizedDefault;
        hasChanges = true;
        if (import.meta.env.DEV) {
          console.warn(
            `[Setting Normalization] Setting "${key}" has invalid value: ${JSON.stringify(value)}, not in options. Using default: ${JSON.stringify(normalizedDefault)}`,
          );
        }
      } else if (typeof value === 'string' && options.some((opt) => typeof opt.value === 'number')) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && options.some((opt) => opt.value === numValue)) {
          normalized[key] = numValue;
          hasChanges = true;
        }
      }
    } else if (def.type === 'product') {
      const productId = value as string;
      const product = productMap.get(productId);
      const expectedProductType = def.productType ?? 'Fluid';
      if (!product || product.type !== expectedProductType) {
        normalized[key] = defaultValue;
        hasChanges = true;
        if (import.meta.env.DEV) {
          console.warn(
            `[Setting Normalization] Setting "${key}" has invalid ${expectedProductType} product ID: ${productId}, using default: ${defaultValue}`,
          );
        }
      }
    }
  }

  return hasChanges ? normalized : settings;
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
  machines = processCategory('machine:', defaultMachines, overrides).map((m) => {
    const rawCost = m.cost as unknown;
    return {
      ...m,
      cost: typeof rawCost === 'string' && rawCost.toLowerCase() === 'infinity' ? Infinity : Number(rawCost),
    };
  });
  recipes = processCategory(
    'recipe:',
    defaultRecipes,
    overrides,
    (entityId) => !getSpecialRecipe(entityId),
  );
  researches = processCategory('research:', defaultResearches, overrides);

  for (let i = 0; i < recipes.length; i++) {
    const sr = getSpecialRecipe(recipes[i].id);
    if (sr) {
      recipes[i].potential_outputs = getSpecialPotentialProducts(sr, 'output', products);
      recipes[i].potential_inputs = getSpecialPotentialProducts(sr, 'input', products);
      recipes[i].isSellTrash = !!sr.isSellTrash;
    }
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

  const virtualModularMachines = buildVirtualModularMachines(machines);
  for (const virtualMachine of virtualModularMachines) {
    machineMap.set(virtualMachine.id, virtualMachine);
  }

  overriddenProducts.clear();
  overriddenMachines.clear();
  overriddenResearches.clear();
  overriddenRecipes.clear();

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

  const defaultRecipeMap = new Map(defaultRecipes.map((r) => [r.id, r]));
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    const baseline = defaultRecipeMap.get(r.id);
    if (baseline && !deepEqual(baseline, r)) {
      overriddenRecipes.add(r.id);
    }
  }

  filteredProducts = products.filter((p) => p.id !== 'any_fluid' && p.id !== 'any_item');
}

export async function reloadDatabase(): Promise<void> {
  const overrides = await getDataOverrides();
  const specialRecipeEdits = overrides
    .filter((entry) => entry.id.startsWith('special_recipe:'))
    .reduce((acc, entry) => {
      const recipeId = entry.id.replace('special_recipe:', '');
      acc[recipeId] = entry.data as unknown as SpecialRecipe;
      return acc;
    }, {} as Record<string, SpecialRecipe>);

  setSpecialRecipeOverrides(specialRecipeEdits);
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
    defaultMachines = (machinesJson.default as Record<string, unknown>[]).map((m) => {
      const rawCost = m.cost;
      return {
        ...m,
        cost: typeof rawCost === 'string' && rawCost.toLowerCase() === 'infinity' ? Infinity : Number(rawCost),
      };
    }) as Machine[];
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

      const computedRecipe = sr.compute(defaults);
      computedRecipe.potential_outputs = getSpecialPotentialProducts(sr, 'output', defaultProducts);
      computedRecipe.potential_inputs = getSpecialPotentialProducts(sr, 'input', defaultProducts);
      computedRecipe.isSellTrash = !!sr.isSellTrash;
      return computedRecipe;
    });

    defaultRecipes = [...defaultRecipes, ...specialRecipes];

    const overrides = await getDataOverrides();

    const specialRecipeEdits = overrides
      .filter((entry) => entry.id.startsWith('special_recipe:'))
      .reduce((acc, entry) => {
        const recipeId = entry.id.replace('special_recipe:', '');
        acc[recipeId] = entry.data as unknown as SpecialRecipe;
        return acc;
      }, {} as Record<string, SpecialRecipe>);

    setSpecialRecipeOverrides(specialRecipeEdits);

    rebuildActiveDatabase(overrides);

    const settingsStore = useGlobalSettingsStore.getState();
    const difficulty = settingsStore.settings.difficulty;
    if ((difficulty === 'sandbox' || difficulty === 'sandbox_plus') && settingsStore.settings.unlockedResearchIds.length === 0) {
      settingsStore.setUnlockedResearchIds(researches.map((r) => r.id));
    }

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
    getFlowRate?: (side: 'input' | 'output', index: number) => number;
  },
  options?: {
    temperatureInputOverrides?: Record<number, number>;
    suppressStoreTemperatureOverrides?: boolean;
    globalSettings?: Record<string, unknown>;
  },
): Recipe | undefined {
  const recipe = recipeMap.get(recipeId);
  if (!recipe) return undefined;

  const sr = getSpecialRecipe(recipeId);
  if (sr) {
    const globalSettings =
      (options?.globalSettings as Record<string, unknown> | undefined) ??
      (useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>);
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
    nodeSettings = normalizeSettings(nodeSettings, sr.settings, productMap, globalSettings);
    const activeHelpers = helpers ?? (() => {
      const flowState = useFlowStore.getState();
      const recipeNodes = flowState.nodes.filter(isRecipeNode);
      const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
      const recipeEdges = flowState.edges.filter(
        (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
      );
      const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);
      const fallbackHelpers = nodeId ? resolutionContext.createHelpers(nodeId) : null;
      return {
        resolveProduct: (side: 'input' | 'output', index: number) => {
          if (!nodeId) return '';
          const handleId = buildHandleId(nodeId, side, index);
          return useFlowResultStore.getState().resolvedProducts[handleId] ?? fallbackHelpers?.resolveProduct(side, index) ?? '';
        },
        hasConnection: (side: 'input' | 'output', index: number) => {
          if (!fallbackHelpers) return false;
          return fallbackHelpers.hasConnection(side, index);
        },
        getFlowRate: (side: 'input' | 'output', index: number) => {
          if (!nodeId) return 0;
          const handleId = buildHandleId(nodeId, side, index);
          const connectedEdges = resolutionContext.edgeLookup.get(handleId) ?? [];
          const edgeFlows = useFlowResultStore.getState().edgeFlows;
          let totalFlow = 0;
          for (const edge of connectedEdges) {
            totalFlow += edgeFlows[edge.id] ?? 0;
          }
          return totalFlow;
        },
      };
    })();

    let resolvedSettings = nodeSettings;
    if (nodeId && sr.inputTemperatureSettings) {
      let hasOverrides = false;
      const overrides: Record<string, unknown> = {};
      const storeInputTemps = options?.suppressStoreTemperatureOverrides
        ? undefined
        : useFlowResultStore.getState().inputTemps[nodeId];
      const inputTempsMap = options?.temperatureInputOverrides ?? storeInputTemps;

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
    resolvedSettings = normalizeSettings(resolvedSettings, sr.settings, productMap, globalSettings);

    const computedRecipe = sr.compute(resolvedSettings, globalSettings, nodeId, activeHelpers);
    computedRecipe.potential_outputs = getSpecialPotentialProducts(sr, 'output', products);
    computedRecipe.potential_inputs = getSpecialPotentialProducts(sr, 'input', products);
    computedRecipe.isSellTrash = !!sr.isSellTrash;

    return computedRecipe;
  }

  return recipe;
}

export function getMachine(id: string): Machine | undefined {
  return machineMap.get(id);
}

export function isMachineUnlocked(machine: Machine, unlockedResearchIds: Set<string>): boolean {
  if (machine.research && !unlockedResearchIds.has(machine.research)) {
    return false;
  }
  if (machine.variant && machine.variant !== 'none' && machine.variant !== '') {
    const parentMachine = getMachine(machine.variant);
    if (parentMachine) {
      return isMachineUnlocked(parentMachine, unlockedResearchIds);
    }
  }
  return true;
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

export function getDefaultRecipes(): Recipe[] {
  return defaultRecipes;
}

export function getDefaultResearches(): Research[] {
  return defaultResearches;
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

export function isBaselineRecipe(id: string): boolean {
  return defaultRecipes.some((r) => r.id === id);
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

export function hasRecipeOverride(id: string): boolean {
  return overriddenRecipes.has(id);
}
