import type { Recipe, Machine, Product, Research } from '../types/data';
import { getAllSpecialRecipes } from './registry';


let recipes: Recipe[] = [];
let machines: Machine[] = [];
let products: Product[] = [];
let researches: Research[] = [];

const recipeMap = new Map<string, Recipe>();
const machineMap = new Map<string, Machine>();
const productMap = new Map<string, Product>();
const researchMap = new Map<string, Research>();

let initPromise: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [recipesJson, machinesJson, productsJson, researchesJson] = await Promise.all([
      import('../data/recipes.json'),
      import('../data/machines.json'),
      import('../data/products.json'),
      import('../data/researches.json'),
    ]);

    recipes = recipesJson.default as Recipe[];
    machines = machinesJson.default as Machine[];
    products = productsJson.default as Product[];
    researches = researchesJson.default as Research[];

    // Integrate Special Recipes
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

    recipes = [...recipes, ...specialRecipes];


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
