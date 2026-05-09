import type { Product } from '../../../types/data';
import { Package, Droplet } from 'lucide-react';
import VirtualList from '../../shared/VirtualList';
import styles from './RecipeSelector.module.css';

interface ProductTabProps {
  filteredProducts: Product[];
  productSortField: 'name' | 'sell_price' | 'rp_multiplier';
  productSortOrder: 'asc' | 'desc';
  onProductSort: (field: 'name' | 'sell_price' | 'rp_multiplier') => void;
  onSelectItem: (id: string) => void;
}

function SortIndicator({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  return (
    <span className={styles['sort-indicator']}>
      <span className={`${styles['sort-arrow']} ${active && order === 'asc' ? styles['is-active'] : ''}`}>▲</span>
      <span className={`${styles['sort-arrow']} ${active && order === 'desc' ? styles['is-active'] : ''}`}>▼</span>
    </span>
  );
}

export default function ProductTab({
  filteredProducts,
  productSortField,
  productSortOrder,
  onProductSort,
  onSelectItem,
}: ProductTabProps) {
  return (
    <>
      <div className={styles['recipe-selector-table-header-wrapper']}>
        <table className={`${styles['recipe-selector-table']} ${styles['fixed-table']}`}>
          <thead>
            <tr>
              <th
                className={`${styles['sortable-header']} ${styles['text-center']} ${styles['col-50']}`}
                onClick={() => onProductSort('name')}
              >
                Name <SortIndicator active={productSortField === 'name'} order={productSortOrder} />
              </th>
              <th
                className={`${styles['sortable-header']} ${styles['text-center']} ${styles['col-25']}`}
                onClick={() => onProductSort('sell_price')}
              >
                Sell Price{' '}
                <SortIndicator
                  active={productSortField === 'sell_price'}
                  order={productSortOrder}
                />
              </th>
              <th
                className={`${styles['sortable-header']} ${styles['text-center']} ${styles['col-25']}`}
                onClick={() => onProductSort('rp_multiplier')}
              >
                RP Multiplier{' '}
                <SortIndicator
                  active={productSortField === 'rp_multiplier'}
                  order={productSortOrder}
                />
              </th>
            </tr>
          </thead>
        </table>
      </div>
      {filteredProducts.length === 0 ? (
        <div className={styles['table-empty']}>No products match your criteria.</div>
      ) : (
        <VirtualList items={filteredProducts} itemHeight={45} height={480} overscan={5}>
          {(p) => (
            <table className={`${styles['recipe-selector-table']} ${styles['fixed-table']}`}>
              <tbody>
                <tr onClick={() => onSelectItem(p.id)} className={styles['clickable-row']}>
                  <td className={styles['col-50']}>
                    <div className={styles['cell-flex-container']}>
                      {p.type === 'Fluid' ? (
                        <Droplet size={14} className={styles['fluid-icon']} />
                      ) : (
                        <Package size={14} className={styles['item-icon']} />
                      )}
                      <span className={styles['cell-ellipsis-text']}>{p.name}</span>
                    </div>
                  </td>
                  <td className={`${styles['text-center']} ${styles['col-25']}`}>
                    {p.sell_price}
                  </td>
                  <td className={`${styles['text-center']} ${styles['col-25']}`}>
                    {p.rp_multiplier}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </VirtualList>
      )}
    </>
  );
}
