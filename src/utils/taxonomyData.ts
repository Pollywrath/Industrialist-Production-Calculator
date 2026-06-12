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
  Miscellaneous: ['Decoration', 'Depot', 'Pipes', 'Other', 'Research'],
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
