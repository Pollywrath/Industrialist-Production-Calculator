import { create } from 'zustand';
import type { Product, Machine, Recipe, Research } from '../types/data';
import {
  getAllProducts,
  getProduct,
  getAllMachines,
  getMachine,
  getAllResearches,
  getResearch,
  reloadDatabase,
} from '../data/lookup';
import {
  batchSaveDataOverrides,
  clearDataOverrides,
  deleteDataOverride,
  clearCategoryDataOverrides,
} from '../persistence/idb';
import { useUIStore } from './useUIStore';
import { validateProduct, validateMachine, validateResearch } from '../utils/dataValidation';

export interface PendingEdits {
  products: Record<string, Partial<Product> & { _tombstone?: boolean; _isNew?: boolean }>;
  machines: Record<string, Partial<Machine> & { _tombstone?: boolean; _isNew?: boolean }>;
  recipes: Record<string, Partial<Recipe> & { _tombstone?: boolean; _isNew?: boolean }>;
  researches: Record<string, Partial<Research> & { _tombstone?: boolean; _isNew?: boolean }>;
}

export function overlayPendingEdit<T extends { id: string }>(
  baseline: T | undefined,
  pending: (Partial<T> & { _tombstone?: boolean; _isNew?: boolean }) | undefined,
): T | null {
  if (pending?._tombstone) return null;
  if (!baseline) {
    if (pending?._isNew) {
      return pending as unknown as T;
    }
    return null;
  }
  return pending ? ({ ...baseline, ...pending } as T) : baseline;
}
interface DataState {
  pendingEdits: PendingEdits;
  searchQuery: string;
  dbVersion: number;

  setSearchQuery: (query: string) => void;
  updateProductPendingEdit: (id: string, updates: Partial<Product>) => string;
  addProduct: (name?: string) => string;
  deleteProduct: (id: string) => void;
  updateMachinePendingEdit: (id: string, updates: Partial<Machine>) => string;
  addMachine: (name?: string) => string;
  deleteMachine: (id: string) => void;
  updateResearchPendingEdit: (id: string, updates: Partial<Research>) => string;
  addResearch: (name?: string) => string;
  deleteResearch: (id: string) => void;
  restoreProductDefault: (id: string) => Promise<void>;
  restoreMachineDefault: (id: string) => Promise<void>;
  restoreResearchDefault: (id: string) => Promise<void>;
  discardEdits: () => void;
  saveEdits: () => Promise<void>;
  restoreDefaults: (category?: 'products' | 'machines' | 'recipes' | 'researches') => Promise<void>;
}

export function generateUniqueProductId(
  name: string,
  existingProducts: Product[],
  pendingProducts: Record<string, Partial<Product> & { _tombstone?: boolean; _isNew?: boolean }>,
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
  pendingMachines: Record<string, Partial<Machine> & { _tombstone?: boolean; _isNew?: boolean }>,
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

export function generateUniqueResearchId(
  name: string,
  category: string,
  existingResearches: Research[],
  pendingResearches: Record<string, Partial<Research> & { _tombstone?: boolean; _isNew?: boolean }>,
): string {
  const catSlug = (category || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const nameSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const combined = catSlug ? `${catSlug}_${nameSlug}` : nameSlug;
  const baseSlug = combined || 'research';

  const baseId = baseSlug.startsWith('s_') ? baseSlug : `s_${baseSlug}`;

  let id = baseId;
  let counter = 1;

  const isDuplicate = (checkId: string) => {
    const inActive = existingResearches.some((r) => r.id === checkId);
    const inPending = checkId in pendingResearches;
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

  updateProductPendingEdit: (id, updates) => {
    let targetId = id;
    set((state) => {
      const prevEdit = state.pendingEdits.products[id] || {};
      const nextProducts = { ...state.pendingEdits.products };

      if (prevEdit._isNew && updates.name !== undefined && updates.name !== prevEdit.name) {
        const otherPending = { ...state.pendingEdits.products };
        delete otherPending[id];
        targetId = generateUniqueProductId(updates.name, getAllProducts(), otherPending);

        delete nextProducts[id];
        nextProducts[targetId] = {
          ...prevEdit,
          ...updates,
          id: targetId,
        };
      } else {
        nextProducts[id] = {
          ...prevEdit,
          ...updates,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          products: nextProducts,
        },
      };
    });
    return targetId;
  },

  updateResearchPendingEdit: (id, updates) => {
    let targetId = id;
    set((state) => {
      const prevEdit = state.pendingEdits.researches[id] || {};
      const nextResearches = { ...state.pendingEdits.researches };

      const activeCategory =
        updates.category !== undefined ? updates.category : prevEdit.category || 'Production';
      const activeName = updates.name !== undefined ? updates.name : prevEdit.name || '';

      const nameChanged = updates.name !== undefined && updates.name !== prevEdit.name;
      const catChanged = updates.category !== undefined && updates.category !== prevEdit.category;

      if (prevEdit._isNew && (nameChanged || catChanged)) {
        const otherPending = { ...state.pendingEdits.researches };
        delete otherPending[id];
        targetId = generateUniqueResearchId(
          activeName,
          activeCategory,
          getAllResearches(),
          otherPending,
        );

        delete nextResearches[id];
        nextResearches[targetId] = {
          ...prevEdit,
          ...updates,
          id: targetId,
        };
      } else {
        nextResearches[id] = {
          ...prevEdit,
          ...updates,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          researches: nextResearches,
        },
      };
    });
    return targetId;
  },

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

  updateMachinePendingEdit: (id, updates) => {
    let targetId = id;
    set((state) => {
      const prevEdit = state.pendingEdits.machines[id] || {};
      const nextMachines = { ...state.pendingEdits.machines };

      if (prevEdit._isNew && updates.name !== undefined && updates.name !== prevEdit.name) {
        const otherPending = { ...state.pendingEdits.machines };
        delete otherPending[id];
        targetId = generateUniqueMachineId(updates.name, getAllMachines(), otherPending);

        delete nextMachines[id];
        nextMachines[targetId] = {
          ...prevEdit,
          ...updates,
          id: targetId,
        };
      } else {
        nextMachines[id] = {
          ...prevEdit,
          ...updates,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          machines: nextMachines,
        },
      };
    });
    return targetId;
  },

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

  addResearch: (name = 'New Research') => {
    let generatedId = '';
    set((state) => {
      const activeResearches = getAllResearches();
      generatedId = generateUniqueResearchId(
        name,
        'Production',
        activeResearches,
        state.pendingEdits.researches,
      );

      const newResearch: Research = {
        id: generatedId,
        name,
        rp_cost: 100,
        category: 'Production',
        prerequisites: [],
      };

      return {
        pendingEdits: {
          ...state.pendingEdits,
          researches: {
            ...state.pendingEdits.researches,
            [generatedId]: {
              ...newResearch,
              _isNew: true,
            },
          },
        },
      };
    });
    return generatedId;
  },

  deleteResearch: (id: string) =>
    set((state) => {
      const pending = state.pendingEdits.researches[id];
      const nextResearches = { ...state.pendingEdits.researches };

      if (pending?._isNew) {
        delete nextResearches[id];
      } else {
        nextResearches[id] = {
          ...nextResearches[id],
          _tombstone: true,
        };
      }

      return {
        pendingEdits: {
          ...state.pendingEdits,
          researches: nextResearches,
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

  restoreResearchDefault: async (id: string) => {
    const dbKey = `research:${id}`;
    await deleteDataOverride(dbKey);
    await reloadDatabase();
    set((state) => {
      const nextResearches = { ...state.pendingEdits.researches };
      delete nextResearches[id];
      return {
        pendingEdits: {
          ...state.pendingEdits,
          researches: nextResearches,
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

    for (const [id, editData] of Object.entries(pendingEdits.products)) {
      if (editData._tombstone) continue;
      const existing = getProduct(id);
      const compiled = existing ? { ...existing, ...editData } : editData;
      const validation = validateProduct(compiled);
      if (!validation.valid) {
        const errorMsg = validation.errors
          .map((err) => `- ${err.field}: ${err.message}`)
          .join('\n');
        await useUIStore.getState().confirm({
          title: 'Product Validation Failed',
          message: `The product "${compiled.name || id}" has invalid properties:\n${errorMsg}`,
          confirmLabel: 'Dismiss',
          intent: 'error',
        });
        return;
      }
    }

    // Build validation research ID set from persisted researches plus pending new researches minus tombstones
    const validResearches = new Set(getAllResearches().map((r) => r.id));
    for (const [id, editData] of Object.entries(pendingEdits.researches)) {
      if (editData._tombstone) {
        validResearches.delete(id);
      } else if (editData._isNew) {
        validResearches.add(id);
      }
    }
    for (const [id, editData] of Object.entries(pendingEdits.machines)) {
      if (editData._tombstone) continue;
      const existing = getMachine(id);
      const compiled = existing ? { ...existing, ...editData } : editData;
      const validation = validateMachine(compiled, validResearches);
      if (!validation.valid) {
        const errorMsg = validation.errors
          .map((err) => `- ${err.field}: ${err.message}`)
          .join('\n');
        await useUIStore.getState().confirm({
          title: 'Machine Validation Failed',
          message: `The machine "${compiled.name || id}" has invalid properties:\n${errorMsg}`,
          confirmLabel: 'Dismiss',
          intent: 'error',
        });
        return;
      }
    }

    for (const [id, editData] of Object.entries(pendingEdits.researches)) {
      if (editData._tombstone) continue;
      const existing = getResearch(id);
      const compiled = existing ? { ...existing, ...editData } : editData;
      const validation = validateResearch(compiled);
      if (!validation.valid) {
        const errorMsg = validation.errors
          .map((err) => `- ${err.field}: ${err.message}`)
          .join('\n');
        await useUIStore.getState().confirm({
          title: 'Research Validation Failed',
          message: `The research "${compiled.name || id}" has invalid properties:\n${errorMsg}`,
          confirmLabel: 'Dismiss',
          intent: 'error',
        });
        return;
      }
    }

    const batch: { id: string; data: Record<string, unknown> }[] = [];

    for (const [id, editData] of Object.entries(pendingEdits.products)) {
      const dbKey = `product:${id}`;
      if (editData._tombstone) {
        batch.push({ id: dbKey, data: { _tombstone: true } });
      } else {
        const existing = getProduct(id);
        const savedData = existing ? { ...existing, ...editData } : editData;

        const cleanData = { ...savedData } as Partial<Product> & {
          _isNew?: boolean;
          _tombstone?: boolean;
        };
        delete cleanData._isNew;
        delete cleanData._tombstone;
        batch.push({ id: dbKey, data: cleanData as unknown as Record<string, unknown> });
      }
    }

    for (const [id, editData] of Object.entries(pendingEdits.machines)) {
      const dbKey = `machine:${id}`;
      if (editData._tombstone) {
        batch.push({ id: dbKey, data: { _tombstone: true } });
      } else {
        const existing = getMachine(id);
        const savedData = existing ? { ...existing, ...editData } : editData;

        const cleanData = { ...savedData } as Partial<Machine> & {
          _isNew?: boolean;
          _tombstone?: boolean;
        };
        delete cleanData._isNew;
        delete cleanData._tombstone;
        batch.push({ id: dbKey, data: cleanData as unknown as Record<string, unknown> });
      }
    }

    for (const [id, editData] of Object.entries(pendingEdits.researches)) {
      const dbKey = `research:${id}`;
      if (editData._tombstone) {
        batch.push({ id: dbKey, data: { _tombstone: true } });
      } else {
        const existing = getResearch(id);
        const savedData = existing ? { ...existing, ...editData } : editData;

        const cleanData = { ...savedData } as Partial<Research> & {
          _isNew?: boolean;
          _tombstone?: boolean;
        };
        delete cleanData._isNew;
        delete cleanData._tombstone;
        batch.push({ id: dbKey, data: cleanData as unknown as Record<string, unknown> });
      }
    }

    const success = await batchSaveDataOverrides(batch);

    if (!success) {
      await useUIStore.getState().confirm({
        title: 'Save Failed',
        message:
          'Your edits could not be saved to the database. All pending changes have been preserved — please try again.',
        confirmLabel: 'Dismiss',
        intent: 'error',
      });
      return;
    }

    await reloadDatabase();

    set((state) => ({
      pendingEdits: {
        products: {},
        machines: {},
        recipes: {},
        researches: {},
      },
      dbVersion: state.dbVersion + 1,
    }));
  },

  restoreDefaults: async (category) => {
    if (category) {
      await clearCategoryDataOverrides(category);
    } else {
      await clearDataOverrides();
    }

    await reloadDatabase();

    set((state) => {
      const nextPending = { ...state.pendingEdits };
      if (category) {
        nextPending[category] = {};
      } else {
        nextPending.products = {};
        nextPending.machines = {};
        nextPending.recipes = {};
        nextPending.researches = {};
      }
      return {
        pendingEdits: nextPending,
        dbVersion: state.dbVersion + 1,
      };
    });
  },
}));
