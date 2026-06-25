import { useEffect, type RefObject } from 'react';
import { X, Package, Droplet } from 'lucide-react';
import type { Product, Machine } from '../../../types/data';
import { SortableSelectorTable, type ColumnConfig } from '../../shared/SortableSelectorTable';
import { PRODUCT_TABLE_VIEW_HEIGHT, MACHINE_TABLE_VIEW_HEIGHT } from '../../shared/layoutConstants';
import { getAllMachines, getAllProducts, isMachineUnlocked } from '../../../data/lookup';
import { sortItems } from '../../../utils/sorting';
import {
  CANONICAL_CATEGORY_MAP,
  UNIQUE_CATEGORIES,
  UNIQUE_SUBCATEGORIES,
  getTaxonomyIcon,
  buildVirtualModularMachines,
} from '../../../utils/machineTaxonomy';
import styles from './RecipeSelector.module.css';
import { formatCurrency, formatRpMultiplier, toRomanNumeral } from '../../../utils/unitFormatting';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useRecipeSelectorStore } from './RecipeSelectorContext';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';

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
        <span
          className={`${styles['cell-ellipsis-text']} ${p.type === 'Fluid' ? styles['fluid-text'] : styles['item-text']}`}
        >
          {p.name}
        </span>
      </div>
    ),
  },
  {
    field: 'sell_price',
    label: 'Sell Price',
    widthClass: 'col-25',
    renderCell: (p) => (
      <span className={p.sell_price < 0 ? styles['sell-price-negative'] : (p.profit ? styles['sell-price-profit'] : '')}>
        {formatCurrency(p.sell_price)}
      </span>
    ),
  },
  {
    field: 'rp_multiplier',
    label: 'RP Multiplier',
    widthClass: 'col-25',
    renderCell: (p) => (
      <span className={p.research ? styles['rp-mult-research'] : ''}>
        {formatRpMultiplier(p.rp_multiplier)}
      </span>
    ),
  },
];

const MACHINE_COLUMNS: ColumnConfig<Machine, 'name' | 'cost'>[] = [
  {
    field: 'name',
    label: 'Name',
    widthClass: 'col-70',
    renderCell: (m) => {
      const SubIcon = getTaxonomyIcon(m.category, m.subcategory);
      const tierClass = styles[`tier-${m.tier}`] || '';
      return (
        <div className={`${styles['cell-flex-container']} ${tierClass}`}>
          <span className={styles['tier-badge']}>{toRomanNumeral(m.tier)}</span>
          <SubIcon size={14} className={styles['machine-subicon']} />
          <span className={styles['machine-name-text']}>{m.name}</span>
        </div>
      );
    },
  },
  {
    field: 'cost',
    label: 'Machine Cost',
    widthClass: 'col-30',
    renderCell: (m) => formatCurrency(m.cost),
  },
];

import { useShallow } from 'zustand/react/shallow';

interface SelectionStageProps {
  inputRef: RefObject<HTMLInputElement | null>;
}

export function SelectionStage({ inputRef }: SelectionStageProps) {
  const dbVersion = useDataStore((s) => s.dbVersion);
  const staticMachines = dbVersion !== -1 ? getAllMachines() : [];
  const uniqueTiers = Array.from(new Set(staticMachines.map((m) => m.tier))).sort((a, b) => a - b);

  const {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    clearSearch,
    productTypeFilter,
    setProductTypeFilter,
    machineTierFilter,
    setMachineTierFilter,
    machineCategoryFilter,
    setMachineCategoryFilter,
    machineSubcategoryFilter,
    setMachineSubcategoryFilter,
  } = useRecipeSelectorStore(
    useShallow((s) => ({
      activeTab: s.activeTab,
      setActiveTab: s.setActiveTab,
      searchQuery: s.searchQuery,
      setSearchQuery: s.setSearchQuery,
      debouncedSearch: s.debouncedSearch,
      clearSearch: s.clearSearch,
      productTypeFilter: s.productTypeFilter,
      setProductTypeFilter: s.setProductTypeFilter,
      machineTierFilter: s.machineTierFilter,
      setMachineTierFilter: s.setMachineTierFilter,
      machineCategoryFilter: s.machineCategoryFilter,
      setMachineCategoryFilter: s.setMachineCategoryFilter,
      machineSubcategoryFilter: s.machineSubcategoryFilter,
      setMachineSubcategoryFilter: s.setMachineSubcategoryFilter,
    })),
  );

  const setRecipeSelectorOpen = useUIStore((s) => s.setRecipeSelectorOpen);

  useEffect(() => {
    if (!isTutorialActive()) return;
    const action = useTutorialStore.getState().getCurrentStep()?.action;
    if (action?.type !== 'selector-search') return;
    completeTutorialAction({ type: 'selector-search', query: debouncedSearch });
  }, [debouncedSearch]);

  const availableSubcategories =
    machineCategoryFilter === 'All'
      ? UNIQUE_SUBCATEGORIES
      : (CANONICAL_CATEGORY_MAP[machineCategoryFilter] || []).slice().sort();

  const handleClose = () => {
    if (isTutorialActive()) return;
    setRecipeSelectorOpen(false);
  };

  const handleProductTab = () => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'selector-tab', tab: 'product' })) {
      return;
    }
    setActiveTab('product');
    clearSearch();
    completeTutorialAction({ type: 'selector-tab', tab: 'product' });
  };

  const handleMachineTab = () => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'selector-tab', tab: 'machine' })) {
      return;
    }
    setActiveTab('machine');
    clearSearch();
    completeTutorialAction({ type: 'selector-tab', tab: 'machine' });
  };

  const handleSearchChange = (value: string) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'selector-search') return;
    }
    setSearchQuery(value);
  };

  return (
    <>
      <div className={styles['recipe-selector-header']}>
        <div className={styles['recipe-selector-tabs']}>
          <button
            className={`${styles['recipe-selector-tab']} ${activeTab === 'product' ? styles['is-active'] : ''}`}
            onClick={handleProductTab}
            data-tutorial-selector-tab="product"
          >
            Search by Product
          </button>
          <button
            className={`${styles['recipe-selector-tab']} ${activeTab === 'machine' ? styles['is-active'] : ''}`}
            onClick={handleMachineTab}
            data-tutorial-selector-tab="machine"
          >
            Search by Machine
          </button>
        </div>
        <button
          className={styles['recipe-selector-close']}
          onClick={handleClose}
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
              onChange={(e) => handleSearchChange(e.target.value)}
              data-tutorial-selector-search="product"
            />
            {searchQuery && (
              <button
                className={styles['recipe-selector-search-clear']}
                onClick={() => {
                  if (isTutorialActive()) return;
                  clearSearch();
                }}
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
              onChange={(e) => {
                if (isTutorialActive()) return;
                setProductTypeFilter(e.target.value as 'All' | 'Item' | 'Fluid');
              }}
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
                onChange={(e) => handleSearchChange(e.target.value)}
                data-tutorial-selector-search="machine"
              />
              {searchQuery && (
                <button
                  className={styles['recipe-selector-search-clear']}
                  onClick={() => {
                    if (isTutorialActive()) return;
                    clearSearch();
                  }}
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
                onChange={(e) => {
                  if (isTutorialActive()) return;
                  setMachineTierFilter(e.target.value);
                }}
              >
                <option value="All">All Tiers</option>
                {uniqueTiers.map((t) => (
                  <option key={t} value={t}>
                    Tier {toRomanNumeral(t)}
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
                  if (isTutorialActive()) return;
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

            <div className={styles['recipe-selector-select-wrapper']}>
              <label className={styles['recipe-selector-filter-label']}>Subcategory:</label>
              <select
                className={styles['recipe-selector-select']}
                value={machineSubcategoryFilter}
                onChange={(e) => {
                  if (isTutorialActive()) return;
                  setMachineSubcategoryFilter(e.target.value);
                }}
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
        {activeTab === 'product' ? <ProductList /> : <MachineList />}
      </div>
    </>
  );
}

function ProductList() {
  const dbVersion = useDataStore((s) => s.dbVersion);
  const {
    debouncedSearch,
    productTypeFilter,
    productSortField,
    productSortOrder,
    handleProductSort,
    handleSelectItem,
  } = useRecipeSelectorStore(
    useShallow((s) => ({
      debouncedSearch: s.debouncedSearch,
      productTypeFilter: s.productTypeFilter,
      productSortField: s.productSortField,
      productSortOrder: s.productSortOrder,
      handleProductSort: s.handleProductSort,
      handleSelectItem: s.handleSelectItem,
    })),
  );

  let list = dbVersion !== -1 ? getAllProducts() : [];

  if (debouncedSearch.trim()) {
    const q = debouncedSearch.toLowerCase().trim();
    list = list.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (productTypeFilter !== 'All') {
    list = list.filter((p) => p.type === productTypeFilter);
  }

  const filteredProducts = sortItems(list, productSortField, productSortOrder);

  const handleProductSelect = (id: string) => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'selector-product', productId: id })) {
      return;
    }
    handleSelectItem(id);
    completeTutorialAction({ type: 'selector-product', productId: id });
  };

  return (
    <SortableSelectorTable
      items={filteredProducts}
      columns={PRODUCT_COLUMNS}
      sortField={productSortField}
      sortOrder={productSortOrder}
      onSort={(field) => {
        if (isTutorialActive()) return;
        handleProductSort(field);
      }}
      onSelectItem={handleProductSelect}
      emptyMessage="No products match your criteria."
      height={PRODUCT_TABLE_VIEW_HEIGHT}
      getRowProps={(product) => ({ 'data-tutorial-product-row': product.id })}
    />
  );
}

function MachineList() {
  const dbVersion = useDataStore((s) => s.dbVersion);
  const {
    debouncedSearch,
    machineTierFilter,
    machineCategoryFilter,
    machineSubcategoryFilter,
    machineSortField,
    machineSortOrder,
    handleMachineSort,
    handleSelectItem,
  } = useRecipeSelectorStore(
    useShallow((s) => ({
      debouncedSearch: s.debouncedSearch,
      machineTierFilter: s.machineTierFilter,
      machineCategoryFilter: s.machineCategoryFilter,
      machineSubcategoryFilter: s.machineSubcategoryFilter,
      machineSortField: s.machineSortField,
      machineSortOrder: s.machineSortOrder,
      handleMachineSort: s.handleMachineSort,
      handleSelectItem: s.handleSelectItem,
    })),
  );

  const unlockedResearchIdsArray = useGlobalSettingsStore((s) => s.settings.unlockedResearchIds);
  const unlockedResearchIds = new Set(unlockedResearchIdsArray);
  const oreNodesEnabled = useGlobalSettingsStore((s) => s.settings.oreNodesEnabled);
  const showVariantLimited = useGlobalSettingsStore((s) => s.settings.showVariantLimited);
  const difficulty = useGlobalSettingsStore((s) => s.settings.difficulty);

  let list = dbVersion !== -1 ? getAllMachines() : [];

  const allMachines = list;
  list = list.filter((m) => m.category !== 'Modular');

  const virtualModularMachines = buildVirtualModularMachines(allMachines);
  list = [...list, ...virtualModularMachines];

  list = list.filter((m) => {
    if (!isMachineUnlocked(m, unlockedResearchIds)) {
      return false;
    }
    if (m.id === 'm_industrial_drill' && !oreNodesEnabled) {
      return false;
    }
    const isSandboxMode = difficulty === 'sandbox' || difficulty === 'sandbox_plus';
    const isSandboxPlus = difficulty === 'sandbox_plus';
    if (m.sandboxPlusOnly && !isSandboxPlus) {
      return false;
    }
    if (m.sandboxOnly && !isSandboxMode) {
      return false;
    }
    const isVariant = m.variant && m.variant !== 'none' && m.variant !== '';
    const isLimited = m.limited;
    if (!showVariantLimited && (isVariant || isLimited)) {
      return false;
    }
    return true;
  });

  if (debouncedSearch.trim()) {
    const q = debouncedSearch.toLowerCase().trim();
    list = list.filter((m) => m.name.toLowerCase().includes(q));
  }

  if (machineTierFilter !== 'All') {
    const tNum = parseInt(machineTierFilter, 10);
    list = list.filter((m) => m.tier === tNum);
  }

  if (machineCategoryFilter !== 'All') {
    list = list.filter((m) => m.category === machineCategoryFilter);
  }

  if (machineSubcategoryFilter !== 'All') {
    list = list.filter((m) => m.subcategory === machineSubcategoryFilter);
  }

  const filteredMachines = sortItems(list, machineSortField, machineSortOrder);

  return (
    <SortableSelectorTable
      items={filteredMachines}
      columns={MACHINE_COLUMNS}
      sortField={machineSortField}
      sortOrder={machineSortOrder}
      onSort={(field) => {
        if (isTutorialActive()) return;
        handleMachineSort(field);
      }}
      onSelectItem={(id) => {
        if (isTutorialActive()) return;
        handleSelectItem(id);
      }}
      emptyMessage="No machines match your criteria."
      height={MACHINE_TABLE_VIEW_HEIGHT}
    />
  );
}
