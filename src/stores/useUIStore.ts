import { create } from 'zustand';

export type CanvasToggleId = 'delete_mode' | 'multi_select' | 'target';

export type RateMode = 'second' | 'minute' | 'hour' | 'raw';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: 'success' | 'info' | 'error';
}

interface UIState {
  isControlsMinimized: boolean;
  isOverlaysMinimized: boolean;
  isStatsMinimized: boolean;
  isExtendedMinimized: boolean;
  activeToggleId: CanvasToggleId | null;
  temporaryOverrides: CanvasToggleId[];
  isRecipeSelectorOpen: boolean;
  isSavesOverlayOpen: boolean;
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedNodeId: string | null;
  preselectedHandleIndex: number | null;
  rateMode: RateMode;

  toggleControlsMinimized: () => void;
  toggleOverlaysMinimized: () => void;
  toggleStatsMinimized: () => void;
  toggleExtendedMinimized: () => void;
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
  setSavesOverlayOpen: (isOpen: boolean) => void;
  isAutosaveLoaded: boolean;
  setAutosaveLoaded: () => void;
  isTransforming: boolean;
  setIsTransforming: (isTransforming: boolean) => void;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  isExporting: boolean;
  setIsExporting: (isExporting: boolean) => void;
  confirmDialog: {
    options: ConfirmOptions;
    resolve: (confirmed: boolean) => void;
  } | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  closeConfirm: (confirmed: boolean) => void;
}

const useUIStore = create<UIState>((set) => ({
  isControlsMinimized: false,
  isOverlaysMinimized: false,
  isStatsMinimized: false,
  isExtendedMinimized: false,
  activeToggleId: null,
  temporaryOverrides: [],
  isRecipeSelectorOpen: false,
  isSavesOverlayOpen: false,
  preselectedProductId: null,
  preselectedSourceSide: null,
  preselectedNodeId: null,
  preselectedHandleIndex: null,
  rateMode: 'second',

  toggleControlsMinimized: () => set((state) => ({ isControlsMinimized: !state.isControlsMinimized })),
  toggleOverlaysMinimized: () => set((state) => ({ isOverlaysMinimized: !state.isOverlaysMinimized })),
  toggleStatsMinimized: () => set((state) => ({ isStatsMinimized: !state.isStatsMinimized })),
  toggleExtendedMinimized: () => set((state) => ({ isExtendedMinimized: !state.isExtendedMinimized })),
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
    set((state) => ({
      isRecipeSelectorOpen: isOpen,
      preselectedProductId: isOpen ? preselectedProductId : null,
      preselectedSourceSide: isOpen ? preselectedSourceSide : null,
      preselectedNodeId: isOpen ? preselectedNodeId : null,
      preselectedHandleIndex: isOpen ? preselectedHandleIndex : null,
      activeToggleId: isOpen ? null : state.activeToggleId,
      temporaryOverrides: isOpen ? [] : state.temporaryOverrides,
    })),
  setSavesOverlayOpen: (isOpen) =>
    set((state) => ({
      isSavesOverlayOpen: isOpen,
      activeToggleId: isOpen ? null : state.activeToggleId,
      temporaryOverrides: isOpen ? [] : state.temporaryOverrides,
    })),
  isAutosaveLoaded: false,
  setAutosaveLoaded: () => set({ isAutosaveLoaded: true }),
  isTransforming: false,
  setIsTransforming: (isTransforming) => set({ isTransforming }),
  zoomLevel: 1,
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  isExporting: false,
  setIsExporting: (isExporting) => set({ isExporting }),
  confirmDialog: null,
  confirm: (options) => {
    return new Promise((resolve) => {
      set({
        confirmDialog: {
          options,
          resolve: (confirmed) => {
            set({ confirmDialog: null });
            resolve(confirmed);
          },
        },
      });
    });
  },
  closeConfirm: (confirmed) => {
    set((state) => {
      if (state.confirmDialog) {
        state.confirmDialog.resolve(confirmed);
      }
      return { confirmDialog: null };
    });
  },
}));

export const getEffectiveToggleId = (state: UIState): string | null => {
  return state.temporaryOverrides.length > 0
    ? state.temporaryOverrides[state.temporaryOverrides.length - 1]
    : state.activeToggleId;
};

export { useUIStore };
