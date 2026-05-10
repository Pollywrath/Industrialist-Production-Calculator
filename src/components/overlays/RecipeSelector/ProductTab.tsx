import type { Product } from '../../../types/data';
import { Package, Droplet } from 'lucide-react';
import { SortableSelectorTable, type ColumnConfig } from '../../shared/SortableSelectorTable';
import { PRODUCT_TABLE_VIEW_HEIGHT } from '../../shared/layoutConstants';
import { getAllProducts } from '../../../data/lookup';
import { sortItems } from '../../../utils/sorting';
import useControlStore from '../../../stores/useControlStore';
import styles from './RecipeSelector.module.css';

const PRODUCT_COLUMNS: ColumnConfig<Product, 'name' | 'sell_price' | 'rp_multiplier'>[] = [
  {
    field: 'name',
    label: 'Name',
    widthClass: 'col-50',
    renderCell: (p) => (
      <div className={styles['cell-flex-container']}>
        {p.type === 'Fluid' ? (
          <Droplet size={14} className={styles['fluid-icon']} />
        ) : (
          <Package size={14} className={styles['item-icon']} />
        )}
        <span className={styles['cell-ellipsis-text']}>{p.name}</span>
      </div>
    ),
  },
  {
    field: 'sell_price',
    label: 'Sell Price',
    widthClass: 'col-25',
    renderCell: (p) => p.sell_price,
  },
  {
    field: 'rp_multiplier',
    label: 'RP Multiplier',
    widthClass: 'col-25',
    renderCell: (p) => p.rp_multiplier,
  },
];

export default function ProductTab() {
  const debouncedSearch = useControlStore((s) => s.selectorDebouncedSearch);
  const productTypeFilter = useControlStore((s) => s.selectorProductTypeFilter);
  const productSortField = useControlStore((s) => s.selectorProductSortField);
  const productSortOrder = useControlStore((s) => s.selectorProductSortOrder);

  const setProductSortField = useControlStore((s) => s.setSelectorProductSortField);
  const setProductSortOrder = useControlStore((s) => s.setSelectorProductSortOrder);

  const setStage = useControlStore((s) => s.setSelectorStage);
  const setSelectedId = useControlStore((s) => s.setSelectorSelectedId);
  const setFilterProducers = useControlStore((s) => s.setSelectorFilterProducers);
  const setFilterConsumers = useControlStore((s) => s.setSelectorFilterConsumers);

  const handleProductSort = (field: 'name' | 'sell_price' | 'rp_multiplier') => {
    if (productSortField === field) {
      setProductSortOrder(productSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setProductSortField(field);
      setProductSortOrder('asc');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setStage('recipes');
    setFilterProducers(true);
    setFilterConsumers(true);
  };

  let list = getAllProducts();

  if (debouncedSearch.trim()) {
    const q = debouncedSearch.toLowerCase().trim();
    list = list.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (productTypeFilter !== 'All') {
    list = list.filter((p) => p.type === productTypeFilter);
  }

  const filteredProducts = sortItems(list, productSortField, productSortOrder);

  return (
    <SortableSelectorTable
      items={filteredProducts}
      columns={PRODUCT_COLUMNS}
      sortField={productSortField}
      sortOrder={productSortOrder}
      onSort={handleProductSort}
      onSelectItem={handleSelectItem}
      emptyMessage="No products match your criteria."
      height={PRODUCT_TABLE_VIEW_HEIGHT}
    />
  );
}
export type { Product };
