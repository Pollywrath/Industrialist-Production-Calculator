import type { Recipe, Machine, Product } from '../types/data';
import recipesJson from '../data/recipes.json';
import machinesJson from '../data/machines.json';
import productsJson from '../data/products.json';
import researchesJson from '../data/researches.json';
import { validateFullDatabase, getDatabaseChecksums } from '../utils/dataValidation';

const recipes = recipesJson as Recipe[];
const machines = machinesJson as Machine[];
const products = productsJson as Product[];

if (import.meta.env.DEV) {
  const checksums = getDatabaseChecksums(products, machines, recipes, researchesJson);
  const validation = validateFullDatabase(products, machines, recipes, researchesJson);
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

const recipeMap = new Map<string, Recipe>();
for (let i = 0; i < recipes.length; i++) {
  recipeMap.set(recipes[i].id, recipes[i]);
}

const machineMap = new Map<string, Machine>();
for (let i = 0; i < machines.length; i++) {
  machineMap.set(machines[i].id, machines[i]);
}

const productMap = new Map<string, Product>();
for (let i = 0; i < products.length; i++) {
  productMap.set(products[i].id, products[i]);
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
