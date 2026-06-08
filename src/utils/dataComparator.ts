import type { Product, Machine, Research, Recipe } from '../types/data';

export function getWikiNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '');
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? 0 : num;
    }
  }
  return 0;
}

export function getWikiBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  if (typeof val === 'number') {
    return val !== 0;
  }
  return false;
}

export function getWikiString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

export function matchPluralAndSingular(appVal: string, wikiVal: string): boolean {
  const clean = (s: string) => {
    let val = s.trim().toLowerCase();
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
  const cleanWiki = wikiSize.toLowerCase().replace(/\s+/g, '');
  return cleanApp === cleanWiki;
}

export function matchVariant(appVariant: string, wikiVariant: string): boolean {
  const clean = (s: string) => (s || '').trim().toLowerCase();
  const cleanApp = clean(appVariant);
  const cleanWiki = clean(wikiVariant);
  if (cleanApp === 'none' || !cleanApp) {
    return cleanWiki === 'none' || !cleanWiki;
  }
  return cleanApp === cleanWiki;
}

export function matchPollution(appPollution: number, wikiPollutionStr: string): boolean {
  const cleanStr = wikiPollutionStr.trim().toLowerCase();
  if (!cleanStr) return true; // Empty wiki field matches anything

  if (cleanStr.includes('depends')) {
    return true;
  }

  // Replace hyphens that are preceded by a digit (range separator) with a space
  const spacedStr = wikiPollutionStr.replace(/(\d)\s*-\s*(\d)/g, '$1 $2');

  // Extract all numbers
  const numMatches = spacedStr.match(/-?\d+(?:\.\d+)?/g);
  if (!numMatches) return false;

  const numbers = numMatches.map(Number).filter(n => !isNaN(n));
  if (numbers.length === 0) return false;

  // Check if appValue matches any of the numbers directly
  for (const num of numbers) {
    if (Math.abs(appPollution - num) < 1e-6) {
      return true;
    }
  }

  // If there are at least two numbers and the original string had a range dash,
  // check if appPollution falls within the range of the first two numbers
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
    const key = getWikiKey(wiki).trim().toLowerCase();
    if (key) {
      wikiMap.set(key, wiki);
    }
  }

  const matchedWikiKeys = new Set<string>();

  for (const app of appItems) {
    const key = getAppKey(app);
    const normalizedKey = key.trim().toLowerCase();
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
    const normalizedKey = key.trim().toLowerCase();
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
    (row) => getWikiString(row.page_name || row.page_name_sub || row.title),
    (app, wiki) => {
      const diffs: Difference[] = [];

      const wikiIsFluid = getWikiBoolean(wiki.is_fluid);
      const appIsFluid = app.type === 'Fluid';
      if (appIsFluid !== wikiIsFluid) {
        diffs.push({
          field: 'Type',
          appValue: app.type,
          wikiValue: wikiIsFluid ? 'Fluid' : 'Item',
        });
      }

      const wikiSellVal = getWikiNumber(wiki.sellvalue !== undefined ? wiki.sellvalue : wiki.sellValue);
      if (Math.abs(app.sell_price - wikiSellVal) > 1e-6) {
        diffs.push({
          field: 'Sell Price',
          appValue: app.sell_price,
          wikiValue: wikiSellVal,
        });
      }

      const wikiResVal = getWikiNumber(wiki.resvalue !== undefined ? wiki.resvalue : wiki.resValue);
      if (Math.abs(app.rp_multiplier - wikiResVal) > 1e-6) {
        diffs.push({
          field: 'RP Multiplier',
          appValue: app.rp_multiplier,
          wikiValue: wikiResVal,
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
    (row) => getWikiString(row.page_name || row.page_name_sub || row.title),
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

      const wikiCost = getWikiNumber(wiki.cost);
      if (Math.abs(app.cost - wikiCost) > 1e-6) {
        diffs.push({
          field: 'Cost',
          appValue: app.cost,
          wikiValue: wikiCost,
        });
      }

      const appResearchName = researchMap.get(app.research) || '';
      const wikiResearchName = getWikiString(wiki.research);
      if (appResearchName.trim().toLowerCase() !== wikiResearchName.trim().toLowerCase()) {
        diffs.push({
          field: 'Research',
          appValue: appResearchName || '(None)',
          wikiValue: wikiResearchName || '(None)',
        });
      }

      const wikiLimited = getWikiBoolean(wiki.limited);
      if (app.limited !== wikiLimited) {
        diffs.push({
          field: 'Limited',
          appValue: app.limited,
          wikiValue: wikiLimited,
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

      const wikiTier = getWikiNumber(wiki.tier);
      if (app.tier !== wikiTier) {
        diffs.push({
          field: 'Tier',
          appValue: app.tier,
          wikiValue: wikiTier,
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

  const wikiMachineMap = new Map<string, Record<string, unknown>>();
  for (const row of wikiMachines) {
    const mName = getWikiString(row.page_name || row.page_name_sub || row.title).trim().toLowerCase();
    if (mName) {
      wikiMachineMap.set(mName, row);
    }
  }

  const inputsMap = new Map<string, Array<{ item: string; amount: number }>>();
  for (const row of wikiInputs) {
    const id = getWikiString(row.id || row.recipe_id || row.recipeId || row.recipe).trim().toLowerCase();
    const item = getWikiString(row.item || row.input || row.name);
    const amount = getWikiNumber(row.amount || row.quantity || row.qty);
    if (id && item) {
      if (!inputsMap.has(id)) {
        inputsMap.set(id, []);
      }
      inputsMap.get(id)!.push({ item, amount });
    }
  }

  const outputsMap = new Map<string, Array<{ item: string; amount: number }>>();
  for (const row of wikiOutputs) {
    const id = getWikiString(row.id || row.recipe_id || row.recipeId || row.recipe).trim().toLowerCase();
    const item = getWikiString(row.item || row.output || row.name);
    const amount = getWikiNumber(row.amount || row.quantity || row.qty);
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
    const id = getWikiString(info.id || info.recipe_id || info.recipeId || info.recipe).trim().toLowerCase();
    if (!id) continue;

    const mName = getWikiString(info.machine).trim().toLowerCase();
    const wikiMachine = wikiMachineMap.get(mName);
    const pollution = wikiMachine ? getWikiString(wikiMachine.pollution) : '';

    const recipe: WikiRecipe = {
      id,
      name: getWikiString(info.name || info.title || id),
      mamyflux: getWikiNumber(info.mamyflux || info.power || info.power_consumption),
      time: getWikiNumber(info.time || info.cycle_time || info.duration),
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

  const getNormalizedId = (id: string) => {
    const s = id.trim().toLowerCase();
    return s.startsWith('r_') ? s.slice(2) : s;
  };

  return compareData(
    appRecipes,
    wikiRecipes,
    (r) => getNormalizedId(r.id),
    (wr) => wr.id,
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
      if (appMachineName.trim().toLowerCase() !== wikiMachineName.trim().toLowerCase()) {
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

      const appInputsMap = new Map<string, number[]>();
      for (const input of app.inputs) {
        const name = productMap.get(input.product_id) || input.product_id;
        const key = name.toLowerCase().trim();
        if (!appInputsMap.has(key)) appInputsMap.set(key, []);
        appInputsMap.get(key)!.push(input.quantity);
      }

      const wikiInputsMap = new Map<string, number[]>();
      for (const input of wiki.inputs) {
        const key = input.item.toLowerCase().trim();
        if (!wikiInputsMap.has(key)) wikiInputsMap.set(key, []);
        wikiInputsMap.get(key)!.push(input.amount);
      }

      const allInputNames = new Set([...appInputsMap.keys(), ...wikiInputsMap.keys()]);
      for (const name of allInputNames) {
        const appVals = appInputsMap.get(name) || [];
        const wikiVals = wikiInputsMap.get(name) || [];

        const originalName = productsList.find(p => p.name.toLowerCase() === name.toLowerCase())?.name
          || wiki.inputs.find(i => i.item.toLowerCase() === name.toLowerCase())?.item
          || name;

        const pairs = matchQuantities(appVals, wikiVals);
        for (const pair of pairs) {
          if (pair.appVal !== undefined && pair.wikiVal !== undefined) {
            if (Math.abs(pair.appVal - pair.wikiVal) > 1e-6) {
              diffs.push({
                field: `${originalName} (Input)`,
                appValue: pair.appVal,
                wikiValue: pair.wikiVal,
              });
            }
          } else if (pair.appVal !== undefined) {
            diffs.push({
              field: `${originalName} (Input)`,
              appValue: pair.appVal,
              wikiValue: 'Missing',
            });
          } else if (pair.wikiVal !== undefined) {
            diffs.push({
              field: `${originalName} (Input)`,
              appValue: 'Missing',
              wikiValue: pair.wikiVal,
            });
          }
        }
      }

      const appOutputsMap = new Map<string, number[]>();
      for (const output of app.outputs) {
        const name = productMap.get(output.product_id) || output.product_id;
        const key = name.toLowerCase().trim();
        if (!appOutputsMap.has(key)) appOutputsMap.set(key, []);
        appOutputsMap.get(key)!.push(output.quantity);
      }

      const wikiOutputsMap = new Map<string, number[]>();
      for (const output of wiki.outputs) {
        const key = output.item.toLowerCase().trim();
        if (!wikiOutputsMap.has(key)) wikiOutputsMap.set(key, []);
        wikiOutputsMap.get(key)!.push(output.amount);
      }

      const allOutputNames = new Set([...appOutputsMap.keys(), ...wikiOutputsMap.keys()]);
      for (const name of allOutputNames) {
        const appVals = appOutputsMap.get(name) || [];
        const wikiVals = wikiOutputsMap.get(name) || [];

        const originalName = productsList.find(p => p.name.toLowerCase() === name.toLowerCase())?.name
          || wiki.outputs.find(o => o.item.toLowerCase() === name.toLowerCase())?.item
          || name;

        const pairs = matchQuantities(appVals, wikiVals);
        for (const pair of pairs) {
          if (pair.appVal !== undefined && pair.wikiVal !== undefined) {
            if (Math.abs(pair.appVal - pair.wikiVal) > 1e-6) {
              diffs.push({
                field: `${originalName} (Output)`,
                appValue: pair.appVal,
                wikiValue: pair.wikiVal,
              });
            }
          } else if (pair.appVal !== undefined) {
            diffs.push({
              field: `${originalName} (Output)`,
              appValue: pair.appVal,
              wikiValue: 'Missing',
            });
          } else if (pair.wikiVal !== undefined) {
            diffs.push({
              field: `${originalName} (Output)`,
              appValue: 'Missing',
              wikiValue: pair.wikiVal,
            });
          }
        }
      }

      return diffs;
    }
  );
}

