import type { HandleDataType } from '../../../types/data';
import { getProduct } from '../../../data/lookup';
import { isHandleDataType, productTypeToHandleDataType } from '../../../utils/handleTypes';

interface ProductEntry {
  product_id: string;
  handle_type?: HandleDataType;
}

const PLACEHOLDER_PRODUCT_IDS = new Set(['any_fluid', 'any_item']);

export function isPlaceholderProductId(productId: string): boolean {
  return PLACEHOLDER_PRODUCT_IDS.has(productId);
}

export function getDefaultHandleTypeForProduct(
  productId: string | null,
): HandleDataType | undefined {
  return productTypeToHandleDataType(getProduct(productId || '')?.type);
}

export function getEntryHandleType(entry: ProductEntry): HandleDataType | undefined {
  return isHandleDataType(entry.handle_type)
    ? entry.handle_type
    : getDefaultHandleTypeForProduct(entry.product_id);
}

export function isEntryHandleTypeMatch(
  entry: ProductEntry,
  expectedHandleType: HandleDataType | '' | null | undefined,
): boolean {
  if (!expectedHandleType) return true;
  return getEntryHandleType(entry) === expectedHandleType;
}

export function isPotentialHandleTypeMatch(
  selectedProductId: string | null,
  expectedHandleType: HandleDataType | '' | null | undefined,
): boolean {
  if (!expectedHandleType) return true;
  return !!selectedProductId;
}

export function isProductEntryMatch<T extends ProductEntry>(
  entry: T,
  selectedProductId: string | null,
  expectedHandleType: HandleDataType | '' | null | undefined,
): boolean {
  if (!selectedProductId) return false;

  const entryProductId = entry.product_id;
  const selectedHandleType =
    expectedHandleType || getDefaultHandleTypeForProduct(selectedProductId);
  const isProductMatch =
    entryProductId === selectedProductId ||
    (isPlaceholderProductId(entryProductId) &&
      !!selectedHandleType &&
      getEntryHandleType(entry) === selectedHandleType);

  return isProductMatch && isEntryHandleTypeMatch(entry, expectedHandleType);
}

export function findBestProductMatchIndex<T extends ProductEntry>(
  entries: readonly T[],
  selectedProductId: string | null,
  expectedHandleType?: HandleDataType | '' | null,
): number {
  if (!selectedProductId) return -1;

  let fallbackPlaceholderIndex = -1;
  const selectedHandleType =
    expectedHandleType || getDefaultHandleTypeForProduct(selectedProductId);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isEntryHandleTypeMatch(entry, expectedHandleType)) {
      continue;
    }

    if (entry.product_id === selectedProductId) {
      return i;
    }
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (
      fallbackPlaceholderIndex === -1 &&
      isPlaceholderProductId(entry.product_id) &&
      !!selectedHandleType &&
      getEntryHandleType(entry) === selectedHandleType &&
      isEntryHandleTypeMatch(entry, expectedHandleType)
    ) {
      fallbackPlaceholderIndex = i;
    }
  }

  return fallbackPlaceholderIndex;
}

export function findBestProductMatch<T extends ProductEntry>(
  entries: readonly T[],
  selectedProductId: string | null,
  expectedHandleType?: HandleDataType | '' | null,
): T | undefined {
  const index = findBestProductMatchIndex(entries, selectedProductId, expectedHandleType);
  return index === -1 ? undefined : entries[index];
}
