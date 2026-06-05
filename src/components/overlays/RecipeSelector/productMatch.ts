import { getProduct } from '../../../data/lookup';

interface ProductEntry {
  product_id: string;
}

const PLACEHOLDER_PRODUCT_IDS = new Set(['any_fluid', 'any_item']);

export function isPlaceholderProductId(productId: string): boolean {
  return PLACEHOLDER_PRODUCT_IDS.has(productId);
}

export function findBestProductMatchIndex<T extends ProductEntry>(
  entries: readonly T[],
  selectedProductId: string | null,
): number {
  if (!selectedProductId) return -1;

  const selectedProductType = getProduct(selectedProductId)?.type;
  let fallbackPlaceholderIndex = -1;

  for (let i = 0; i < entries.length; i++) {
    const entryProductId = entries[i].product_id;
    if (entryProductId === selectedProductId) {
      return i;
    }

    if (fallbackPlaceholderIndex === -1 && isPlaceholderProductId(entryProductId)) {
      const entryProductType = getProduct(entryProductId)?.type;
      if (entryProductType === selectedProductType) {
        fallbackPlaceholderIndex = i;
      }
    }
  }

  return fallbackPlaceholderIndex;
}

export function findBestProductMatch<T extends ProductEntry>(
  entries: readonly T[],
  selectedProductId: string | null,
): T | undefined {
  const index = findBestProductMatchIndex(entries, selectedProductId);
  return index === -1 ? undefined : entries[index];
}
