import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { getAllMachines } from '../../../data/lookup';
import {
  CANONICAL_CATEGORY_MAP,
  UNIQUE_CATEGORIES,
  UNIQUE_SUBCATEGORIES,
} from '../../../utils/machineTaxonomy';
import ProductTab from './ProductTab';
import MachineTab from './MachineTab';
import styles from './RecipeSelector.module.css';
import useControlStore from '../../../stores/useControlStore';

const staticMachines = getAllMachines();
const uniqueTiers = Array.from(new Set(staticMachines.map((m) => m.tier))).sort((a, b) => a - b);

interface SelectionStageProps {
  inputRef: RefObject<HTMLInputElement | null>;
}

export default function SelectionStage({ inputRef }: SelectionStageProps) {
  const activeTab = useControlStore((s) => s.selectorActiveTab);
  const setActiveTab = useControlStore((s) => s.setSelectorActiveTab);

  const searchQuery = useControlStore((s) => s.selectorSearchQuery);
  const setSearchQuery = useControlStore((s) => s.setSelectorSearchQuery);

  const productTypeFilter = useControlStore((s) => s.selectorProductTypeFilter);
  const setProductTypeFilter = useControlStore((s) => s.setSelectorProductTypeFilter);

  const machineTierFilter = useControlStore((s) => s.selectorMachineTierFilter);
  const setMachineTierFilter = useControlStore((s) => s.setSelectorMachineTierFilter);

  const machineCategoryFilter = useControlStore((s) => s.selectorMachineCategoryFilter);
  const setMachineCategoryFilter = useControlStore((s) => s.setSelectorMachineCategoryFilter);

  const machineSubcategoryFilter = useControlStore((s) => s.selectorMachineSubcategoryFilter);
  const setMachineSubcategoryFilter = useControlStore((s) => s.setSelectorMachineSubcategoryFilter);

  const setRecipeSelectorOpen = useControlStore((s) => s.setRecipeSelectorOpen);

  const clearSearch = () => {
    setSearchQuery('');
    useControlStore.getState().setSelectorDebouncedSearch('');
  };

  const availableSubcategories =
    machineCategoryFilter === 'All'
      ? UNIQUE_SUBCATEGORIES
      : (CANONICAL_CATEGORY_MAP[machineCategoryFilter] || []).slice().sort();

  return (
    <>
      <div className={styles['recipe-selector-header']}>
        <div className={styles['recipe-selector-tabs']}>
          <button
            className={`${styles['recipe-selector-tab']} ${activeTab === 'product' ? styles['is-active'] : ''}`}
            onClick={() => {
              setActiveTab('product');
              clearSearch();
            }}
          >
            Search by Product
          </button>
          <button
            className={`${styles['recipe-selector-tab']} ${activeTab === 'machine' ? styles['is-active'] : ''}`}
            onClick={() => {
              setActiveTab('machine');
              clearSearch();
            }}
          >
            Search by Machine
          </button>
        </div>
        <button
          className={styles['recipe-selector-close']}
          onClick={() => setRecipeSelectorOpen(false)}
          title="Close selector"
        >
          <X size={16} />
        </button>
      </div>

      {activeTab === 'product' ? (
        <div className={styles['recipe-selector-filter-row']}>
          <div className={styles['recipe-selector-search-box-stage1']}>
            <input
              ref={inputRef}
              type="text"
              className={styles['recipe-selector-input']}
              placeholder="Search products by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className={styles['recipe-selector-search-clear']}
                onClick={clearSearch}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className={styles['recipe-selector-dropdown-group']}>
            <label className={styles['recipe-selector-filter-label']}>Type:</label>
            <select
              className={styles['recipe-selector-select']}
              value={productTypeFilter}
              onChange={(e) =>
                setProductTypeFilter(e.target.value as 'All' | 'Item' | 'Fluid')
              }
            >
              <option value="All">All Types</option>
              <option value="Item">Item</option>
              <option value="Fluid">Fluid</option>
            </select>
          </div>
        </div>
      ) : (
        <>
          <div className={styles['recipe-selector-filter-row']}>
            <div className={styles['recipe-selector-search-box-stage1']}>
              <input
                ref={inputRef}
                type="text"
                className={styles['recipe-selector-input']}
                placeholder="Search machines by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className={styles['recipe-selector-search-clear']}
                  onClick={clearSearch}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div
            className={`${styles['recipe-selector-filter-row']} ${styles['secondary-filter-row']}`}
          >
            <div className={styles['recipe-selector-select-wrapper']}>
              <label className={styles['recipe-selector-filter-label']}>Tier:</label>
              <select
                className={styles['recipe-selector-select']}
                value={machineTierFilter}
                onChange={(e) => setMachineTierFilter(e.target.value)}
              >
                <option value="All">All Tiers</option>
                {uniqueTiers.map((t) => (
                  <option key={t} value={t}>
                    Tier {t}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['recipe-selector-select-wrapper']}>
              <label className={styles['recipe-selector-filter-label']}>Category:</label>
              <select
                className={styles['recipe-selector-select']}
                value={machineCategoryFilter}
                onChange={(e) => {
                  const newCat = e.target.value;
                  setMachineCategoryFilter(newCat);
                  if (newCat !== 'All') {
                    const allowedSubs = CANONICAL_CATEGORY_MAP[newCat] || [];
                    const subsSet = new Set(allowedSubs);
                    if (!subsSet.has(machineSubcategoryFilter)) {
                      setMachineSubcategoryFilter('All');
                    }
                  }
                }}
              >
                <option value="All">All Categories</option>
                {UNIQUE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={styles['recipe-selector-select-wrapper']}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <label className={styles['recipe-selector-filter-label']}>Subcategory:</label>
              <select
                className={styles['recipe-selector-select']}
                value={machineSubcategoryFilter}
                onChange={(e) => setMachineSubcategoryFilter(e.target.value)}
              >
                <option value="All">All Subcategories</option>
                {availableSubcategories.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <div className={styles['recipe-selector-table-container']}>
        {activeTab === 'product' ? (
          <ProductTab />
        ) : (
          <MachineTab />
        )}
      </div>
    </>
  );
}
