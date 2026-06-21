import type {
  Product,
  Machine,
  MachineSize,
  Recipe,
  RecipeInput,
  RecipeOutput,
  Research,
} from '../types/data';
import { CANONICAL_CATEGORY_MAP, isValidTaxonomy } from './taxonomyData';
import { validateModularConsistency } from './modularMachineFactory';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateProduct(product: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!product || typeof product !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Product must be a valid object' }],
    };
  }

  const p = product as Partial<Product> & Record<string, unknown>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    errors.push({ field: 'id', message: 'ID must be a non-empty string' });
  } else if (!p.id.startsWith('p_') && p.id !== 'any_fluid' && p.id !== 'any_item') {
    errors.push({
      field: 'id',
      message: `ID "${p.id}" must start with "p_" prefix`,
    });
  }

  if (typeof p.name !== 'string' || !p.name.trim()) {
    errors.push({ field: 'name', message: 'Name must be a non-empty string' });
  }

  if (typeof p.sell_price !== 'number' || isNaN(p.sell_price)) {
    errors.push({
      field: 'sell_price',
      message: 'Sell price must be a valid number',
    });
  }

  if (typeof p.rp_multiplier !== 'number' || isNaN(p.rp_multiplier)) {
    errors.push({
      field: 'rp_multiplier',
      message: 'RP multiplier must be a valid number',
    });
  } else if (p.rp_multiplier < 0) {
    errors.push({
      field: 'rp_multiplier',
      message: 'RP multiplier cannot be less than 0',
    });
  }

  if (p.type !== 'Item' && p.type !== 'Fluid') {
    errors.push({
      field: 'type',
      message: `Type must be either "Item" or "Fluid" (got "${p.type}")`,
    });
  }

  if (p.profit !== undefined && typeof p.profit !== 'boolean') {
    errors.push({ field: 'profit', message: 'Profit must be a boolean' });
  }

  if (p.research !== undefined && typeof p.research !== 'boolean') {
    errors.push({ field: 'research', message: 'Research must be a boolean' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateMachine(
  machine: unknown,
  validResearchIds?: Set<string>,
  validMachineIds?: Set<string>,
  isVirtualModular = false,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!machine || typeof machine !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Machine must be a valid object' }],
    };
  }

  const m = machine as Partial<Machine> & Record<string, unknown>;

  if (typeof m.id !== 'string' || !m.id.trim()) {
    errors.push({ field: 'id', message: 'ID must be a non-empty string' });
  } else if (!m.id.startsWith('m_')) {
    errors.push({
      field: 'id',
      message: `ID "${m.id}" must start with "m_" prefix`,
    });
  }

  if (typeof m.name !== 'string' || !m.name.trim()) {
    errors.push({ field: 'name', message: 'Name must be a non-empty string' });
  }

  const rawCost = m.cost as unknown;
  const costVal = typeof rawCost === 'string' && rawCost.toLowerCase() === 'infinity' ? Infinity : rawCost;
  if (typeof costVal !== 'number' || isNaN(costVal)) {
    errors.push({ field: 'cost', message: 'Cost must be a valid number' });
  } else if (!isVirtualModular && costVal <= 0) {
    errors.push({ field: 'cost', message: 'Cost must be greater than 0' });
  }

  if (typeof m.tier !== 'number' || !Number.isInteger(m.tier)) {
    errors.push({ field: 'tier', message: 'Tier must be an integer' });
  } else if (m.tier < 1 || m.tier > 4) {
    errors.push({
      field: 'tier',
      message: 'Tier must be between 1 and 4 inclusive',
    });
  }

  if (!m.size || typeof m.size !== 'object') {
    errors.push({
      field: 'size',
      message: 'Size must be an object containing x and y',
    });
  } else {
    const size = m.size as Partial<MachineSize> & Record<string, unknown>;
    const minSize = isVirtualModular ? 0 : 1;
    if (typeof size.x !== 'number' || !Number.isInteger(size.x) || size.x < minSize) {
      errors.push({
        field: 'size.x',
        message: isVirtualModular
          ? 'Size x must be an integer greater than or equal to 0'
          : 'Size x must be an integer greater than or equal to 1',
      });
    }
    if (typeof size.y !== 'number' || !Number.isInteger(size.y) || size.y < minSize) {
      errors.push({
        field: 'size.y',
        message: isVirtualModular
          ? 'Size y must be an integer greater than or equal to 0'
          : 'Size y must be an integer greater than or equal to 1',
      });
    }
  }

  if (typeof m.variant !== 'string') {
    errors.push({ field: 'variant', message: 'Variant must be a string' });
  } else if (validMachineIds && m.variant && m.variant !== 'none' && !validMachineIds.has(m.variant)) {
    errors.push({
      field: 'variant',
      message: `Variant machine ID "${m.variant}" does not exist in machine database`,
    });
  }

  if (typeof m.limited !== 'boolean') {
    errors.push({ field: 'limited', message: 'Limited must be a boolean' });
  }

  if (m.sandboxOnly !== undefined && typeof m.sandboxOnly !== 'boolean') {
    errors.push({ field: 'sandboxOnly', message: 'Sandbox Only must be a boolean' });
  }

  if (m.sandboxPlusOnly !== undefined && typeof m.sandboxPlusOnly !== 'boolean') {
    errors.push({ field: 'sandboxPlusOnly', message: 'Sandbox+ Only must be a boolean' });
  }

  if (typeof m.research !== 'string') {
    errors.push({ field: 'research', message: 'Research must be a string' });
  } else if (validResearchIds && m.research && !validResearchIds.has(m.research)) {
    errors.push({
      field: 'research',
      message: `Research ID "${m.research}" does not exist in research database`,
    });
  }

  if (typeof m.category !== 'string' || !m.category.trim()) {
    errors.push({
      field: 'category',
      message: 'Category must be a non-empty string',
    });
  } else if (m.category !== 'Removed') {
    if (!Object.prototype.hasOwnProperty.call(CANONICAL_CATEGORY_MAP, m.category)) {
      errors.push({
        field: 'category',
        message: `Category "${m.category}" is invalid. Must be one of: ${Object.keys(CANONICAL_CATEGORY_MAP).join(', ')}`,
      });
    } else {
      if (typeof m.subcategory !== 'string' || !m.subcategory.trim()) {
        errors.push({
          field: 'subcategory',
          message: 'Subcategory must be a non-empty string',
        });
      } else if (!isValidTaxonomy(m.category, m.subcategory)) {
        const allowedSubs = CANONICAL_CATEGORY_MAP[m.category];
        errors.push({
          field: 'subcategory',
          message: `Subcategory "${m.subcategory}" is invalid for category "${m.category}". Must be one of: ${allowedSubs.join(', ')}`,
        });
      }
    }
  } else {
    if (typeof m.subcategory !== 'string') {
      errors.push({
        field: 'subcategory',
        message: 'Subcategory must be a string',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateRecipe(
  recipe: unknown,
  validProductIds?: Set<string>,
  validMachineIds?: Set<string>,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!recipe || typeof recipe !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Recipe must be a valid object' }],
    };
  }

  const r = recipe as Partial<Recipe> & Record<string, unknown>;

  const recipeIdRegex = /^r_([a-zA-Z0-9_]+)_(0[1-9]|[1-9]\d*)$/;
  if (typeof r.id !== 'string' || !r.id.trim()) {
    errors.push({ field: 'id', message: 'ID must be a non-empty string' });
  } else if (!recipeIdRegex.test(r.id)) {
    errors.push({
      field: 'id',
      message: `ID "${r.id}" must start with "r_" prefix and end with a positive numeric index (e.g., "r_machine_name_01")`,
    });
  }

  if (typeof r.name !== 'string' || !r.name.trim()) {
    errors.push({ field: 'name', message: 'Name must be a non-empty string' });
  }

  if (typeof r.machine_id !== 'string' || !r.machine_id.trim()) {
    errors.push({
      field: 'machine_id',
      message: 'Machine ID must be a non-empty string',
    });
  } else if (validMachineIds && !validMachineIds.has(r.machine_id)) {
    const modularSubcategories = ['Modular Diesel Engine', 'Modular Turbine', 'Tree Farm'];
    const isVirtualModular = modularSubcategories.some(
      (sub) => r.machine_id === `m_${sub.toLowerCase().replace(/\s+/g, '_')}`,
    );

    if (!isVirtualModular) {
      errors.push({
        field: 'machine_id',
        message: `Machine ID "${r.machine_id}" does not exist in machine database`,
      });
    }
  }

  if (typeof r.cycle_time !== 'number' || isNaN(r.cycle_time)) {
    errors.push({
      field: 'cycle_time',
      message: 'Cycle time must be a valid number',
    });
  } else if (r.cycle_time <= 0) {
    errors.push({
      field: 'cycle_time',
      message: 'Cycle time must be greater than 0',
    });
  }

  if (typeof r.power_consumption !== 'number' || isNaN(r.power_consumption)) {
    errors.push({
      field: 'power_consumption',
      message: 'Power consumption must be a valid number',
    });
  }

  if (r.power_type !== 'MV' && r.power_type !== 'HV') {
    errors.push({
      field: 'power_type',
      message: `Power type must be either "MV" or "HV" (got "${r.power_type}")`,
    });
  }

  const validatePowerEffects = (field: string, value: unknown) => {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      errors.push({
        field,
        message: 'Power effects must be an array when present',
      });
      return;
    }

    value.forEach((effect: unknown, idx: number) => {
      if (!effect || typeof effect !== 'object') {
        errors.push({
          field: `${field}[${idx}]`,
          message: 'Power effect must be a valid object',
        });
        return;
      }

      const typedEffect = effect as Record<string, unknown>;
      if (typedEffect.power_type !== 'MV' && typedEffect.power_type !== 'HV') {
        errors.push({
          field: `${field}[${idx}].power_type`,
          message: `Power effect type must be either "MV" or "HV" (got "${typedEffect.power_type}")`,
        });
      }

      if (
        typeof typedEffect.power_consumption !== 'number' ||
        isNaN(typedEffect.power_consumption)
      ) {
        errors.push({
          field: `${field}[${idx}].power_consumption`,
          message: 'Power effect consumption must be a valid number',
        });
      }

      if (
        typedEffect.accounting !== undefined &&
        typedEffect.accounting !== 'normal' &&
        typedEffect.accounting !== 'production_delta'
      ) {
        errors.push({
          field: `${field}[${idx}].accounting`,
          message: `Power effect accounting must be either "normal" or "production_delta" (got "${typedEffect.accounting}")`,
        });
      }
    });
  };

  validatePowerEffects('powerEffects', r.powerEffects);
  validatePowerEffects('powerAccountingEffects', r.powerAccountingEffects);

  if (typeof r.pollution !== 'number' || isNaN(r.pollution)) {
    errors.push({
      field: 'pollution',
      message: 'Pollution must be a valid number',
    });
  }

  if (!Array.isArray(r.inputs)) {
    errors.push({ field: 'inputs', message: 'Inputs must be an array' });
  } else {
    r.inputs.forEach((input: unknown, idx: number) => {
      if (!input || typeof input !== 'object') {
        errors.push({
          field: `inputs[${idx}]`,
          message: 'Input entry must be a valid object',
        });
        return;
      }
      const inp = input as Partial<RecipeInput> & Record<string, unknown>;
      if (typeof inp.product_id !== 'string' || !inp.product_id.trim()) {
        errors.push({
          field: `inputs[${idx}].product_id`,
          message: 'Product ID must be a non-empty string',
        });
      } else if (validProductIds && !validProductIds.has(inp.product_id)) {
        errors.push({
          field: `inputs[${idx}].product_id`,
          message: `Product ID "${inp.product_id}" does not exist in product database`,
        });
      }
      if (typeof inp.quantity !== 'number' || isNaN(inp.quantity) || inp.quantity <= 0) {
        errors.push({
          field: `inputs[${idx}].quantity`,
          message: 'Quantity must be a number greater than 0',
        });
      }
      if (
        inp.handle_type !== undefined &&
        inp.handle_type !== 'item' &&
        inp.handle_type !== 'fluid'
      ) {
        errors.push({
          field: `inputs[${idx}].handle_type`,
          message: 'Handle type must be either "item" or "fluid"',
        });
      }
      if (inp.product_link_id !== undefined && typeof inp.product_link_id !== 'string') {
        errors.push({
          field: `inputs[${idx}].product_link_id`,
          message: 'Product link ID must be a string',
        });
      }
    });
  }

  if (!Array.isArray(r.outputs)) {
    errors.push({ field: 'outputs', message: 'Outputs must be an array' });
  } else {
    r.outputs.forEach((output: unknown, idx: number) => {
      if (!output || typeof output !== 'object') {
        errors.push({
          field: `outputs[${idx}]`,
          message: 'Output entry must be a valid object',
        });
        return;
      }
      const out = output as Partial<RecipeOutput> & Record<string, unknown>;
      if (typeof out.product_id !== 'string' || !out.product_id.trim()) {
        errors.push({
          field: `outputs[${idx}].product_id`,
          message: 'Product ID must be a non-empty string',
        });
      } else if (validProductIds && !validProductIds.has(out.product_id)) {
        errors.push({
          field: `outputs[${idx}].product_id`,
          message: `Product ID "${out.product_id}" does not exist in product database`,
        });
      }
      if (typeof out.quantity !== 'number' || isNaN(out.quantity) || out.quantity <= 0) {
        errors.push({
          field: `outputs[${idx}].quantity`,
          message: 'Quantity must be a number greater than 0',
        });
      }
      if (typeof out.temperature !== 'number' || isNaN(out.temperature)) {
        errors.push({
          field: `outputs[${idx}].temperature`,
          message: 'Temperature must be a valid number',
        });
      }
      if (
        out.handle_type !== undefined &&
        out.handle_type !== 'item' &&
        out.handle_type !== 'fluid'
      ) {
        errors.push({
          field: `outputs[${idx}].handle_type`,
          message: 'Handle type must be either "item" or "fluid"',
        });
      }
      if (out.product_link_id !== undefined && typeof out.product_link_id !== 'string') {
        errors.push({
          field: `outputs[${idx}].product_link_id`,
          message: 'Product link ID must be a string',
        });
      }
    });
  }

  if (r.isSellTrash !== undefined && typeof r.isSellTrash !== 'boolean') {
    errors.push({ field: 'isSellTrash', message: 'isSellTrash must be a boolean' });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateResearch(research: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!research || typeof research !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Research must be a valid object' }],
    };
  }

  const r = research as Partial<Research> & Record<string, unknown>;

  if (typeof r.id !== 'string' || !r.id.trim()) {
    errors.push({ field: 'id', message: 'ID must be a non-empty string' });
  } else if (!r.id.startsWith('s_')) {
    errors.push({
      field: 'id',
      message: `ID "${r.id}" must start with "s_" prefix`,
    });
  }

  if (typeof r.name !== 'string' || !r.name.trim()) {
    errors.push({ field: 'name', message: 'Name must be a non-empty string' });
  }

  if (typeof r.rp_cost !== 'number' || isNaN(r.rp_cost)) {
    errors.push({
      field: 'rp_cost',
      message: 'RP cost must be a valid number',
    });
  } else if (r.rp_cost < 0) {
    errors.push({ field: 'rp_cost', message: 'RP cost cannot be less than 0' });
  }

  if (r.category !== 'Production' && r.category !== 'Energy' && r.category !== 'Utility') {
    errors.push({
      field: 'category',
      message: `Category must be "Production", "Energy", or "Utility" (got "${r.category}")`,
    });
  }

  if (!Array.isArray(r.prerequisites)) {
    errors.push({
      field: 'prerequisites',
      message: 'Prerequisites must be an array of strings',
    });
  } else {
    r.prerequisites.forEach((prereq: unknown, idx: number) => {
      if (typeof prereq !== 'string' || !prereq.trim()) {
        errors.push({
          field: `prerequisites[${idx}]`,
          message: 'Prerequisite ID must be a non-empty string',
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface DbValidationResults {
  valid: boolean;
  productErrors: { id: string; errors: ValidationError[] }[];
  machineErrors: { id: string; errors: ValidationError[] }[];
  recipeErrors: { id: string; errors: ValidationError[] }[];
  researchErrors: { id: string; errors: ValidationError[] }[];
  modularConsistencyErrors: string[];
}

export function validateFullDatabase(
  products: unknown[],
  machines: unknown[],
  recipes: unknown[],
  researches: unknown[],
): DbValidationResults {
  const productIds = new Set<string>(
    products
      .map((p) => (p as Partial<Product> & Record<string, unknown>)?.id)
      .filter((id): id is string => typeof id === 'string' && !!id.trim()),
  );
  const machineIds = new Set<string>(
    machines
      .map((m) => (m as Partial<Machine> & Record<string, unknown>)?.id)
      .filter((id): id is string => typeof id === 'string' && !!id.trim()),
  );
  const researchIds = new Set<string>(
    researches
      .map((r) => (r as Partial<Research> & Record<string, unknown>)?.id)
      .filter((id): id is string => typeof id === 'string' && !!id.trim()),
  );

  const productErrors: { id: string; errors: ValidationError[] }[] = [];
  const machineErrors: { id: string; errors: ValidationError[] }[] = [];
  const recipeErrors: { id: string; errors: ValidationError[] }[] = [];
  const researchErrors: { id: string; errors: ValidationError[] }[] = [];

  products.forEach((p, idx) => {
    const res = validateProduct(p);
    if (!res.valid) {
      const id = (p as Partial<Product> & Record<string, unknown>)?.id;
      productErrors.push({ id: id || `[Index ${idx}]`, errors: res.errors });
    }
  });

  researches.forEach((r, idx) => {
    const res = validateResearch(r);
    if (!res.valid) {
      const id = (r as Partial<Research> & Record<string, unknown>)?.id;
      researchErrors.push({
        id: id || `[Index ${idx}]`,
        errors: res.errors,
      });
    }
  });

  machines.forEach((m, idx) => {
    const res = validateMachine(m, researchIds, machineIds);
    if (!res.valid) {
      const id = (m as Partial<Machine> & Record<string, unknown>)?.id;
      machineErrors.push({ id: id || `[Index ${idx}]`, errors: res.errors });
    }
  });

  recipes.forEach((rec, idx) => {
    const res = validateRecipe(rec, productIds, machineIds);
    if (!res.valid) {
      const id = (rec as Partial<Recipe> & Record<string, unknown>)?.id;
      recipeErrors.push({
        id: id || `[Index ${idx}]`,
        errors: res.errors,
      });
    }
  });

  const modularConsistencyResult = validateModularConsistency(machines as Machine[]);

  const valid =
    productErrors.length === 0 &&
    machineErrors.length === 0 &&
    recipeErrors.length === 0 &&
    researchErrors.length === 0 &&
    modularConsistencyResult.valid;

  return {
    valid,
    productErrors,
    machineErrors,
    recipeErrors,
    researchErrors,
    modularConsistencyErrors: modularConsistencyResult.errors,
  };
}

export function computeChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 2166136261;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).toUpperCase();
}

export interface DatabaseChecksums {
  products: string;
  machines: string;
  recipes: string;
  researches: string;
  combined: string;
}

export function getDatabaseChecksums(
  products: unknown[],
  machines: unknown[],
  recipes: unknown[],
  researches: unknown[],
): DatabaseChecksums {
  return {
    products: computeChecksum(products),
    machines: computeChecksum(machines),
    recipes: computeChecksum(recipes),
    researches: computeChecksum(researches),
    combined: computeChecksum([products, machines, recipes, researches]),
  };
}
