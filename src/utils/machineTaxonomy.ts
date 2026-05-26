import {
  Droplet,
  Pickaxe,
  Component,
  Flame,
  Wrench,
  Layers,
  Container,
  Cpu,
  Filter,
  GitFork,
  Binary,
  LogIn,
  LogOut,
  Settings,
  Paintbrush,
  Warehouse,
  HelpCircle,
  FlaskConical,
  Gauge,
  Fan,
  Trees,
  Battery,
  Factory,
  Calculator,
  Leaf,
  Cable,
  Package,
  Fuel,
  type LucideIcon,
} from 'lucide-react';
import type { Machine } from '../types/data';
import { getSpecialRecipe } from '../data/registry';

export const CANONICAL_CATEGORY_MAP: Record<string, string[]> = {
  Extractor: ['Fluid Extractor', 'Item Extractor'],
  Factory: [
    'Assembler',
    'Furnace',
    'Misc',
    'Molder',
    'Plant',
    'Processor',
    'Refinery',
    'Separator',
  ],
  Logic: ['Logic Gate', 'Logic Input', 'Logic Output', 'Miscellaneous'],
  Miscellaneous: ['Decoration', 'Depot', 'Other', 'Research'],
  Modular: ['Modular Diesel Engine', 'Modular Turbine', 'Tree Farm'],
  Power: [
    'Battery',
    'Large Power Plant',
    'Misc',
    'Non-Renewable',
    'Power Rate Calculator',
    'Renewable',
    'Transfer Pole',
  ],
  'Storage Silo': ['Fluid Silo', 'Item Silo'],
};

export const UNIQUE_CATEGORIES = Object.keys(CANONICAL_CATEGORY_MAP).sort();
export const UNIQUE_SUBCATEGORIES = Array.from(
  new Set(Object.values(CANONICAL_CATEGORY_MAP).flat()),
).sort();

export function isValidTaxonomy(category: string, subcategory: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(CANONICAL_CATEGORY_MAP, category)) {
    return false;
  }
  const allowedSubs = CANONICAL_CATEGORY_MAP[category];
  return allowedSubs.includes(subcategory);
}

const SUBCATEGORY_ICONS: Record<string, LucideIcon> = {
  'fluid extractor': Droplet,
  'item extractor': Pickaxe,
  assembler: Component,
  furnace: Flame,
  molder: Layers,
  plant: Container,
  processor: Cpu,
  refinery: Filter,
  separator: GitFork,
  'logic gate': Binary,
  'logic input': LogIn,
  'logic output': LogOut,
  decoration: Paintbrush,
  depot: Warehouse,
  other: HelpCircle,
  research: FlaskConical,
  'modular diesel engine': Gauge,
  'modular turbine': Fan,
  'tree farm': Trees,
  battery: Battery,
  'large power plant': Factory,
  'non-renewable': Fuel,
  'power rate calculator': Calculator,
  renewable: Leaf,
  'fluid silo': Droplet,
  'item silo': Package,
};

const CATEGORY_FALLBACKS: Record<string, LucideIcon> = {
  power: Cable,
  factory: Component,
  logic: Binary,
  extractor: Pickaxe,
};

export function getTaxonomyIcon(category: string, subcategory: string): LucideIcon {
  const cat = (category || '').toLowerCase().trim();
  const sub = (subcategory || '').toLowerCase().trim();

  if (sub === 'misc') {
    if (cat === 'factory') return Wrench;
    if (cat === 'power') return Settings;
  }
  if (sub === 'miscellaneous' && cat === 'logic') return Settings;
  if (sub === 'transfer pole') return Cable;

  if (sub in SUBCATEGORY_ICONS) {
    return SUBCATEGORY_ICONS[sub];
  }

  if (cat in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[cat];
  }

  return HelpCircle;
}

export function createVirtualModularMachine(
  subcategory: string,
  componentMachines: Machine[],
  defaultRecipeCost: number,
): Machine {
  const tier = componentMachines[0]?.tier ?? 1;
  const research = componentMachines[0]?.research ?? '';

  return {
    id: `m_${subcategory.toLowerCase().replace(/\s+/g, '_')}`,
    name: subcategory,
    cost: defaultRecipeCost,
    tier,
    size: { x: 0, y: 0 },
    variant: 'none',
    limited: false,
    research,
    category: 'Modular',
    subcategory,
  };
}

export function validateModularConsistency(machines: Machine[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const modularMachines = machines.filter((m) => m.category === 'Modular');

  const subcategoryGroups = new Map<string, Machine[]>();
  for (const m of modularMachines) {
    if (!subcategoryGroups.has(m.subcategory)) {
      subcategoryGroups.set(m.subcategory, []);
    }
    subcategoryGroups.get(m.subcategory)!.push(m);
  }

  for (const [subcategory, group] of subcategoryGroups) {
    if (group.length === 0) continue;

    const firstTier = group[0].tier;
    const firstResearch = group[0].research;

    for (let i = 1; i < group.length; i++) {
      if (group[i].tier !== firstTier) {
        errors.push(
          `Modular subcategory "${subcategory}" has inconsistent tiers: machine "${group[i].id}" has tier ${group[i].tier} but expected ${firstTier}`,
        );
      }
      if (group[i].research !== firstResearch) {
        errors.push(
          `Modular subcategory "${subcategory}" has inconsistent research: machine "${group[i].id}" has research "${group[i].research}" but expected "${firstResearch}"`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildVirtualModularMachines(machines: Machine[]): Machine[] {
  const modularSubcategories = ['Modular Diesel Engine', 'Modular Turbine', 'Tree Farm'];
  const modularComponents = machines.filter((m) => m.category === 'Modular');

  return modularSubcategories.map((sub) => {
    const componentMachines = modularComponents.filter((m) => m.subcategory === sub);
    const virtualMachineId = `m_${sub.toLowerCase().replace(/\s+/g, '_')}`;
    const specialRecipeId = virtualMachineId.replace('m_', 'r_') + '_01';
    const specialRecipe = getSpecialRecipe(specialRecipeId);
    const defaultRecipeCost = specialRecipe?.computeMachineCost
      ? specialRecipe.computeMachineCost(
          Object.entries(specialRecipe.settings).reduce(
            (acc, [key, def]) => {
              acc[key] = def.default;
              return acc;
            },
            {} as Record<string, unknown>,
          ),
        )
      : 0;

    return createVirtualModularMachine(sub, componentMachines, defaultRecipeCost);
  });
}
