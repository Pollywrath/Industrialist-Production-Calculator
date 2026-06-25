import type { StoreApi } from 'zustand';
import type { RecipeSelectorState } from './RecipeSelectorContext';
import { getProduct } from '../../../data/lookup';

export type RecipeSelectorTutorialSnapshot = Pick<
  RecipeSelectorState,
  | 'stage'
  | 'selectedId'
  | 'activeTab'
  | 'searchQuery'
  | 'debouncedSearch'
  | 'productSortField'
  | 'productSortOrder'
  | 'machineSortField'
  | 'machineSortOrder'
  | 'productTypeFilter'
  | 'machineTierFilter'
  | 'machineCategoryFilter'
  | 'machineSubcategoryFilter'
  | 'filterProducers'
  | 'filterConsumers'
  | 'filterSellTrash'
  | 'filterHeatPower'
>;

let activeStore: StoreApi<RecipeSelectorState> | null = null;
let pendingSnapshot: RecipeSelectorTutorialSnapshot | null = null;

function toSnapshot(state: RecipeSelectorState): RecipeSelectorTutorialSnapshot {
  return {
    stage: state.stage,
    selectedId: state.selectedId,
    activeTab: state.activeTab,
    searchQuery: state.searchQuery,
    debouncedSearch: state.debouncedSearch,
    productSortField: state.productSortField,
    productSortOrder: state.productSortOrder,
    machineSortField: state.machineSortField,
    machineSortOrder: state.machineSortOrder,
    productTypeFilter: state.productTypeFilter,
    machineTierFilter: state.machineTierFilter,
    machineCategoryFilter: state.machineCategoryFilter,
    machineSubcategoryFilter: state.machineSubcategoryFilter,
    filterProducers: state.filterProducers,
    filterConsumers: state.filterConsumers,
    filterSellTrash: state.filterSellTrash,
    filterHeatPower: state.filterHeatPower,
  };
}

export function createInitialRecipeSelectorTutorialSnapshot(
  preselectedProductId: string | null,
  preselectedSourceSide: 'input' | 'output' | null,
): RecipeSelectorTutorialSnapshot {
  return {
    stage: preselectedProductId ? 'recipes' : 'select',
    selectedId: preselectedProductId,
    activeTab: 'product',
    searchQuery: '',
    debouncedSearch: '',
    productSortField: 'name',
    productSortOrder: 'asc',
    machineSortField: 'name',
    machineSortOrder: 'asc',
    productTypeFilter: 'All',
    machineTierFilter: 'All',
    machineCategoryFilter: 'All',
    machineSubcategoryFilter: 'All',
    filterProducers:
      preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'input' : true,
    filterConsumers:
      preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'output' : true,
    filterSellTrash:
      preselectedProductId ? (getProduct(preselectedProductId)?.sell_price ?? 0) < 0 : false,
    filterHeatPower: false,
  };
}

function applySnapshot(snapshot: RecipeSelectorTutorialSnapshot): void {
  activeStore?.setState(snapshot);
}

export function registerRecipeSelectorTutorialStore(
  store: StoreApi<RecipeSelectorState>,
): () => void {
  activeStore = store;
  if (pendingSnapshot) {
    applySnapshot(pendingSnapshot);
    pendingSnapshot = null;
  }

  return () => {
    if (activeStore === store) {
      activeStore = null;
    }
  };
}

export function captureRecipeSelectorTutorialSnapshot(): RecipeSelectorTutorialSnapshot | null {
  return activeStore ? toSnapshot(activeStore.getState()) : pendingSnapshot;
}

export function restoreRecipeSelectorTutorialSnapshot(
  snapshot: RecipeSelectorTutorialSnapshot | null,
): void {
  pendingSnapshot = snapshot;
  if (snapshot && activeStore) {
    applySnapshot(snapshot);
    pendingSnapshot = null;
  }
}
