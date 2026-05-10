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
