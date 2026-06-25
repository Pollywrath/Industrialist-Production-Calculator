import type { Product, Machine, Research, Recipe } from '../types/data';

function decodeWikiHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)));
}

export function normalizeWikiMarkup(val: unknown): string {
  if (val === null || val === undefined) return '';
  return decodeWikiHtmlEntities(String(val))
    .replace(/<\s*sup\s*>(.*?)<\s*\/\s*sup\s*>/gi, '^$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompareKey(val: unknown): string {
  return normalizeWikiMarkup(val).toLowerCase();
}

function getFirstWikiString(...values: unknown[]): string {
  for (const value of values) {
    const text = getWikiString(value);
    if (text) return text;
  }
  return '';
}

function getWikiTitle(row: Record<string, unknown>): string {
  return getFirstWikiString(row.title, row.page_name, row.page_name_sub);
}

export function getOptionalWikiNumber(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = normalizeWikiMarkup(val).replace(/,/g, '').toLowerCase().trim();
    if (cleaned === '∞' || cleaned === 'infinity') {
      return Infinity;
    }
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? null : num;
    }
  }
  return null;
}

export function getWikiNumber(val: unknown): number {
  return getOptionalWikiNumber(val) ?? 0;
}

export function getOptionalWikiBoolean(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    if (!s) return null;
  }
  if (typeof val === 'number') {
    return val !== 0;
  }
  return null;
}

export function getWikiBoolean(val: unknown): boolean {
  return getOptionalWikiBoolean(val) ?? false;
}

export function getWikiString(val: unknown): string {
  return normalizeWikiMarkup(val);
}

export function matchPluralAndSingular(appVal: string, wikiVal: string): boolean {
  const clean = (s: string) => {
    let val = normalizeCompareKey(s);
    if (val === 'miscellaneous' || val === 'misc') return 'misc';
    if (val.endsWith('ies')) {
      val = val.slice(0, -3) + 'y';
    } else if (val.endsWith('s') && !val.endsWith('ss')) {
      val = val.slice(0, -1);
    }
    return val;
  };
  return clean(appVal) === clean(wikiVal);
}

export function matchSize(appSize: { x: number; y: number }, wikiSize: string): boolean {
  if (!wikiSize) return false;
  const cleanApp = `${appSize.x}x${appSize.y}`.toLowerCase().replace(/\s+/g, '');
  const cleanWiki = normalizeCompareKey(wikiSize).replace(/\s+/g, '').replace(/\u00d7/g, 'x');
  return cleanApp === cleanWiki;
}

export function matchVariant(appVariant: string, wikiVariant: string): boolean {
  const clean = (s: string) => normalizeCompareKey(s);
  const cleanApp = clean(appVariant);
  const cleanWiki = clean(wikiVariant);
  if (cleanApp === 'none' || !cleanApp) {
    return cleanWiki === 'none' || !cleanWiki;
  }
  return cleanApp === cleanWiki;
}

export function matchPollution(appPollution: number, wikiPollutionStr: string): boolean {
  const cleanStr = wikiPollutionStr.trim().toLowerCase();
  if (!cleanStr) return true;

  if (cleanStr.includes('depends')) {
    return true;
  }

  const spacedStr = wikiPollutionStr.replace(/(\d)\s*-\s*(\d)/g, '$1 $2');

  const numMatches = spacedStr.match(/-?\d+(?:\.\d+)?/g);
  if (!numMatches) return false;

  const numbers = numMatches.map(Number).filter(n => !isNaN(n));
  if (numbers.length === 0) return false;

  for (const num of numbers) {
    if (Math.abs(appPollution - num) < 1e-6) {
      return true;
    }
  }

  if (numbers.length >= 2 && wikiPollutionStr.includes('-')) {
    const min = Math.min(numbers[0], numbers[1]);
    const max = Math.max(numbers[0], numbers[1]);
    if (appPollution >= min - 1e-6 && appPollution <= max + 1e-6) {
      return true;
    }
  }

  return false;
}

export interface Difference {
  field: string;
  appValue: string | number | boolean;
  wikiValue: string | number | boolean;
}

export interface DiffItem<TApp, TWiki> {
  key: string;
  appItem?: TApp;
  wikiItem?: TWiki;
  differences?: Difference[];
}

export interface ComparisonResult<TApp, TWiki> {
  unchanged: Array<DiffItem<TApp, TWiki>>;
  onlyInApp: Array<DiffItem<TApp, TWiki>>;
  onlyInWiki: Array<DiffItem<TApp, TWiki>>;
  changed: Array<DiffItem<TApp, TWiki>>;
}

export function compareData<TApp, TWiki>(
  appItems: TApp[],
  wikiItems: TWiki[],
  getAppKey: (item: TApp) => string,
  getWikiKey: (item: TWiki) => string,
  compare: (app: TApp, wiki: TWiki) => Difference[]
): ComparisonResult<TApp, TWiki> {
  const unchanged: Array<DiffItem<TApp, TWiki>> = [];
  const onlyInApp: Array<DiffItem<TApp, TWiki>> = [];
  const onlyInWiki: Array<DiffItem<TApp, TWiki>> = [];
  const changed: Array<DiffItem<TApp, TWiki>> = [];

  const wikiMap = new Map<string, TWiki>();
  for (const wiki of wikiItems) {
    const key = normalizeCompareKey(getWikiKey(wiki));
    if (key) {
      wikiMap.set(key, wiki);
    }
  }

  const matchedWikiKeys = new Set<string>();

  for (const app of appItems) {
    const key = getAppKey(app);
    const normalizedKey = normalizeCompareKey(key);
    const wiki = wikiMap.get(normalizedKey);

    if (wiki) {
      matchedWikiKeys.add(normalizedKey);
      const differences = compare(app, wiki);
      if (differences.length > 0) {
        changed.push({
          key,
          appItem: app,
          wikiItem: wiki,
          differences,
        });
      } else {
        unchanged.push({
          key,
          appItem: app,
          wikiItem: wiki,
        });
      }
    } else {
      onlyInApp.push({
        key,
        appItem: app,
      });
    }
  }

  for (const wiki of wikiItems) {
    const key = getWikiKey(wiki);
    const normalizedKey = normalizeCompareKey(key);
    if (!matchedWikiKeys.has(normalizedKey)) {
      onlyInWiki.push({
        key,
        wikiItem: wiki,
      });
    }
  }

  return {
    unchanged,
    onlyInApp,
    onlyInWiki,
    changed,
  };
}

export function compareProducts(
  appProducts: Product[],
  wikiRows: Record<string, unknown>[]
): ComparisonResult<Product, Record<string, unknown>> {
  const filteredApp = appProducts.filter((p) => p.id !== 'any_fluid' && p.id !== 'any_item');

  return compareData(
    filteredApp,
    wikiRows,
    (p) => p.name,
    getWikiTitle,
    (app, wiki) => {
      const diffs: Difference[] = [];

      const wikiIsFluid = getOptionalWikiBoolean(wiki.is_fluid);
      const appIsFluid = app.type === 'Fluid';
      if (wikiIsFluid === null || appIsFluid !== wikiIsFluid) {
        diffs.push({
          field: 'Type',
          appValue: app.type,
          wikiValue: wikiIsFluid === null ? 'Missing' : wikiIsFluid ? 'Fluid' : 'Item',
        });
      }

      const wikiSellVal = getOptionalWikiNumber(wiki.sellvalue !== undefined ? wiki.sellvalue : wiki.sellValue);
      if (wikiSellVal === null || Math.abs(app.sell_price - wikiSellVal) > 1e-6) {
        diffs.push({
          field: 'Sell Price',
          appValue: app.sell_price,
          wikiValue: wikiSellVal ?? 'Missing',
        });
      }

      const wikiResVal = getOptionalWikiNumber(wiki.resvalue !== undefined ? wiki.resvalue : wiki.resValue);
      if (wikiResVal === null || Math.abs(app.rp_multiplier - wikiResVal) > 1e-6) {
        diffs.push({
          field: 'RP Multiplier',
          appValue: app.rp_multiplier,
          wikiValue: wikiResVal ?? 'Missing',
        });
      }

      return diffs;
    }
  );
}

export function compareMachines(
  appMachines: Machine[],
  wikiRows: Record<string, unknown>[],
  researches: Research[],
  machinesList: Machine[]
): ComparisonResult<Machine, Record<string, unknown>> {
  const researchMap = new Map(researches.map((r) => [r.id, r.name]));
  const machineIdToNameMap = new Map(machinesList.map((m) => [m.id, m.name]));

  return compareData(
    appMachines,
    wikiRows,
    (m) => m.name,
    getWikiTitle,
    (app, wiki) => {
      const diffs: Difference[] = [];

      const wikiCategory = getWikiString(wiki.category);
      if (!matchPluralAndSingular(app.category, wikiCategory)) {
        diffs.push({
          field: 'Category',
          appValue: app.category,
          wikiValue: wikiCategory,
        });
      }

      const wikiSubcategory = getWikiString(wiki.subcategory);
      if (!matchPluralAndSingular(app.subcategory, wikiSubcategory)) {
        diffs.push({
          field: 'Subcategory',
          appValue: app.subcategory,
          wikiValue: wikiSubcategory,
        });
      }

      const wikiCost = getOptionalWikiNumber(wiki.cost);
      const rawAppCost = app.cost as unknown;
      const appCost = typeof rawAppCost === 'string' && rawAppCost.toLowerCase() === 'infinity' ? Infinity : Number(app.cost);
      const costDiff = wikiCost === null || (
        (appCost === Infinity || wikiCost === Infinity)
          ? appCost !== wikiCost
          : Math.abs(appCost - wikiCost) > 1e-6
      );
      if (costDiff) {
        diffs.push({
          field: 'Cost',
          appValue: app.cost,
          wikiValue: wikiCost === Infinity ? 'infinity' : (wikiCost ?? 'Missing'),
        });
      }

      const appResearchName = researchMap.get(app.research) || '';
      const wikiResearchName = getWikiString(wiki.research);
      if (normalizeCompareKey(appResearchName) !== normalizeCompareKey(wikiResearchName)) {
        diffs.push({
          field: 'Research',
          appValue: appResearchName || '(None)',
          wikiValue: wikiResearchName || '(None)',
        });
      }

      const wikiLimited = getOptionalWikiBoolean(wiki.limited);
      if (wikiLimited === null || app.limited !== wikiLimited) {
        diffs.push({
          field: 'Limited',
          appValue: app.limited,
          wikiValue: wikiLimited ?? 'Missing',
        });
      }

      let appVariantName = 'none';
      if (app.variant && app.variant !== 'none') {
        appVariantName = machineIdToNameMap.get(app.variant) || app.variant;
      }
      const wikiVariantName = getWikiString(wiki.variant);
      if (!matchVariant(appVariantName, wikiVariantName)) {
        diffs.push({
          field: 'Variant',
          appValue: appVariantName,
          wikiValue: wikiVariantName || 'none',
        });
      }

      const wikiTier = getOptionalWikiNumber(wiki.tier);
      if (wikiTier === null || app.tier !== wikiTier) {
        diffs.push({
          field: 'Tier',
          appValue: app.tier,
          wikiValue: wikiTier ?? 'Missing',
        });
      }

      const wikiSize = getWikiString(wiki.size);
      if (!matchSize(app.size, wikiSize)) {
        diffs.push({
          field: 'Size',
          appValue: `${app.size.x}x${app.size.y}`,
          wikiValue: wikiSize,
        });
      }

      return diffs;
    }
  );
}

export interface WikiRecipe {
  id: string;
  name: string;
  mamyflux: number;
  time: number;
  machine: string;
  pollution: string;
  inputs: Array<{ item: string; amount: number }>;
  outputs: Array<{ item: string; amount: number }>;
}

function matchQuantities(
  appVals: number[],
  wikiVals: number[]
): Array<{ appVal?: number; wikiVal?: number }> {
  const pairs: Array<{ appVal?: number; wikiVal?: number }> = [];
  const remainingApp = [...appVals];
  const remainingWiki = [...wikiVals];

  for (let i = remainingApp.length - 1; i >= 0; i--) {
    const val = remainingApp[i];
    const wikiIdx = remainingWiki.indexOf(val);
    if (wikiIdx !== -1) {
      remainingApp.splice(i, 1);
      remainingWiki.splice(wikiIdx, 1);
    }
  }

  remainingApp.sort((a, b) => b - a);
  remainingWiki.sort((a, b) => b - a);

  const maxLen = Math.max(remainingApp.length, remainingWiki.length);
  for (let i = 0; i < maxLen; i++) {
    const appVal = i < remainingApp.length ? remainingApp[i] : undefined;
    const wikiVal = i < remainingWiki.length ? remainingWiki[i] : undefined;
    pairs.push({ appVal, wikiVal });
  }

  return pairs;
}

interface QuantitySource {
  quantities: Map<string, number[]>;
  names: Map<string, string>;
}

function buildQuantitySource<T>(
  items: T[],
  getName: (item: T) => string,
  getQuantity: (item: T) => number
): QuantitySource {
  const source: QuantitySource = {
    quantities: new Map(),
    names: new Map(),
  };

  for (const item of items) {
    const name = getName(item);
    const key = normalizeCompareKey(name);
    if (!key) continue;

    if (!source.quantities.has(key)) source.quantities.set(key, []);
    source.quantities.get(key)!.push(getQuantity(item));
    if (!source.names.has(key)) source.names.set(key, name);
  }

  return source;
}

function addQuantityDiffs(
  diffs: Difference[],
  label: 'Input' | 'Output',
  appSource: QuantitySource,
  wikiSource: QuantitySource,
  preferredNames: Map<string, string>
) {
  const allNames = new Set([...appSource.quantities.keys(), ...wikiSource.quantities.keys()]);

  for (const name of allNames) {
    const appVals = appSource.quantities.get(name) || [];
    const wikiVals = wikiSource.quantities.get(name) || [];
    const originalName = preferredNames.get(name) || wikiSource.names.get(name) || appSource.names.get(name) || name;

    for (const pair of matchQuantities(appVals, wikiVals)) {
      if (pair.appVal !== undefined && pair.wikiVal !== undefined) {
        if (Math.abs(pair.appVal - pair.wikiVal) > 1e-6) {
          diffs.push({
            field: `${originalName} (${label})`,
            appValue: pair.appVal,
            wikiValue: pair.wikiVal,
          });
        }
      } else if (pair.appVal !== undefined) {
        diffs.push({
          field: `${originalName} (${label})`,
          appValue: pair.appVal,
          wikiValue: 'Missing',
        });
      } else if (pair.wikiVal !== undefined) {
        diffs.push({
          field: `${originalName} (${label})`,
          appValue: 'Missing',
          wikiValue: pair.wikiVal,
        });
      }
    }
  }
}

export function compareRecipes(
  appRecipes: Recipe[],
  wikiInfo: Record<string, unknown>[],
  wikiInputs: Record<string, unknown>[],
  wikiOutputs: Record<string, unknown>[],
  machinesList: Machine[],
  productsList: Product[],
  wikiMachines: Record<string, unknown>[]
): ComparisonResult<Recipe, WikiRecipe> {
  const machineMap = new Map(machinesList.map((m) => [m.id, m.name]));
  const productMap = new Map(productsList.map((p) => [p.id, p.name]));
  const productNameByCompareKey = new Map(productsList.map((p) => [normalizeCompareKey(p.name), p.name]));

  const getNormalizedRecipeId = (id: string) => {
    const s = normalizeCompareKey(id);
    return s.startsWith('r_') ? s.slice(2) : s;
  };

  const wikiMachineMap = new Map<string, Record<string, unknown>>();
  for (const row of wikiMachines) {
    const mName = normalizeCompareKey(getWikiTitle(row));
    if (mName) {
      wikiMachineMap.set(mName, row);
    }
  }

  const inputsMap = new Map<string, Array<{ item: string; amount: number }>>();
  for (const row of wikiInputs) {
    const id = getNormalizedRecipeId(getFirstWikiString(row.id, row.recipe_id, row.recipeId, row.recipe));
    const item = getFirstWikiString(row.item, row.input, row.name);
    const amount = getWikiNumber(row.amount ?? row.quantity ?? row.qty);
    if (id && item) {
      if (!inputsMap.has(id)) {
        inputsMap.set(id, []);
      }
      inputsMap.get(id)!.push({ item, amount });
    }
  }

  const outputsMap = new Map<string, Array<{ item: string; amount: number }>>();
  for (const row of wikiOutputs) {
    const id = getNormalizedRecipeId(getFirstWikiString(row.id, row.recipe_id, row.recipeId, row.recipe));
    const item = getFirstWikiString(row.item, row.output, row.name);
    const amount = getWikiNumber(row.amount ?? row.quantity ?? row.qty);
    if (id && item) {
      if (!outputsMap.has(id)) {
        outputsMap.set(id, []);
      }
      outputsMap.get(id)!.push({ item, amount });
    }
  }

  const wikiRecipes: WikiRecipe[] = [];
  const wikiRecipesMap = new Map<string, WikiRecipe>();

  for (const info of wikiInfo) {
    const id = getNormalizedRecipeId(getFirstWikiString(info.id, info.recipe_id, info.recipeId, info.recipe));
    if (!id) continue;

    const mName = normalizeCompareKey(info.machine);
    const wikiMachine = wikiMachineMap.get(mName);
    const pollution = wikiMachine ? getWikiString(wikiMachine.pollution) : '';

    const recipe: WikiRecipe = {
      id,
      name: getFirstWikiString(info.name, info.title, id),
      mamyflux: getWikiNumber(info.mamyflux ?? info.power ?? info.power_consumption),
      time: getWikiNumber(info.time ?? info.cycle_time ?? info.duration),
      machine: getWikiString(info.machine),
      pollution,
      inputs: inputsMap.get(id) || [],
      outputs: outputsMap.get(id) || [],
    };

    wikiRecipes.push(recipe);
    wikiRecipesMap.set(id, recipe);
  }

  const allWikiIds = new Set([...inputsMap.keys(), ...outputsMap.keys()]);
  for (const id of allWikiIds) {
    if (!wikiRecipesMap.has(id)) {
      const recipe: WikiRecipe = {
        id,
        name: id,
        mamyflux: 0,
        time: 0,
        machine: '',
        pollution: '',
        inputs: inputsMap.get(id) || [],
        outputs: outputsMap.get(id) || [],
      };
      wikiRecipes.push(recipe);
      wikiRecipesMap.set(id, recipe);
    }
  }

  return compareData(
    appRecipes,
    wikiRecipes,
    (r) => getNormalizedRecipeId(r.id),
    (wr) => getNormalizedRecipeId(wr.id),
    (app, wiki) => {
      const diffs: Difference[] = [];

      const wikiTime = wiki.time;
      if (Math.abs(app.cycle_time - wikiTime) > 1e-6) {
        diffs.push({
          field: 'Cycle Time',
          appValue: app.cycle_time,
          wikiValue: wikiTime,
        });
      }

      const wikiMamyflux = wiki.mamyflux;
      if (Math.abs(app.power_consumption - wikiMamyflux) > 1e-6) {
        diffs.push({
          field: 'Power Consumption',
          appValue: app.power_consumption,
          wikiValue: wikiMamyflux,
        });
      }

      const appMachineName = machineMap.get(app.machine_id) || app.machine_id;
      const wikiMachineName = wiki.machine;
      if (normalizeCompareKey(appMachineName) !== normalizeCompareKey(wikiMachineName)) {
        diffs.push({
          field: 'Machine',
          appValue: appMachineName || '(None)',
          wikiValue: wikiMachineName || '(None)',
        });
      }

      if (wiki.pollution !== undefined) {
        if (!matchPollution(app.pollution, wiki.pollution)) {
          diffs.push({
            field: 'Pollution',
            appValue: app.pollution,
            wikiValue: wiki.pollution || '(None)',
          });
        }
      }

      const getProductName = (productId: string) => productMap.get(productId) || productId;
      addQuantityDiffs(
        diffs,
        'Input',
        buildQuantitySource(app.inputs, (input) => getProductName(input.product_id), (input) => input.quantity),
        buildQuantitySource(wiki.inputs, (input) => input.item, (input) => input.amount),
        productNameByCompareKey
      );
      addQuantityDiffs(
        diffs,
        'Output',
        buildQuantitySource(app.outputs, (output) => getProductName(output.product_id), (output) => output.quantity),
        buildQuantitySource(wiki.outputs, (output) => output.item, (output) => output.amount),
        productNameByCompareKey
      );

      return diffs;
    }
  );
}
