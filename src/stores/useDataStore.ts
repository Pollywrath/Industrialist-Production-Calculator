import { create } from 'zustand';
import type { Product, Machine, Recipe, Research } from '../types/data';
import { getAllProducts, getProduct, getAllMachines, getMachine, getAllResearches, reloadDatabase } from '../data/lookup';
import { saveDataOverride, clearDataOverrides, deleteDataOverride } from '../persistence/idb';
import { useFlowStore } from './useFlowStore';
import { useUIStore } from './useUIStore';
import { validateProduct, validateMachine } from '../utils/dataValidation';

export interface PendingEdits {
  products: Record<string, Partial<Product> & { _tombstone?: boolean; _isNew?: boolean }>;
  machines: Record<string, Partial<Machine> & { _tombstone?: boolean; _isNew?: boolean }>;
  recipes: Record<string, Partial<Recipe> & { _tombstone?: boolean; _isNew?: boolean }>;
  researches: Record<string, Partial<Research> & { _tombstone?: boolean; _isNew?: boolean }>;
}
interface DataState {
  pendingEdits: PendingEdits;
  searchQuery: string;
  dbVersion: number;

  setSearchQuery: (query: string) => void;
  updateProductPendingEdit: (id: string, updates: Partial<Product>) => void;
  addProduct: (name?: string) => string;
  deleteProduct: (id: string) => void;
  updateMachinePendingEdit: (id: string, updates: Partial<Machine>) => void;
  addMachine: (name?: string) => string;
  deleteMachine: (id: string) => void;
  restoreProductDefault: (id: string) => Promise<void>;
  restoreMachineDefault: (id: string) => Promise<void>;
  discardEdits: () => void;
  saveEdits: () => Promise<void>;
  restoreDefaults: () => Promise<void>;
}

export function generateUniqueProductId(
  name: string,
  existingProducts: Product[],
  pendingProducts: Record<string, Partial<Product> & { _tombstone?: boolean; _isNew?: boolean }>
): string {
  let baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!baseSlug) {
    baseSlug = 'product';
  }

  const baseId = baseSlug.startsWith('p_') ? baseSlug : `p_${baseSlug}`;

  let id = baseId;
  let counter = 1;

  const isDuplicate = (checkId: string) => {
    const inActive = existingProducts.some((p) => p.id === checkId);
    const inPending = checkId in pendingProducts;
    return inActive || inPending;
  };

  while (isDuplicate(id)) {
    id = `${baseId}_${counter}`;
    counter++;
  }

  return id;
}

export function generateUniqueMachineId(
  name: string,
  existingMachines: Machine[],
  pendingMachines: Record<string, Partial<Machine> & { _tombstone?: boolean; _isNew?: boolean }>
): string {
  let baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!baseSlug) {
    baseSlug = 'machine';
  }

  const baseId = baseSlug.startsWith('m_') ? baseSlug : `m_${baseSlug}`;

  let id = baseId;
  let counter = 1;

  const isDuplicate = (checkId: string) => {
    const inActive = existingMachines.some((m) => m.id === checkId);
    const inPending = checkId in pendingMachines;
    return inActive || inPending;
  };

  while (isDuplicate(id)) {
    id = `${baseId}_${counter}`;
    counter++;
  }

  return id;
}

export const useDataStore = create<DataState>((set, get) => ({
  pendingEdits: {
    products: {},
    machines: {},
    recipes: {},
    researches: {},
  },
  searchQuery: '',
  dbVersion: 0,

  setSearchQuery: (query) => set({ searchQuery: query }),

  updateProductPendingEdit: (id, updates) =>
    set((state) => {
      const prevEdit = state.pendingEdits.products[id] || {};
      return {
        pendingEdits: {
          ...state.pendingEdits,
          products: {
            ...state.pendingEdits.products,
            [id]: {
              ...prevEdit,
              ...updates,
            },
          },
        },
      };
    }),

  addProduct: (name = 'New Product') => {
    let generatedId = '';
    set((state) => {
      const activeProducts = getAllProducts();
      generatedId = generateUniqueProductId(name, activeProducts, state.pendingEdits.products);
      
      const newProduct: Product = {
        id: generatedId,
        name,
        sell_price: 0,
        rp_multiplier: 1,
        type: 'Item',
      };

      return {
        pendingEdits: {
          ...state.pendingEdits,
          products: {
            ...state.pendingEdits.products,
            [generatedId]: {
              ...newProduct,
              _isNew: true,
            },
          },
        },
      };
    });
    return generatedId;
  },

  deleteProduct: (id: string) =>
    set((state) => {
      const pending = state.pendingEdits.products[id];
      const nextProducts = { ...state.pendingEdits.products };

      if (pending?._isNew) {
        delete nextProducts[id];
      } else {
        nextProducts[id] = {
          ...nextProducts[id],
          _tombstone: true,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          products: nextProducts,
        },
      };
    }),

  updateMachinePendingEdit: (id, updates) =>
    set((state) => {
      const prevEdit = state.pendingEdits.machines[id] || {};
      return {
        pendingEdits: {
          ...state.pendingEdits,
          machines: {
            ...state.pendingEdits.machines,
            [id]: {
              ...prevEdit,
              ...updates,
            },
          },
        },
      };
    }),

  addMachine: (name = 'New Machine') => {
    let generatedId = '';
    set((state) => {
      const activeMachines = getAllMachines();
      generatedId = generateUniqueMachineId(name, activeMachines, state.pendingEdits.machines);

      const newMachine: Machine = {
        id: generatedId,
        name,
        cost: 100,
        tier: 1,
        size: { x: 1, y: 1 },
        variant: '',
        limited: false,
        research: '',
        category: 'Factory',
        subcategory: 'Assembler',
      };

      return {
        pendingEdits: {
          ...state.pendingEdits,
          machines: {
            ...state.pendingEdits.machines,
            [generatedId]: {
              ...newMachine,
              _isNew: true,
            },
          },
        },
      };
    });
    return generatedId;
  },

  deleteMachine: (id: string) =>
    set((state) => {
      const pending = state.pendingEdits.machines[id];
      const nextMachines = { ...state.pendingEdits.machines };

      if (pending?._isNew) {
        delete nextMachines[id];
      } else {
        nextMachines[id] = {
          ...nextMachines[id],
          _tombstone: true,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          machines: nextMachines,
        },
      };
    }),

  restoreProductDefault: async (id: string) => {
    const dbKey = `product:${id}`;
    await deleteDataOverride(dbKey);
    await reloadDatabase();
    set((state) => {
      const nextProducts = { ...state.pendingEdits.products };
      delete nextProducts[id];
      return {
        pendingEdits: {
          ...state.pendingEdits,
          products: nextProducts,
        },
        dbVersion: state.dbVersion + 1,
      };
    });
  },

  restoreMachineDefault: async (id: string) => {
    const dbKey = `machine:${id}`;
    await deleteDataOverride(dbKey);
    await reloadDatabase();
    set((state) => {
      const nextMachines = { ...state.pendingEdits.machines };
      delete nextMachines[id];
      return {
        pendingEdits: {
          ...state.pendingEdits,
          machines: nextMachines,
        },
        dbVersion: state.dbVersion + 1,
      };
    });
  },

  discardEdits: () =>
    set({
      pendingEdits: {
        products: {},
        machines: {},
        recipes: {},
        researches: {},
      },
    }),

  saveEdits: async () => {
    const { pendingEdits } = get();

    // 1. Validate pending products
    for (const [id, editData] of Object.entries(pendingEdits.products)) {
      if (editData._tombstone) continue;
      const existing = getProduct(id);
      const compiled = existing ? { ...existing, ...editData } : editData;
      const validation = validateProduct(compiled);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(err => `- ${err.field}: ${err.message}`).join('\n');
        await useUIStore.getState().confirm({
          title: 'Product Validation Failed',
          message: `The product "${compiled.name || id}" has invalid properties:\n${errorMsg}`,
          confirmLabel: 'Dismiss',
          intent: 'error',
        });
        return; // Halt saving
      }
    }

    // 2. Validate pending machines
    const validResearches = new Set(getAllResearches().map((r) => r.id));
    for (const [id, editData] of Object.entries(pendingEdits.machines)) {
      if (editData._tombstone) continue;
      const existing = getMachine(id);
      const compiled = existing ? { ...existing, ...editData } : editData;
      const validation = validateMachine(compiled, validResearches);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(err => `- ${err.field}: ${err.message}`).join('\n');
        await useUIStore.getState().confirm({
          title: 'Machine Validation Failed',
          message: `The machine "${compiled.name || id}" has invalid properties:\n${errorMsg}`,
          confirmLabel: 'Dismiss',
          intent: 'error',
        });
        return; // Halt saving
      }
    }

    // 3. Persist product overrides
    for (const [id, editData] of Object.entries(pendingEdits.products)) {
      const dbKey = `product:${id}`;
      if (editData._tombstone) {
        await saveDataOverride(dbKey, { _tombstone: true });
      } else {
        const existing = getProduct(id);
        const savedData = existing ? { ...existing, ...editData } : editData;

        // Remove transient helper keys
        const cleanData = { ...savedData } as Partial<Product> & { _isNew?: boolean; _tombstone?: boolean };
        delete cleanData._isNew;
        delete cleanData._tombstone;
        await saveDataOverride(dbKey, cleanData as unknown as Record<string, unknown>);
      }
    }

    // 2. Persist machine overrides
    for (const [id, editData] of Object.entries(pendingEdits.machines)) {
      const dbKey = `machine:${id}`;
      if (editData._tombstone) {
        await saveDataOverride(dbKey, { _tombstone: true });
      } else {
        const existing = getMachine(id);
        const savedData = existing ? { ...existing, ...editData } : editData;

        // Remove transient helper keys
        const cleanData = { ...savedData } as Partial<Machine> & { _isNew?: boolean; _tombstone?: boolean };
        delete cleanData._isNew;
        delete cleanData._tombstone;
        await saveDataOverride(dbKey, cleanData as unknown as Record<string, unknown>);
      }
    }

    // 3. Recompile compiled DB maps FIRST
    await reloadDatabase();

    // 4. Clear transient edits AND increment dbVersion atomically
    set((state) => ({
      pendingEdits: {
        products: {},
        machines: {},
        recipes: {},
        researches: {},
      },
      dbVersion: state.dbVersion + 1,
    }));

    // 5. Increment solver version to trigger re-computation across components
    useFlowStore.setState((s) => ({ solverVersion: s.solverVersion + 1 }));
  },

  restoreDefaults: async () => {
    // Clear all DB overrides
    await clearDataOverrides();

    // Recompile compiled DB maps back to static JSON defaults FIRST
    await reloadDatabase();

    // Reset transient edits AND increment dbVersion atomically
    set((state) => ({
      pendingEdits: {
        products: {},
        machines: {},
        recipes: {},
        researches: {},
      },
      dbVersion: state.dbVersion + 1,
    }));

    // Trigger solver recompute
    useFlowStore.setState((s) => ({ solverVersion: s.solverVersion + 1 }));
  },
}));
