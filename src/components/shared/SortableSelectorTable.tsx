import type { ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import VirtualList from './VirtualList';
import styles from '../overlays/RecipeSelector/RecipeSelector.module.css';

interface SortIndicatorProps {
  active: boolean;
  order: 'asc' | 'desc';
}

function SortIndicator({ active, order }: SortIndicatorProps) {
  return (
    <span className={styles['sort-indicator']} style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'middle', marginLeft: '4px', lineHeight: 1 }}>
      <span
        className={`${styles['sort-arrow']} ${active && order === 'asc' ? styles['is-active'] : ''}`}
        style={{ height: '5px', display: 'flex', alignItems: 'center' }}
      >
        <ChevronUp size={8} />
      </span>
      <span
        className={`${styles['sort-arrow']} ${active && order === 'desc' ? styles['is-active'] : ''}`}
        style={{ height: '5px', display: 'flex', alignItems: 'center', marginTop: '2px' }}
      >
        <ChevronDown size={8} />
      </span>
    </span>
  );
}

export interface ColumnConfig<T, K extends string> {
  field: K;
  label: string;
  widthClass: string;
  renderCell: (item: T) => ReactNode;
}

interface SortableSelectorTableProps<T extends { id: string }, K extends string> {
  items: T[];
  columns: ColumnConfig<T, K>[];
  sortField: K;
  sortOrder: 'asc' | 'desc';
  onSort: (field: K) => void;
  onSelectItem: (id: string) => void;
  emptyMessage: string;
  height?: number;
}

export function SortableSelectorTable<T extends { id: string }, K extends string>({
  items,
  columns,
  sortField,
  sortOrder,
  onSort,
  onSelectItem,
  emptyMessage,
  height = 450,
}: SortableSelectorTableProps<T, K>) {
  return (
    <>
      <div className={styles['recipe-selector-table-header-wrapper']}>
        <div className={styles['recipe-selector-header-row']}>
          {columns.map((col) => (
            <div
              key={col.field}
              className={`${styles['sortable-header']} ${styles['header-cell']} ${styles[col.widthClass]}`}
              onClick={() => onSort(col.field)}
            >
              {col.label} <SortIndicator active={sortField === col.field} order={sortOrder} />
            </div>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <div className={styles['table-empty']}>{emptyMessage}</div>
      ) : (
        <VirtualList items={items} itemHeight={45} height={height} overscan={5} getKey={(item) => item.id}>
          {(item) => (
            <div
              onClick={() => onSelectItem(item.id)}
              className={`${styles['recipe-selector-row']} ${styles['clickable-row']}`}
            >
              {columns.map((col, index) => {
                const isFirst = index === 0;
                const cellClass = `${styles['cell-item']} ${isFirst ? '' : styles['text-center']} ${styles[col.widthClass]}`.trim();
                return (
                  <div key={col.field} className={cellClass}>
                    {col.renderCell(item)}
                  </div>
                );
              })}
            </div>
          )}
        </VirtualList>
      )}
    </>
  );
}
