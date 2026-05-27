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

export { CANONICAL_CATEGORY_MAP, UNIQUE_CATEGORIES, UNIQUE_SUBCATEGORIES, isValidTaxonomy } from './taxonomyData';
export {
  createVirtualModularMachine,
  validateModularConsistency,
  buildVirtualModularMachines,
} from './modularMachineFactory';

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
  const normalizedCategory = (category || '').toLowerCase().trim();
  const normalizedSubcategory = (subcategory || '').toLowerCase().trim();

  if (normalizedSubcategory === 'misc') {
    if (normalizedCategory === 'factory') return Wrench;
    if (normalizedCategory === 'power') return Settings;
  }
  if (normalizedSubcategory === 'miscellaneous' && normalizedCategory === 'logic') return Settings;
  if (normalizedSubcategory === 'transfer pole') return Cable;

  if (normalizedSubcategory in SUBCATEGORY_ICONS) {
    return SUBCATEGORY_ICONS[normalizedSubcategory];
  }

  if (normalizedCategory in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[normalizedCategory];
  }

  return HelpCircle;
}
