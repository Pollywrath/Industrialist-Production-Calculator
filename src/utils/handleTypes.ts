import type {
  HandleDataType,
  ProductType,
  Recipe,
  RecipeInput,
  RecipeOutput,
} from '../types/data';

export function isHandleDataType(value: unknown): value is HandleDataType {
  return value === 'item' || value === 'fluid';
}

export function productTypeToHandleDataType(
  productType: ProductType | string | undefined,
): HandleDataType | undefined {
  if (productType === 'Item') return 'item';
  if (productType === 'Fluid') return 'fluid';
  return undefined;
}

export function getRecipeEntryProductId(
  recipe: Recipe | undefined,
  side: 'input' | 'output',
  index: number,
): string | undefined {
  const list = side === 'input' ? recipe?.inputs : recipe?.outputs;
  return list?.[index]?.product_id;
}

export function getRecipeEntryHandleType(
  entry: RecipeInput | RecipeOutput | undefined,
): HandleDataType | undefined {
  return isHandleDataType(entry?.handle_type) ? entry.handle_type : undefined;
}

export function getRecipeHandleTypeOverride(
  recipe: Recipe | undefined,
  side: 'input' | 'output',
  index: number,
): HandleDataType | undefined {
  const list = side === 'input' ? recipe?.inputs : recipe?.outputs;
  return getRecipeEntryHandleType(list?.[index]);
}
