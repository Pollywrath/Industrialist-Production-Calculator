import { create } from 'zustand';

export type CanvasToggleId = 'delete_mode' | 'multi_select' | 'target';

export type RateMode = 'second' | 'minute' | 'hour' | 'raw';

interface ControlState {
  isMinimized: boolean;
  activeToggleId: CanvasToggleId | null;
  temporaryOverrides: CanvasToggleId[];
  isRecipeSelectorOpen: boolean;
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedNodeId: string | null;
  preselectedHandleIndex: number | null;
  rateMode: RateMode;

  selectorStage: 'select' | 'recipes';
  selectorSelectedId: string | null;
  selectorActiveTab: 'product' | 'machine';
  selectorSearchQuery: string;
  selectorDebouncedSearch: string;
  selectorProductSortField: 'name' | 'sell_price' | 'rp_multiplier';
  selectorProductSortOrder: 'asc' | 'desc';
  selectorMachineSortField: 'name' | 'cost';
  selectorMachineSortOrder: 'asc' | 'desc';
  selectorProductTypeFilter: 'All' | 'Item' | 'Fluid';
  selectorMachineTierFilter: string;
  selectorMachineCategoryFilter: string;
  selectorMachineSubcategoryFilter: string;
  selectorFilterProducers: boolean;
  selectorFilterConsumers: boolean;

  toggleMinimized: () => void;
  toggleButton: (id: CanvasToggleId) => void;
  pushOverride: (id: CanvasToggleId) => void;
  popOverride: (id: CanvasToggleId) => void;
  cycleRateMode: () => void;
  setRecipeSelectorOpen: (
    isOpen: boolean,
    preselectedProductId?: string | null,
    preselectedSourceSide?: 'input' | 'output' | null,
    preselectedNodeId?: string | null,
    preselectedHandleIndex?: number | null,
  ) => void;

  setSelectorStage: (stage: 'select' | 'recipes') => void;
  setSelectorSelectedId: (id: string | null) => void;
  setSelectorActiveTab: (tab: 'product' | 'machine') => void;
  setSelectorSearchQuery: (query: string) => void;
  setSelectorDebouncedSearch: (query: string) => void;
  setSelectorProductSortField: (field: 'name' | 'sell_price' | 'rp_multiplier') => void;
  setSelectorProductSortOrder: (order: 'asc' | 'desc') => void;
  setSelectorMachineSortField: (field: 'name' | 'cost') => void;
  setSelectorMachineSortOrder: (order: 'asc' | 'desc') => void;
  setSelectorProductTypeFilter: (filter: 'All' | 'Item' | 'Fluid') => void;
  setSelectorMachineTierFilter: (filter: string) => void;
  setSelectorMachineCategoryFilter: (filter: string) => void;
  setSelectorMachineSubcategoryFilter: (filter: string) => void;
  setSelectorFilterProducers: (val: boolean) => void;
  setSelectorFilterConsumers: (val: boolean) => void;
  initializeSelector: (
    preselectedProductId: string | null,
    preselectedSourceSide: 'input' | 'output' | null,
  ) => void;
}

const useControlStore = create<ControlState>((set) => ({
  isMinimized: false,
  activeToggleId: null,
  temporaryOverrides: [],
  isRecipeSelectorOpen: false,
  preselectedProductId: null,
  preselectedSourceSide: null,
  preselectedNodeId: null,
  preselectedHandleIndex: null,
  rateMode: 'second',

  selectorStage: 'select',
  selectorSelectedId: null,
  selectorActiveTab: 'product',
  selectorSearchQuery: '',
  selectorDebouncedSearch: '',
  selectorProductSortField: 'name',
  selectorProductSortOrder: 'asc',
  selectorMachineSortField: 'name',
  selectorMachineSortOrder: 'asc',
  selectorProductTypeFilter: 'All',
  selectorMachineTierFilter: 'All',
  selectorMachineCategoryFilter: 'All',
  selectorMachineSubcategoryFilter: 'All',
  selectorFilterProducers: true,
  selectorFilterConsumers: true,

  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  toggleButton: (id) =>
    set((state) => ({
      activeToggleId: state.activeToggleId === id ? null : id,
    })),
  pushOverride: (id) =>
    set((state) => {
      if (state.temporaryOverrides.includes(id)) return {};
      return { temporaryOverrides: [...state.temporaryOverrides, id] };
    }),
  popOverride: (id) =>
    set((state) => ({
      temporaryOverrides: state.temporaryOverrides.filter((o) => o !== id),
    })),
  cycleRateMode: () =>
    set((state) => {
      const modes: RateMode[] = ['second', 'minute', 'hour', 'raw'];
      const currentIndex = modes.indexOf(state.rateMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      return { rateMode: modes[nextIndex] };
    }),
  setRecipeSelectorOpen: (
    isOpen,
    preselectedProductId = null,
    preselectedSourceSide = null,
    preselectedNodeId = null,
    preselectedHandleIndex = null,
  ) =>
    set((state) => {
      const updates: Partial<ControlState> = {
        isRecipeSelectorOpen: isOpen,
        preselectedProductId: isOpen ? preselectedProductId : null,
        preselectedSourceSide: isOpen ? preselectedSourceSide : null,
        preselectedNodeId: isOpen ? preselectedNodeId : null,
        preselectedHandleIndex: isOpen ? preselectedHandleIndex : null,
        activeToggleId: isOpen ? null : state.activeToggleId,
        temporaryOverrides: isOpen ? [] : state.temporaryOverrides,
      };

      if (isOpen) {
        updates.selectorStage = preselectedProductId ? 'recipes' : 'select';
        updates.selectorSelectedId = preselectedProductId;
        updates.selectorActiveTab = 'product';
        updates.selectorSearchQuery = '';
        updates.selectorDebouncedSearch = '';
        updates.selectorProductSortField = 'name';
        updates.selectorProductSortOrder = 'asc';
        updates.selectorMachineSortField = 'name';
        updates.selectorMachineSortOrder = 'asc';
        updates.selectorProductTypeFilter = 'All';
        updates.selectorMachineTierFilter = 'All';
        updates.selectorMachineCategoryFilter = 'All';
        updates.selectorMachineSubcategoryFilter = 'All';
        updates.selectorFilterProducers =
          preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'input' : true;
        updates.selectorFilterConsumers =
          preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'output' : true;
      }

      return updates;
    }),

  setSelectorStage: (stage) => set({ selectorStage: stage }),
  setSelectorSelectedId: (id) => set({ selectorSelectedId: id }),
  setSelectorActiveTab: (tab) => set({ selectorActiveTab: tab }),
  setSelectorSearchQuery: (query) => set({ selectorSearchQuery: query }),
  setSelectorDebouncedSearch: (query) => set({ selectorDebouncedSearch: query }),
  setSelectorProductSortField: (field) => set({ selectorProductSortField: field }),
  setSelectorProductSortOrder: (order) => set({ selectorProductSortOrder: order }),
  setSelectorMachineSortField: (field) => set({ selectorMachineSortField: field }),
  setSelectorMachineSortOrder: (order) => set({ selectorMachineSortOrder: order }),
  setSelectorProductTypeFilter: (filter) => set({ selectorProductTypeFilter: filter }),
  setSelectorMachineTierFilter: (filter) => set({ selectorMachineTierFilter: filter }),
  setSelectorMachineCategoryFilter: (filter) => set({ selectorMachineCategoryFilter: filter }),
  setSelectorMachineSubcategoryFilter: (filter) => set({ selectorMachineSubcategoryFilter: filter }),
  setSelectorFilterProducers: (val) => set({ selectorFilterProducers: val }),
  setSelectorFilterConsumers: (val) => set({ selectorFilterConsumers: val }),
  initializeSelector: (preselectedProductId, preselectedSourceSide) =>
    set(() => ({
      selectorStage: preselectedProductId ? 'recipes' : 'select',
      selectorSelectedId: preselectedProductId,
      selectorActiveTab: 'product',
      selectorSearchQuery: '',
      selectorDebouncedSearch: '',
      selectorProductSortField: 'name',
      selectorProductSortOrder: 'asc',
      selectorMachineSortField: 'name',
      selectorMachineSortOrder: 'asc',
      selectorProductTypeFilter: 'All',
      selectorMachineTierFilter: 'All',
      selectorMachineCategoryFilter: 'All',
      selectorMachineSubcategoryFilter: 'All',
      selectorFilterProducers:
        preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'input' : true,
      selectorFilterConsumers:
        preselectedProductId && preselectedSourceSide ? preselectedSourceSide === 'output' : true,
    })),
}));

export const getEffectiveToggleId = (state: ControlState): string | null => {
  return state.temporaryOverrides.length > 0
    ? state.temporaryOverrides[state.temporaryOverrides.length - 1]
    : state.activeToggleId;
};

export default useControlStore;
