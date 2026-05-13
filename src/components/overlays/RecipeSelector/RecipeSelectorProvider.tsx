import React, { useState, useEffect } from 'react';
import { createStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { SEARCH_DEBOUNCE_MS } from '../../shared/layoutConstants';
import { RecipeSelectorContext, type RecipeSelectorState } from './RecipeSelectorContext';

interface RecipeSelectorProviderProps {
  children: React.ReactNode;
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
}

export function RecipeSelectorProvider({
  children,
  preselectedProductId,
  preselectedSourceSide,
}: RecipeSelectorProviderProps) {
  const [store] = useState(() =>
    createStore(
      subscribeWithSelector<RecipeSelectorState>((set) => ({
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

        setActiveTab: (activeTab) => set({ activeTab }),
        setSearchQuery: (searchQuery) => set({ searchQuery }),
        setProductTypeFilter: (productTypeFilter) => set({ productTypeFilter }),
        setMachineTierFilter: (machineTierFilter) => set({ machineTierFilter }),
        setMachineCategoryFilter: (machineCategoryFilter) => set({ machineCategoryFilter }),
        setMachineSubcategoryFilter: (machineSubcategoryFilter) =>
          set({ machineSubcategoryFilter }),
        setFilterProducers: (filterProducers) => set({ filterProducers }),
        setFilterConsumers: (filterConsumers) => set({ filterConsumers }),

        handleProductSort: (field) =>
          set((state) => {
            if (state.productSortField === field) {
              return { productSortOrder: state.productSortOrder === 'asc' ? 'desc' : 'asc' };
            } else {
              return { productSortField: field, productSortOrder: 'asc' };
            }
          }),
        handleMachineSort: (field) =>
          set((state) => {
            if (state.machineSortField === field) {
              return { machineSortOrder: state.machineSortOrder === 'asc' ? 'desc' : 'asc' };
            } else {
              return { machineSortField: field, machineSortOrder: 'asc' };
            }
          }),
        handleSelectItem: (id) =>
          set({
            selectedId: id,
            stage: 'recipes',
            filterProducers: true,
            filterConsumers: true,
          }),
        handleBack: () =>
          set({
            stage: 'select',
            selectedId: null,
          }),
        clearSearch: () =>
          set({
            searchQuery: '',
            debouncedSearch: '',
          }),
      })),
    ),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = store.subscribe(
      (state) => state.searchQuery,
      (searchQuery) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          store.setState({ debouncedSearch: searchQuery });
        }, SEARCH_DEBOUNCE_MS);
      },
    );

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [store]);

  return <RecipeSelectorContext.Provider value={store}>{children}</RecipeSelectorContext.Provider>;
}
