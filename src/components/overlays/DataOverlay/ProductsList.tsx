import { Search, Plus, X } from 'lucide-react';
import { VirtualList } from '../../shared/VirtualList';
import { getAllProducts, hasProductOverride } from '../../../data/lookup';
import type { Product } from '../../../types/data';
import { useDataStore } from '../../../stores/useDataStore';
import styles from './ProductsTab.module.css';

interface ProductsListProps {
  selectedProductId: string | null;
  onSelectProduct: (id: string | null) => void;
}

export function ProductsList({ selectedProductId, onSelectProduct }: ProductsListProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const searchQuery = useDataStore((s) => s.searchQuery);
  const setSearchQuery = useDataStore((s) => s.setSearchQuery);
  const addProduct = useDataStore((s) => s.addProduct);
  const dbVersion = useDataStore((s) => s.dbVersion);

  // 1. Gather baseline static products and apply transient merges
  // Bust React Compiler memoization by including dbVersion in the baseline lookup
  const baseline = dbVersion !== -1 ? getAllProducts() : [];
  const compiledProducts: Product[] = baseline
    .map((p) => {
      const pending = pendingEdits.products[p.id];
      if (pending) {
        if (pending._tombstone) return null;
        return { ...p, ...pending } as Product;
      }
      return p;
    })
    .filter((p): p is Product => p !== null);

  // Append newly created unsaved products
  const newProducts = Object.values(pendingEdits.products).filter(
    (p) => p._isNew && !p._tombstone
  ) as Product[];
  compiledProducts.push(...newProducts);

  // 2. Apply search text query filtering
  const query = searchQuery.toLowerCase().trim();
  const filteredProducts = compiledProducts.filter((p) => {
    if (!query) return true;
    return p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query);
  });

  // Sort alphabetically by ID
  filteredProducts.sort((a, b) => a.id.localeCompare(b.id));

  // 3. Trigger adding a new entry
  const handleAddNewProduct = () => {
    const newId = addProduct('New Product');
    onSelectProduct(newId);
  };

  return (
    <div className={styles['sidebar-pane']}>
      {/* Search and Add Toolbar */}
      <div className={styles['sidebar-toolbar']}>
        <div className={styles['search-box']}>
          <Search className={styles['search-icon']} size={14} />
          <input
            type="text"
            className={styles['search-input']}
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles['search-clear']}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={styles['btn-add-product']}
          onClick={handleAddNewProduct}
          title="Add Custom Product"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Virtual Scrollable List Container */}
      <div className={styles['list-viewport']}>
        <VirtualList
          items={filteredProducts}
          itemHeight={44}
          height={500} // Physical sidebar viewport height limit
          getKey={(p) => p.id}
        >
          {(product) => {
            const isSelected = selectedProductId === product.id;
            const isNew = pendingEdits.products[product.id]?._isNew;
            const isModified = dbVersion !== -1 ? hasProductOverride(product.id) : false;

            return (
              <div
                className={`${styles['list-item']} ${isSelected ? styles['is-selected'] : ''}`}
                data-new={isNew ? 'true' : undefined}
                data-modified={isModified ? 'true' : undefined}
                onClick={() => onSelectProduct(product.id)}
              >
                <div className={styles['item-row-header']}>
                  <div className={styles['item-name']}>{product.name}</div>
                  {isNew && <span className={styles['badge-new']}>New</span>}
                  {isModified && <span className={styles['badge-modified']}>Edited</span>}
                </div>
                <div className={styles['item-id']}>{product.id}</div>
              </div>
            );
          }}
        </VirtualList>
      </div>
    </div>
  );
}
