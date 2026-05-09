import { create } from 'zustand';

export type RateMode = 'second' | 'minute' | 'hour' | 'raw';

interface ControlState {
  isMinimized: boolean;
  activeToggles: Record<string, boolean>;
  isRecipeSelectorOpen: boolean;
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedNodeId: string | null;
  preselectedHandleIndex: number | null;
  rateMode: RateMode;
  toggleMinimized: () => void;
  toggleButton: (id: string) => void;
  cycleRateMode: () => void;
  setRecipeSelectorOpen: (
    isOpen: boolean,
    preselectedProductId?: string | null,
    preselectedSourceSide?: 'input' | 'output' | null,
    preselectedNodeId?: string | null,
    preselectedHandleIndex?: number | null,
  ) => void;
}

const useControlStore = create<ControlState>((set) => ({
  isMinimized: false,
  activeToggles: {},
  isRecipeSelectorOpen: false,
  preselectedProductId: null,
  preselectedSourceSide: null,
  preselectedNodeId: null,
  preselectedHandleIndex: null,
  rateMode: 'second',
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  toggleButton: (id) =>
    set((state) => ({
      activeToggles: {
        ...state.activeToggles,
        [id]: !state.activeToggles[id],
      },
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
    set({
      isRecipeSelectorOpen: isOpen,
      preselectedProductId: isOpen ? preselectedProductId : null,
      preselectedSourceSide: isOpen ? preselectedSourceSide : null,
      preselectedNodeId: isOpen ? preselectedNodeId : null,
      preselectedHandleIndex: isOpen ? preselectedHandleIndex : null,
    }),
}));

export default useControlStore;
