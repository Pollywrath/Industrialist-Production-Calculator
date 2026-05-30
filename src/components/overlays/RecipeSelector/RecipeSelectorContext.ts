import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import type { Recipe } from '../../../types/data';
import { getProduct } from '../../../data/lookup';

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
  filterSellTrash: boolean;
  filterHeatPower: boolean;

  setActiveTab: (tab: 'product' | 'machine') => void;
  setSearchQuery: (query: string) => void;
  setProductTypeFilter: (filter: 'All' | 'Item' | 'Fluid') => void;
  setMachineTierFilter: (filter: string) => void;
  setMachineCategoryFilter: (filter: string) => void;
  setMachineSubcategoryFilter: (filter: string) => void;
  setFilterProducers: (val: boolean) => void;
  setFilterConsumers: (val: boolean) => void;
  setFilterSellTrash: (val: boolean) => void;
  setFilterHeatPower: (val: boolean) => void;

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
      filterSellTrash: state.filterSellTrash,
      filterHeatPower: state.filterHeatPower,
      setFilterProducers: state.setFilterProducers,
      setFilterConsumers: state.setFilterConsumers,
      setFilterSellTrash: state.setFilterSellTrash,
      setFilterHeatPower: state.setFilterHeatPower,
      handleBack: state.handleBack,
    })),
  );

  let matchingRecipes: Recipe[] = [];
  if (s.selectedId && s.stage === 'recipes') {
    if (s.activeTab === 'product') {
      const selectedProductId = s.selectedId;
      const selectedProductType = getProduct(selectedProductId)?.type;

      matchingRecipes = recipes.filter((r) => {
        const isSellTrash = !!r.isSellTrash;
        const isProductMatch = (productId: string): boolean => {
          if (productId === selectedProductId) return true;
          if (selectedProductType === 'Fluid' && productId === 'any_fluid') return true;
          if (selectedProductType === 'Item' && productId === 'any_item') return true;
          return false;
        };

        const hasSelectedOutput = r.outputs.some((out) => isProductMatch(out.product_id));
        const hasSelectedInput = r.inputs.some((inp) => isProductMatch(inp.product_id));
        const hasSelectedPotentialOutput = !!r.potential_outputs?.includes(selectedProductId);
        const hasSelectedPotentialInput = !!r.potential_inputs?.includes(selectedProductId);
        const producesProduct = hasSelectedOutput || hasSelectedPotentialOutput;
        const consumesProduct = hasSelectedInput || hasSelectedPotentialInput;

        const consumesViaVariableInput = r.inputs.some(
          (inp) => isProductMatch(inp.product_id) && !!inp.variable,
        );
        const consumesViaExplicitNonVariableInput = r.inputs.some(
          (inp) =>
            isProductMatch(inp.product_id) &&
            !inp.variable &&
            inp.product_id !== 'any_item' &&
            inp.product_id !== 'any_fluid',
        );

        const isPowerGenerator = (r.power_consumption ?? 0) < 0;
        const producesHeat = r.outputs.some((out) => (out.temperature ?? 0) > 21);
        const hasSelectedExplicitInput = r.inputs.some((inp) => inp.product_id === selectedProductId);
        const hasSelectedExplicitOutput = r.outputs.some((out) => out.product_id === selectedProductId);
        const isHeatLoopForSelected = hasSelectedExplicitInput && hasSelectedExplicitOutput && producesHeat;
        const isHeatPower = (isPowerGenerator || isHeatLoopForSelected) && (producesProduct || consumesProduct);

        const isProducerConsumerClutterCase = isHeatLoopForSelected;
        const matchesProducer =
          s.filterProducers &&
          !isSellTrash &&
          producesProduct &&
          !isProducerConsumerClutterCase;
        const matchesConsumer =
          s.filterConsumers &&
          consumesProduct &&
          !isProducerConsumerClutterCase &&
          (!isSellTrash ||
            consumesViaExplicitNonVariableInput ||
            (hasSelectedPotentialInput && !consumesViaVariableInput));
        const matchesSellTrash =
          s.filterSellTrash && isSellTrash && (producesProduct || consumesProduct);
        const matchesHeatPower = s.filterHeatPower && isHeatPower;

        return matchesProducer || matchesConsumer || matchesSellTrash || matchesHeatPower;
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
