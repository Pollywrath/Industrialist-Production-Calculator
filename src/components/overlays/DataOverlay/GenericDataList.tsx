import { Search, Plus, X } from 'lucide-react';
import { VirtualList } from '../../shared/VirtualList';
import {
  getAllProducts,
  getAllMachines,
  getAllResearches,
  hasProductOverride,
  hasMachineOverride,
  hasResearchOverride,
  isBaselineProduct,
  isBaselineMachine,
  isBaselineResearch,
} from '../../../data/lookup';
import type { Product, Machine, Research } from '../../../types/data';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import styles from './DataCrud.module.css';

interface GenericDataListProps {
  type: 'product' | 'machine' | 'research';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

type DataEntity = Product | Machine | Research;

export function GenericDataList({ type, selectedId, onSelect }: GenericDataListProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const searchQuery = useDataStore((s) => s.searchQuery);
  const setSearchQuery = useDataStore((s) => s.setSearchQuery);
  const customOnly = useDataStore((s) => s.customOnly);
  const setCustomOnly = useDataStore((s) => s.setCustomOnly);
  const addProduct = useDataStore((s) => s.addProduct);
  const addMachine = useDataStore((s) => s.addMachine);
  const addResearch = useDataStore((s) => s.addResearch);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const baseline =
    dbVersion !== -1
      ? type === 'product'
        ? getAllProducts()
        : type === 'machine'
          ? getAllMachines()
          : getAllResearches()
      : [];

  const pendingSubset =
    type === 'product'
      ? pendingEdits.products
      : type === 'machine'
        ? pendingEdits.machines
        : pendingEdits.researches;

  const compiledItems: DataEntity[] = baseline
    .map((item) =>
      overlayPendingEdit(
        item,
        pendingSubset[item.id] as Partial<typeof item> & { _tombstone?: boolean; _isNew?: boolean },
      ),
    )
    .filter((item): item is DataEntity => item !== null);

  const newItems = Object.values(pendingSubset).filter(
    (item) => item._isNew && !item._tombstone,
  ) as DataEntity[];
  compiledItems.push(...newItems);

  let displayItems = compiledItems;
  if (customOnly) {
    displayItems = compiledItems.filter((item) => {
      const isSavedNew =
        type === 'product'
          ? !isBaselineProduct(item.id)
          : type === 'machine'
            ? !isBaselineMachine(item.id)
            : !isBaselineResearch(item.id);
      const isNew = !!(pendingSubset[item.id]?._isNew || isSavedNew);
      const isPending = !!(
        pendingSubset[item.id] &&
        !pendingSubset[item.id]?._isNew &&
        !pendingSubset[item.id]?._tombstone
      );
      const isModified =
        dbVersion !== -1
          ? type === 'product'
            ? hasProductOverride(item.id)
            : type === 'machine'
              ? hasMachineOverride(item.id)
              : hasResearchOverride(item.id)
          : false;

      return isNew || isPending || isModified;
    });
  }

  const query = searchQuery.toLowerCase().trim();
  const filteredItems = displayItems.filter((item) => {
    if (!query) return true;
    return item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  });

  filteredItems.sort((a, b) => a.id.localeCompare(b.id));

  const handleAddNew = () => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-add', entity: type })) {
      return;
    }
    const newId =
      type === 'product'
        ? addProduct('New Product')
        : type === 'machine'
          ? addMachine('New Machine')
          : addResearch('New Research');
    onSelect(newId);
    completeTutorialAction({ type: 'data-add', entity: type, id: newId });
  };

  const handleSearchChange = (value: string) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'data-search' || action.entity !== type) return;
    }
    setSearchQuery(value);
    completeTutorialAction({ type: 'data-search', entity: type, query: value });
  };

  const handleSelect = (id: string) => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-select', entity: type, id })) {
      return;
    }
    onSelect(id);
    completeTutorialAction({ type: 'data-select', entity: type, id });
  };

  const labelPlural =
    type === 'product' ? 'products' : type === 'machine' ? 'machines' : 'researches';
  const labelSingle = type === 'product' ? 'Product' : type === 'machine' ? 'Machine' : 'Research';

  return (
    <div className={styles['sidebar-pane']}>
      <div className={styles['sidebar-filter-header']}>
        <label className={styles['sidebar-filter-label']}>
          <input
            type="checkbox"
            className={styles['form-checkbox']}
            checked={customOnly}
            onChange={(e) => {
              if (isTutorialActive()) return;
              setCustomOnly(e.target.checked);
            }}
          />
          <span>Show Custom Only</span>
        </label>
      </div>
      <div className={styles['sidebar-toolbar']}>
        <div className={styles['search-box']}>
          <Search className={styles['search-icon']} size={14} />
          <input
            type="text"
            className={styles['search-input']}
            placeholder={`Search ${labelPlural}...`}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-tutorial-data-search={type}
          />
          {searchQuery && (
            <button
              className={styles['search-clear']}
              onClick={() => {
                if (isTutorialActive()) return;
                setSearchQuery('');
              }}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={styles['btn-add']}
          onClick={handleAddNew}
          title={`Add Custom ${labelSingle}`}
          data-tutorial-data-add={type}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={styles['list-viewport']}>
        <VirtualList items={filteredItems} itemHeight={44} height={460} getKey={(item) => item.id}>
          {(item) => {
            const isSelected = selectedId === item.id;
            const isSavedNew =
              type === 'product'
                ? !isBaselineProduct(item.id)
                : type === 'machine'
                  ? !isBaselineMachine(item.id)
                  : !isBaselineResearch(item.id);
            const isNew = !!(pendingSubset[item.id]?._isNew || isSavedNew);
            const isPending = !!(
              pendingSubset[item.id] &&
              !pendingSubset[item.id]?._isNew &&
              !pendingSubset[item.id]?._tombstone
            );
            const isModified =
              dbVersion !== -1
                ? type === 'product'
                  ? hasProductOverride(item.id)
                  : type === 'machine'
                    ? hasMachineOverride(item.id)
                    : hasResearchOverride(item.id)
                : false;

            return (
              <div
                className={`${styles['list-item']} ${isSelected ? styles['is-selected'] : ''}`}
                data-new={isNew ? 'true' : undefined}
                data-modified={isModified ? 'true' : undefined}
                data-pending={isPending ? 'true' : undefined}
                data-tutorial-data-row={`${type}:${item.id}`}
                onClick={() => handleSelect(item.id)}
              >
                <div className={styles['item-row-header']}>
                  <div className={styles['item-name']}>{item.name}</div>
                  {isNew && <span className={styles['badge-new']}>New</span>}
                  {isPending && <span className={styles['badge-pending']}>Pending</span>}
                  {isModified && !isPending && (
                    <span className={styles['badge-modified']}>Edited</span>
                  )}
                </div>
                <div className={styles['item-meta'] || ''}>
                  <div className={styles['item-id']}>{item.id}</div>
                </div>
              </div>
            );
          }}
        </VirtualList>
      </div>
    </div>
  );
}
