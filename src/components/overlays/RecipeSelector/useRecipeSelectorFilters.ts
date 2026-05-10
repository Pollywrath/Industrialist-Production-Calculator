import { useEffect } from 'react';
import type { Recipe } from '../../../types/data';
import { SEARCH_DEBOUNCE_MS } from '../../shared/layoutConstants';
import useControlStore from '../../../stores/useControlStore';

interface UseRecipeSelectorFiltersParams {
  recipes: Recipe[];
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
}

export function useRecipeSelectorFilters({
  recipes,
}: UseRecipeSelectorFiltersParams) {
  const stage = useControlStore((s) => s.selectorStage);
  const setStage = useControlStore((s) => s.setSelectorStage);

  const selectedId = useControlStore((s) => s.selectorSelectedId);
  const setSelectedId = useControlStore((s) => s.setSelectorSelectedId);

  const activeTab = useControlStore((s) => s.selectorActiveTab);
  const setActiveTab = useControlStore((s) => s.setSelectorActiveTab);

  const searchQuery = useControlStore((s) => s.selectorSearchQuery);
  const setSearchQuery = useControlStore((s) => s.setSelectorSearchQuery);

  const debouncedSearch = useControlStore((s) => s.selectorDebouncedSearch);
  const setDebouncedSearch = useControlStore((s) => s.setSelectorDebouncedSearch);

  const productSortField = useControlStore((s) => s.selectorProductSortField);
  const setProductSortField = useControlStore((s) => s.setSelectorProductSortField);

  const productSortOrder = useControlStore((s) => s.selectorProductSortOrder);
  const setProductSortOrder = useControlStore((s) => s.setSelectorProductSortOrder);

  const machineSortField = useControlStore((s) => s.selectorMachineSortField);
  const setMachineSortField = useControlStore((s) => s.setSelectorMachineSortField);

  const machineSortOrder = useControlStore((s) => s.selectorMachineSortOrder);
  const setMachineSortOrder = useControlStore((s) => s.setSelectorMachineSortOrder);

  const productTypeFilter = useControlStore((s) => s.selectorProductTypeFilter);
  const setProductTypeFilter = useControlStore((s) => s.setSelectorProductTypeFilter);

  const machineTierFilter = useControlStore((s) => s.selectorMachineTierFilter);
  const setMachineTierFilter = useControlStore((s) => s.setSelectorMachineTierFilter);

  const machineCategoryFilter = useControlStore((s) => s.selectorMachineCategoryFilter);
  const setMachineCategoryFilter = useControlStore((s) => s.setSelectorMachineCategoryFilter);

  const machineSubcategoryFilter = useControlStore((s) => s.selectorMachineSubcategoryFilter);
  const setMachineSubcategoryFilter = useControlStore((s) => s.setSelectorMachineSubcategoryFilter);

  const filterProducers = useControlStore((s) => s.selectorFilterProducers);
  const setFilterProducers = useControlStore((s) => s.setSelectorFilterProducers);

  const filterConsumers = useControlStore((s) => s.selectorFilterConsumers);
  const setFilterConsumers = useControlStore((s) => s.setSelectorFilterConsumers);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, setDebouncedSearch]);

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const handleProductSort = (field: 'name' | 'sell_price' | 'rp_multiplier') => {
    if (productSortField === field) {
      setProductSortOrder(productSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setProductSortField(field);
      setProductSortOrder('asc');
    }
  };

  const handleMachineSort = (field: 'name' | 'cost') => {
    if (machineSortField === field) {
      setMachineSortOrder(machineSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMachineSortField(field);
      setMachineSortOrder('asc');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setStage('recipes');
    setFilterProducers(true);
    setFilterConsumers(true);
  };

  const handleBack = () => {
    setStage('select');
    setSelectedId(null);
  };

  let matchingRecipes: Recipe[] = [];
  if (selectedId && stage === 'recipes') {
    if (activeTab === 'product') {
      matchingRecipes = recipes.filter((r) => {
        const matchesProducer =
          filterProducers && r.outputs.some((out) => out.product_id === selectedId);
        const matchesConsumer =
          filterConsumers && r.inputs.some((inp) => inp.product_id === selectedId);
        return matchesProducer || matchesConsumer;
      });
    } else {
      matchingRecipes = recipes.filter((r) => r.machine_id === selectedId);
    }
  }

  return {
    stage,
    selectedId,
    activeTab,
    searchQuery,
    debouncedSearch,
    productSortField,
    productSortOrder,
    machineSortField,
    machineSortOrder,
    productTypeFilter,
    machineTierFilter,
    machineCategoryFilter,
    machineSubcategoryFilter,
    filterProducers,
    filterConsumers,
    matchingRecipes,
    setStage,
    setSelectedId,
    setActiveTab,
    setSearchQuery,
    clearSearch,
    setProductSortField,
    setProductSortOrder,
    setMachineSortField,
    setMachineSortOrder,
    setProductTypeFilter,
    setMachineTierFilter,
    setMachineCategoryFilter,
    setMachineSubcategoryFilter,
    setFilterProducers,
    setFilterConsumers,
    handleProductSort,
    handleMachineSort,
    handleSelectItem,
    handleBack,
  };
}
export default useRecipeSelectorFilters;
