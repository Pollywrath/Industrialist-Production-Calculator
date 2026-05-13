import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import type { Recipe } from '../../../types/data';

export interface RecipeSelectorState {
  stage: 'select' | 'recipes';
  selectedId: string | null;
  activeTab: 'product' | 'machine';
  searchQuery: string;
  debouncedSearch: string;
  productSortField: 'name' | 'sell_price' | 'rp_multiplier';
  productSortOrder: 'asc' | 'desc';
  machineSortField: 'name' | 'cost';
  machineSortOrder: 'asc' | 'desc';
  productTypeFilter: 'All' | 'Item' | 'Fluid';
  machineTierFilter: string;
  machineCategoryFilter: string;
  machineSubcategoryFilter: string;
  filterProducers: boolean;
  filterConsumers: boolean;

  setActiveTab: (tab: 'product' | 'machine') => void;
  setSearchQuery: (query: string) => void;
  setProductTypeFilter: (filter: 'All' | 'Item' | 'Fluid') => void;
  setMachineTierFilter: (filter: string) => void;
  setMachineCategoryFilter: (filter: string) => void;
  setMachineSubcategoryFilter: (filter: string) => void;
  setFilterProducers: (val: boolean) => void;
  setFilterConsumers: (val: boolean) => void;

  handleProductSort: (field: 'name' | 'sell_price' | 'rp_multiplier') => void;
  handleMachineSort: (field: 'name' | 'cost') => void;
  handleSelectItem: (id: string) => void;
  handleBack: () => void;
  clearSearch: () => void;
}

export const RecipeSelectorContext = createContext<StoreApi<RecipeSelectorState> | undefined>(
  undefined,
);

export function useRecipeSelectorStore<T>(selector: (state: RecipeSelectorState) => T): T {
  const store = useContext(RecipeSelectorContext);
  if (!store) {
    throw new Error('useRecipeSelectorStore must be used within a RecipeSelectorProvider');
  }
  return useStore(store, selector);
}

import { useShallow } from 'zustand/react/shallow';

export interface UseRecipeSelectorFiltersParams {
  recipes: Recipe[];
}

export function useRecipeSelectorFilters({ recipes }: UseRecipeSelectorFiltersParams) {
  const s = useRecipeSelectorStore(
    useShallow((state) => ({
      selectedId: state.selectedId,
      stage: state.stage,
      activeTab: state.activeTab,
      filterProducers: state.filterProducers,
      filterConsumers: state.filterConsumers,
      setFilterProducers: state.setFilterProducers,
      setFilterConsumers: state.setFilterConsumers,
      handleBack: state.handleBack,
    })),
  );

  let matchingRecipes: Recipe[] = [];
  if (s.selectedId && s.stage === 'recipes') {
    if (s.activeTab === 'product') {
      matchingRecipes = recipes.filter((r) => {
        const matchesProducer =
          s.filterProducers && r.outputs.some((out) => out.product_id === s.selectedId);
        const matchesConsumer =
          s.filterConsumers && r.inputs.some((inp) => inp.product_id === s.selectedId);
        return matchesProducer || matchesConsumer;
      });
    } else {
      matchingRecipes = recipes.filter((r) => r.machine_id === s.selectedId);
    }
  }

  return {
    ...s,
    matchingRecipes,
  };
}
