import { create } from 'zustand';
import type { Edge } from '@xyflow/react';
import type { CanvasNode } from '../types/nodes';
import type { GlobalSettings } from './useGlobalSettingsStore';
import { useFlowStore } from './useFlowStore';
import { useUIStore } from './useUIStore';
import { useGlobalSettingsStore } from './useGlobalSettingsStore';
import { useDataStore } from './useDataStore';
import type { DataOverlayViewState, PendingEdits } from './useDataStore';
import {
  batchSaveDataOverrides,
  deleteDataOverride,
  deleteSave,
  getDataOverrides,
} from '../persistence/idb';
import { deserializeCanvas } from '../persistence/transformer';
import { rebuildActiveDatabase, reloadDatabase, getAllResearches, getRecipe } from '../data/lookup';
import { setSpecialRecipeOverrides } from '../data/registry';
import type { SpecialRecipe } from '../types/specialRecipes';
import {
  captureRecipeSelectorTutorialSnapshot,
  createInitialRecipeSelectorTutorialSnapshot,
  restoreRecipeSelectorTutorialSnapshot,
  type RecipeSelectorTutorialSnapshot,
} from '../components/overlays/RecipeSelector/recipeSelectorTutorialBridge';
import { getTutorialDefinition, type TutorialDefinition } from '../tutorials/registry';
import type {
  TutorialAction,
  TutorialActionEvent,
  TutorialAlias,
  TutorialId,
  TutorialStep,
} from '../tutorials/types';

type DataOverride = { id: string; data: Record<string, unknown> };
type DataPrefix = 'product:' | 'machine:' | 'recipe:' | 'research:' | 'special_recipe:';

interface GraphSnapshot {
  nodes: CanvasNode[];
  edges: Edge[];
  historyPast: ReturnType<typeof useFlowStore.getState>['historyPast'];
  historyFuture: ReturnType<typeof useFlowStore.getState>['historyFuture'];
  canUndo: boolean;
  canRedo: boolean;
}

interface UISnapshot {
  isControlsMinimized: boolean;
  isOverlaysMinimized: boolean;
  isStatsMinimized: boolean;
  isExtendedMinimized: boolean;
  activeToggleId: ReturnType<typeof useUIStore.getState>['activeToggleId'];
  temporaryOverrides: ReturnType<typeof useUIStore.getState>['temporaryOverrides'];
  isRecipeSelectorOpen: boolean;
  isSavesOverlayOpen: boolean;
  isDataOverlayOpen: boolean;
  isThemeOverlayOpen: boolean;
  isMachineOverlayOpen: boolean;
  isHelpOverlayOpen: boolean;
  isLPSolverOpen: boolean;
  preselectedProductId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedNodeId: string | null;
  preselectedHandleIndex: number | null;
  rateMode: ReturnType<typeof useUIStore.getState>['rateMode'];
  nodeEditorOpenId: string | null;
}

interface TutorialSnapshot {
  globalSettings: GlobalSettings;
  dataDbVersion: number;
  dataPendingEdits: PendingEdits;
  dataOverrides: DataOverride[];
  dataRestoreOverrideIds: string[];
}

interface Checkpoint {
  graph: GraphSnapshot;
  ui: UISnapshot;
  dataOverlay: DataOverlayViewState;
  dataPendingEdits: PendingEdits;
  dataDbVersion: number;
  dataOverrides: DataOverride[];
  aliases: Partial<Record<TutorialAlias, string>>;
  recipeSelector: RecipeSelectorTutorialSnapshot | null;
}

interface AffectedDataIds {
  products: Set<string>;
  machines: Set<string>;
  recipes: Set<string>;
  researches: Set<string>;
  specialRecipes: Set<string>;
}

interface ScopedOverrideResult {
  overrides: DataOverride[];
  affected: AffectedDataIds;
}

interface TutorialState {
  activeTutorialId: TutorialId | null;
  currentStepIndex: number;
  aliases: Partial<Record<TutorialAlias, string>>;
  rootSnapshot: TutorialSnapshot | null;
  checkpoints: Record<number, Checkpoint>;
  latestDataOverrides: DataOverride[];
  createdSaveIds: string[];
  isRestoring: boolean;
  getCurrentStep: () => TutorialStep | null;
  getNodeId: (alias: TutorialAlias) => string | null;
  startTutorial: (id: TutorialId, source?: 'help' | 'first-visit') => Promise<void>;
  exitTutorial: () => Promise<void>;
  previousStep: () => Promise<void>;
  finishTutorial: () => Promise<void>;
  canPerform: (event: TutorialActionEvent) => boolean;
  completeAction: (event: TutorialActionEvent) => boolean;
  registerSaveCreated: (id: string) => void;
}

const clone = <T>(value: T): T => {
  return structuredClone(value);
};

const createEmptyAffectedIds = (): AffectedDataIds => ({
  products: new Set(),
  machines: new Set(),
  recipes: new Set(),
  researches: new Set(),
  specialRecipes: new Set(),
});

function captureGraphSnapshot(): GraphSnapshot {
  const flow = useFlowStore.getState();
  return {
    nodes: clone(flow.nodes),
    edges: clone(flow.edges),
    historyPast: clone(flow.historyPast),
    historyFuture: clone(flow.historyFuture),
    canUndo: flow.canUndo,
    canRedo: flow.canRedo,
  };
}

function captureUISnapshot(): UISnapshot {
  const ui = useUIStore.getState();
  return {
    isControlsMinimized: ui.isControlsMinimized,
    isOverlaysMinimized: ui.isOverlaysMinimized,
    isStatsMinimized: ui.isStatsMinimized,
    isExtendedMinimized: ui.isExtendedMinimized,
    activeToggleId: ui.activeToggleId,
    temporaryOverrides: clone(ui.temporaryOverrides),
    isRecipeSelectorOpen: ui.isRecipeSelectorOpen,
    isSavesOverlayOpen: ui.isSavesOverlayOpen,
    isDataOverlayOpen: ui.isDataOverlayOpen,
    isThemeOverlayOpen: ui.isThemeOverlayOpen,
    isMachineOverlayOpen: ui.isMachineOverlayOpen,
    isHelpOverlayOpen: ui.isHelpOverlayOpen,
    isLPSolverOpen: ui.isLPSolverOpen,
    preselectedProductId: ui.preselectedProductId,
    preselectedSourceSide: ui.preselectedSourceSide,
    preselectedNodeId: ui.preselectedNodeId,
    preselectedHandleIndex: ui.preselectedHandleIndex,
    rateMode: ui.rateMode,
    nodeEditorOpenId: ui.nodeEditorOpenId,
  };
}

function captureCheckpoint(
  aliases: Partial<Record<TutorialAlias, string>>,
  dataOverrides: DataOverride[],
): Checkpoint {
  const ui = captureUISnapshot();
  const dataState = useDataStore.getState();
  let recipeSelector: RecipeSelectorTutorialSnapshot | null = null;
  if (ui.isRecipeSelectorOpen) {
    const initialRecipeSelector = createInitialRecipeSelectorTutorialSnapshot(
      ui.preselectedProductId,
      ui.preselectedSourceSide,
    );
    const capturedRecipeSelector = captureRecipeSelectorTutorialSnapshot();
    recipeSelector = capturedRecipeSelector ?? initialRecipeSelector;
    if (ui.preselectedProductId && recipeSelector.selectedId !== ui.preselectedProductId) {
      recipeSelector = initialRecipeSelector;
    }
  }

  return {
    graph: captureGraphSnapshot(),
    ui,
    dataOverlay: dataState.captureDataOverlayView(),
    dataPendingEdits: clone(dataState.pendingEdits),
    dataDbVersion: dataState.dbVersion,
    dataOverrides: clone(dataOverrides),
    aliases: clone(aliases),
    recipeSelector,
  };
}

function restoreGraphSnapshot(snapshot: GraphSnapshot): void {
  const flow = useFlowStore.getState();
  flow.setNodesAndEdges(clone(snapshot.nodes), clone(snapshot.edges), {
    recordHistory: false,
    resetHistory: true,
  });
  useFlowStore.setState({
    historyPast: clone(snapshot.historyPast),
    historyFuture: clone(snapshot.historyFuture),
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
  });
}

function restoreUISnapshot(snapshot: UISnapshot): void {
  useUIStore.setState({
    isControlsMinimized: snapshot.isControlsMinimized,
    isOverlaysMinimized: snapshot.isOverlaysMinimized,
    isStatsMinimized: snapshot.isStatsMinimized,
    isExtendedMinimized: snapshot.isExtendedMinimized,
    activeToggleId: snapshot.activeToggleId,
    temporaryOverrides: clone(snapshot.temporaryOverrides),
    isRecipeSelectorOpen: snapshot.isRecipeSelectorOpen,
    isSavesOverlayOpen: snapshot.isSavesOverlayOpen,
    isDataOverlayOpen: snapshot.isDataOverlayOpen,
    isThemeOverlayOpen: snapshot.isThemeOverlayOpen,
    isMachineOverlayOpen: snapshot.isMachineOverlayOpen,
    isHelpOverlayOpen: snapshot.isHelpOverlayOpen,
    isLPSolverOpen: snapshot.isLPSolverOpen,
    rateMode: snapshot.rateMode,
    preselectedProductId: snapshot.preselectedProductId,
    preselectedSourceSide: snapshot.preselectedSourceSide,
    preselectedNodeId: snapshot.preselectedNodeId,
    preselectedHandleIndex: snapshot.preselectedHandleIndex,
    nodeEditorOpenId: snapshot.nodeEditorOpenId,
  });
}

function closeTutorialSurfaces(): void {
  useUIStore.setState({
    activeToggleId: null,
    temporaryOverrides: [],
    isRecipeSelectorOpen: false,
    isSavesOverlayOpen: false,
    isDataOverlayOpen: false,
    isThemeOverlayOpen: false,
    isMachineOverlayOpen: false,
    isHelpOverlayOpen: false,
    isLPSolverOpen: false,
    preselectedProductId: null,
    preselectedSourceSide: null,
    preselectedNodeId: null,
    preselectedHandleIndex: null,
    nodeEditorOpenId: null,
  });
}

function collectSpecialRecipeOverrides(overrides: DataOverride[]): Record<string, SpecialRecipe> {
  const specialRecipeEdits: Record<string, SpecialRecipe> = {};
  for (let i = 0; i < overrides.length; i++) {
    const entry = overrides[i];
    if (!entry.id.startsWith('special_recipe:')) continue;
    specialRecipeEdits[entry.id.replace('special_recipe:', '')] =
      entry.data as unknown as SpecialRecipe;
  }
  return specialRecipeEdits;
}

function applyDataOverridesInMemory(overrides: DataOverride[]): void {
  setSpecialRecipeOverrides(collectSpecialRecipeOverrides(overrides));
  rebuildActiveDatabase(overrides);
}

function isOverrideForEntity(
  overrideId: string,
  prefix: DataPrefix,
  entityIds: ReadonlySet<string>,
): boolean {
  return overrideId.startsWith(prefix) && entityIds.has(overrideId.substring(prefix.length));
}

function addProductId(productIds: Set<string>, productId: string | undefined): void {
  if (!productId || productId === 'any_fluid' || productId === 'any_item') return;
  productIds.add(productId);
}

function addOverrideIdToAffected(affected: AffectedDataIds, overrideId: string): void {
  if (overrideId.startsWith('product:')) {
    affected.products.add(overrideId.substring('product:'.length));
  } else if (overrideId.startsWith('machine:')) {
    affected.machines.add(overrideId.substring('machine:'.length));
  } else if (overrideId.startsWith('recipe:')) {
    affected.recipes.add(overrideId.substring('recipe:'.length));
  } else if (overrideId.startsWith('research:')) {
    affected.researches.add(overrideId.substring('research:'.length));
  } else if (overrideId.startsWith('special_recipe:')) {
    affected.specialRecipes.add(overrideId.substring('special_recipe:'.length));
  }
}

function filterPendingRecord<T extends Record<string, unknown>>(
  records: T,
  idsToRemove: ReadonlySet<string>,
): T {
  if (idsToRemove.size === 0) return records;
  const next = { ...records };
  for (const id of idsToRemove) {
    delete next[id];
  }
  return next;
}

function filterPendingEditsForTutorial(
  pendingEdits: PendingEdits,
  affected: AffectedDataIds,
): PendingEdits {
  return {
    products: filterPendingRecord(pendingEdits.products, affected.products),
    machines: filterPendingRecord(pendingEdits.machines, affected.machines),
    recipes: filterPendingRecord(pendingEdits.recipes, affected.recipes),
    researches: filterPendingRecord(pendingEdits.researches, affected.researches),
  };
}

function buildRestoreOverrideIds(affected: AffectedDataIds): string[] {
  const ids: string[] = [];
  for (const id of affected.products) ids.push(`product:${id}`);
  for (const id of affected.machines) ids.push(`machine:${id}`);
  for (const id of affected.recipes) ids.push(`recipe:${id}`);
  for (const id of affected.researches) ids.push(`research:${id}`);
  for (const id of affected.specialRecipes) ids.push(`special_recipe:${id}`);
  return ids;
}

function buildScopedOverridesFromRecipeIds(
  overrides: DataOverride[],
  recipeIds: readonly string[],
): ScopedOverrideResult {
  const affected = createEmptyAffectedIds();
  const recipeIdSet = new Set(recipeIds);
  for (const recipeId of recipeIdSet) {
    affected.recipes.add(recipeId);
    affected.specialRecipes.add(recipeId);
  }

  const recipeDefaultOverrides: DataOverride[] = [];
  for (let i = 0; i < overrides.length; i++) {
    const override = overrides[i];
    if (isOverrideForEntity(override.id, 'recipe:', recipeIdSet)) continue;
    if (isOverrideForEntity(override.id, 'special_recipe:', recipeIdSet)) continue;
    recipeDefaultOverrides.push(override);
  }

  applyDataOverridesInMemory(recipeDefaultOverrides);

  const productIds = new Set<string>();
  const machineIds = new Set<string>();

  for (const recipeId of recipeIdSet) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    machineIds.add(recipe.machine_id);

    for (let i = 0; i < recipe.inputs.length; i++) {
      addProductId(productIds, recipe.inputs[i].product_id);
    }
    for (let i = 0; i < recipe.outputs.length; i++) {
      addProductId(productIds, recipe.outputs[i].product_id);
    }
  }

  for (const productId of productIds) affected.products.add(productId);
  for (const machineId of machineIds) affected.machines.add(machineId);

  const scopedOverrides: DataOverride[] = [];
  for (let i = 0; i < recipeDefaultOverrides.length; i++) {
    const override = recipeDefaultOverrides[i];
    if (isOverrideForEntity(override.id, 'product:', productIds)) continue;
    if (isOverrideForEntity(override.id, 'machine:', machineIds)) continue;
    scopedOverrides.push(override);
  }

  return { overrides: scopedOverrides, affected };
}

function buildScopedOverrides(
  overrides: DataOverride[],
  definition: TutorialDefinition,
): ScopedOverrideResult {
  const affected = createEmptyAffectedIds();
  let scopedOverrides = overrides;

  if (definition.dataScope?.recipeIds?.length) {
    const result = buildScopedOverridesFromRecipeIds(
      scopedOverrides,
      definition.dataScope.recipeIds,
    );
    scopedOverrides = result.overrides;
    for (const id of result.affected.products) affected.products.add(id);
    for (const id of result.affected.machines) affected.machines.add(id);
    for (const id of result.affected.recipes) affected.recipes.add(id);
    for (const id of result.affected.researches) affected.researches.add(id);
    for (const id of result.affected.specialRecipes) affected.specialRecipes.add(id);
  }

  if (definition.dataScope?.overrideIds?.length) {
    const overrideIds = new Set(definition.dataScope.overrideIds);
    for (const overrideId of overrideIds) addOverrideIdToAffected(affected, overrideId);
    scopedOverrides = scopedOverrides.filter((override) => !overrideIds.has(override.id));
  }

  return { overrides: scopedOverrides, affected };
}

async function restoreScopedDataOverrides(
  dataRestoreOverrideIds: string[],
  dataOverrides: DataOverride[],
): Promise<void> {
  if (dataRestoreOverrideIds.length === 0) return;

  const targetOverrides = new Map(dataOverrides.map((entry) => [entry.id, entry]));
  const restoreEntries: DataOverride[] = [];

  for (let i = 0; i < dataRestoreOverrideIds.length; i++) {
    const overrideId = dataRestoreOverrideIds[i];
    const targetOverride = targetOverrides.get(overrideId);
    if (targetOverride) {
      restoreEntries.push(clone(targetOverride));
    } else {
      await deleteDataOverride(overrideId);
    }
  }

  if (restoreEntries.length > 0) {
    await batchSaveDataOverrides(restoreEntries);
  }
}

async function restoreDataSnapshot(
  dataRestoreOverrideIds: string[],
  dataOverrides: DataOverride[],
  dataDbVersion: number,
  dataPendingEdits: PendingEdits,
): Promise<void> {
  await restoreScopedDataOverrides(dataRestoreOverrideIds, dataOverrides);
  await reloadDatabase();
  useDataStore.setState((state) => ({
    pendingEdits: clone(dataPendingEdits),
    dbVersion: Math.max(state.dbVersion + 1, dataDbVersion + 1),
  }));
}

async function restoreRootData(snapshot: TutorialSnapshot): Promise<void> {
  useGlobalSettingsStore.setState({ settings: clone(snapshot.globalSettings) });
  await restoreDataSnapshot(
    snapshot.dataRestoreOverrideIds,
    snapshot.dataOverrides,
    snapshot.dataDbVersion,
    snapshot.dataPendingEdits,
  );
}

function restoreRootSettings(snapshot: TutorialSnapshot): void {
  useGlobalSettingsStore.setState({ settings: clone(snapshot.globalSettings) });
}

function applySandboxSettings(rootSettings: GlobalSettings): void {
  const researchIds = getAllResearches().map((research) => research.id);
  useGlobalSettingsStore.setState({
    settings: {
      ...rootSettings,
      difficulty: 'sandbox',
      unlockedResearchIds: researchIds,
      oreNodesEnabled: true,
      showVariantLimited: true,
    },
  });
}

function applyInitialCanvas(
  definition: TutorialDefinition,
): Partial<Record<TutorialAlias, string>> {
  const flow = useFlowStore.getState();
  if (definition.initialCanvas.type === 'empty') {
    flow.setNodesAndEdges([], [], { recordHistory: false, resetHistory: true });
    return {};
  }

  const { nodes, edges } = deserializeCanvas(definition.initialCanvas.data);
  flow.setNodesAndEdges(nodes, edges, { recordHistory: false, resetHistory: true });
  return { ...(definition.initialCanvas.initialAliases ?? {}) };
}

function getStepIndex(definition: TutorialDefinition, stepId: string | undefined): number {
  if (!stepId) return -1;
  return definition.steps.findIndex((step) => step.id === stepId);
}

function expectedAliasId(
  aliases: Partial<Record<TutorialAlias, string>>,
  alias: TutorialAlias,
): string | null {
  return aliases[alias] ?? null;
}

function allExpectedAliasesSelected(
  expected: Extract<TutorialAction, { type: 'node-multi-select' }>,
  event: TutorialActionEvent,
  aliases: Partial<Record<TutorialAlias, string>>,
): boolean {
  const selectedIds = Array.isArray(event.nodeIds) ? event.nodeIds : null;
  if (!selectedIds) return false;
  const selectedIdSet = new Set(selectedIds.filter((id): id is string => typeof id === 'string'));
  for (let i = 0; i < expected.aliases.length; i++) {
    const nodeId = expectedAliasId(aliases, expected.aliases[i]);
    if (!nodeId || !selectedIdSet.has(nodeId)) return false;
  }
  return true;
}

function actionMatches(
  expected: TutorialAction,
  event: TutorialActionEvent,
  aliases: Partial<Record<TutorialAlias, string>>,
): boolean {
  if (expected.type !== event.type) return false;

  switch (expected.type) {
    case 'continue':
      return true;
    case 'control':
    case 'overlay':
      return expected.id === event.id;
    case 'selector-tab':
      return expected.tab === event.tab;
    case 'selector-search':
      return (
        String(event.query ?? '')
          .trim()
          .toLowerCase() === expected.query.toLowerCase()
      );
    case 'selector-product':
      return expected.productId === event.productId;
    case 'selector-filter':
      return expected.filter === event.filter && expected.value === event.value;
    case 'selector-recipe':
      return expected.recipeId === event.recipeId;
    case 'node-rect':
    case 'node-handle-double':
      return (
        expectedAliasId(aliases, expected.alias) === event.nodeId &&
        expected.side === event.side &&
        expected.index === event.index
      );
    case 'edge-connect':
      return (
        expectedAliasId(aliases, expected.sourceAlias) === event.sourceNodeId &&
        expectedAliasId(aliases, expected.targetAlias) === event.targetNodeId &&
        expected.sourceIndex === event.sourceIndex &&
        expected.targetIndex === event.targetIndex
      );
    case 'node-editor-open':
    case 'target-node':
      return expectedAliasId(aliases, expected.alias) === event.nodeId;
    case 'node-multi-select': {
      if (typeof event.nodeId === 'string') {
        return expected.aliases.some((alias) => expectedAliasId(aliases, alias) === event.nodeId);
      }
      return allExpectedAliasesSelected(expected, event, aliases);
    }
    case 'group-create':
      return typeof event.groupId === 'string' || event.groupId === undefined;
    case 'group-collapse':
    case 'group-expand':
      return expectedAliasId(aliases, expected.alias) === event.groupId;
    case 'node-editor-tab':
      return expected.tab === event.tab;
    case 'node-editor-machine-count':
      return (
        expectedAliasId(aliases, expected.alias) === event.nodeId &&
        Number(event.value) === expected.value
      );
    case 'node-editor-setting':
      return (
        expected.key === event.key &&
        (expected.value === undefined || expected.value === event.value)
      );
    case 'node-editor-apply':
      return expected.mode === event.mode;
    case 'dashboard-diagnostic':
      return (
        expected.status === event.status &&
        expected.productId === event.productId &&
        (!expected.nodeAlias || expectedAliasId(aliases, expected.nodeAlias) === event.nodeId)
      );
    case 'solver-results':
    case 'solver-apply':
      return true;
    case 'save-create':
      return expected.source === event.source;
    case 'save-name':
      return String(event.value ?? '').trim() === expected.value;
    case 'data-main-tab':
      return expected.tab === event.tab;
    case 'data-edit-tab':
      return expected.tab === event.tab;
    case 'data-search':
      return (
        expected.entity === event.entity &&
        String(event.query ?? '')
          .trim()
          .toLowerCase() === expected.query.toLowerCase()
      );
    case 'data-select':
      return expected.entity === event.entity && expected.id === event.id;
    case 'data-add':
      return expected.entity === event.entity;
    case 'data-command':
      return expected.id === event.id;
    case 'data-field':
      if (expected.field !== event.field) return false;
      return typeof expected.value === 'number'
        ? Number(event.value) === expected.value
        : String(event.value ?? '') === String(expected.value);
    case 'data-restore':
      return expected.entity === event.entity && expected.id === event.id;
    case 'data-save':
    case 'data-close':
      return true;
  }
}

function getEventDataOverrides(
  event: TutorialActionEvent,
  fallback: DataOverride[],
): DataOverride[] {
  return Array.isArray(event.dataOverrides)
    ? clone(event.dataOverrides as DataOverride[])
    : fallback;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  activeTutorialId: null,
  currentStepIndex: 0,
  aliases: {},
  rootSnapshot: null,
  checkpoints: {},
  latestDataOverrides: [],
  createdSaveIds: [],
  isRestoring: false,

  getCurrentStep: () => {
    const state = get();
    const definition = getTutorialDefinition(state.activeTutorialId);
    return definition?.steps[state.currentStepIndex] ?? null;
  },

  getNodeId: (alias) => get().aliases[alias] ?? null,

  startTutorial: async (id, source = 'help') => {
    const definition = getTutorialDefinition(id);
    if (!definition) return;

    const dataOverrides = await getDataOverrides();
    const rootSnapshot: TutorialSnapshot = {
      globalSettings: clone(useGlobalSettingsStore.getState().settings),
      dataDbVersion: useDataStore.getState().dbVersion,
      dataPendingEdits: clone(useDataStore.getState().pendingEdits),
      dataOverrides: clone(dataOverrides),
      dataRestoreOverrideIds: [],
    };

    const scoped = buildScopedOverrides(dataOverrides, definition);
    rootSnapshot.dataRestoreOverrideIds = buildRestoreOverrideIds(scoped.affected);

    applyDataOverridesInMemory(scoped.overrides);
    if (definition.useSandboxSettings) {
      applySandboxSettings(rootSnapshot.globalSettings);
    }
    useDataStore.setState((state) => ({
      pendingEdits: filterPendingEditsForTutorial(state.pendingEdits, scoped.affected),
      searchQuery: '',
      customOnly: false,
      dataOverlayMainTab: 'editing',
      dataOverlayEditTab: 'products',
      selectedProductId: null,
      selectedMachineId: null,
      selectedRecipeId: null,
      selectedResearchId: null,
      dbVersion: state.dbVersion + 1,
    }));

    closeTutorialSurfaces();
    const initialAliases = applyInitialCanvas(definition);
    if (definition.useSandboxSettings) {
      applySandboxSettings(rootSnapshot.globalSettings);
    }
    useUIStore.setState({
      isControlsMinimized: false,
      isOverlaysMinimized: false,
      isStatsMinimized: false,
      isExtendedMinimized: false,
    });

    if (source === 'first-visit' && definition.promptStorageKey) {
      localStorage.setItem(definition.promptStorageKey, 'seen');
    }

    set({
      activeTutorialId: id,
      currentStepIndex: 0,
      aliases: initialAliases,
      rootSnapshot,
      checkpoints: {
        0: captureCheckpoint(initialAliases, rootSnapshot.dataOverrides),
      },
      latestDataOverrides: rootSnapshot.dataOverrides,
      createdSaveIds: [],
      isRestoring: false,
    });
  },

  exitTutorial: async () => {
    const state = get();
    if (!state.activeTutorialId || !state.rootSnapshot) return;
    set({ isRestoring: true });
    closeTutorialSurfaces();
    for (const saveId of state.createdSaveIds) {
      await deleteSave(saveId);
    }
    await restoreRootData(state.rootSnapshot);
    set({
      activeTutorialId: null,
      currentStepIndex: 0,
      aliases: {},
      rootSnapshot: null,
      checkpoints: {},
      latestDataOverrides: [],
      createdSaveIds: [],
      isRestoring: false,
    });
  },

  previousStep: async () => {
    const state = get();
    const definition = getTutorialDefinition(state.activeTutorialId);
    if (!definition || state.currentStepIndex <= 0) return;
    const previousIndex = state.currentStepIndex - 1;
    const checkpoint = state.checkpoints[previousIndex];
    if (!checkpoint) return;

    set({ isRestoring: true });
    restoreGraphSnapshot(checkpoint.graph);
    restoreUISnapshot(checkpoint.ui);
    if (state.rootSnapshot) {
      await restoreDataSnapshot(
        state.rootSnapshot.dataRestoreOverrideIds,
        checkpoint.dataOverrides,
        checkpoint.dataDbVersion,
        checkpoint.dataPendingEdits,
      );
    }
    useDataStore.getState().restoreDataOverlayView(checkpoint.dataOverlay);
    restoreRecipeSelectorTutorialSnapshot(checkpoint.recipeSelector);

    const cleanupIndex = getStepIndex(definition, definition.saveCleanupStepId);
    const shouldDropSaves = cleanupIndex !== -1 && previousIndex < cleanupIndex + 1;
    if (shouldDropSaves) {
      for (const saveId of state.createdSaveIds) {
        await deleteSave(saveId);
      }
    }

    set({
      currentStepIndex: previousIndex,
      aliases: clone(checkpoint.aliases),
      latestDataOverrides: clone(checkpoint.dataOverrides),
      createdSaveIds: shouldDropSaves ? [] : state.createdSaveIds,
      isRestoring: false,
    });
  },

  finishTutorial: async () => {
    const state = get();
    const definition = getTutorialDefinition(state.activeTutorialId);
    if (!definition) return;

    if (definition.promptStorageKey) {
      localStorage.setItem(definition.promptStorageKey, 'seen');
    }
    if (definition.completedStorageKey) {
      localStorage.setItem(definition.completedStorageKey, 'true');
    }

    set({ isRestoring: true });
    closeTutorialSurfaces();
    if (state.rootSnapshot) {
      if (definition.restoreRootDataOnFinish !== false) {
        await restoreRootData(state.rootSnapshot);
      } else if (definition.useSandboxSettings) {
        restoreRootSettings(state.rootSnapshot);
      }
    }
    set({
      activeTutorialId: null,
      currentStepIndex: 0,
      aliases: {},
      rootSnapshot: null,
      checkpoints: {},
      latestDataOverrides: [],
      createdSaveIds: [],
      isRestoring: false,
    });
  },

  canPerform: (event) => {
    const state = get();
    if (!state.activeTutorialId || state.isRestoring) return true;
    const step = state.getCurrentStep();
    if (!step) return true;
    return actionMatches(step.action, event, state.aliases);
  },

  completeAction: (event) => {
    const state = get();
    if (!state.activeTutorialId || state.isRestoring) return false;
    const definition = getTutorialDefinition(state.activeTutorialId);
    const step = state.getCurrentStep();
    if (!definition || !step || !actionMatches(step.action, event, state.aliases)) return false;

    const nextAliases = { ...state.aliases };
    if (
      step.action.type === 'selector-recipe' &&
      step.action.alias &&
      typeof event.nodeId === 'string'
    ) {
      nextAliases[step.action.alias] = event.nodeId;
    } else if (step.action.type === 'group-create' && typeof event.groupId === 'string') {
      nextAliases[step.action.alias] = event.groupId;
    }

    const nextDataOverrides = getEventDataOverrides(event, state.latestDataOverrides);
    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex >= definition.steps.length) {
      set({ aliases: nextAliases, latestDataOverrides: nextDataOverrides });
      void get().finishTutorial();
      return true;
    }

    set((current) => ({
      currentStepIndex: nextIndex,
      aliases: nextAliases,
      latestDataOverrides: nextDataOverrides,
      checkpoints: {
        ...current.checkpoints,
        [nextIndex]: captureCheckpoint(nextAliases, nextDataOverrides),
      },
    }));

    return true;
  },

  registerSaveCreated: (id) =>
    set((state) => ({
      createdSaveIds: state.createdSaveIds.includes(id)
        ? state.createdSaveIds
        : [...state.createdSaveIds, id],
    })),
}));

export function isTutorialActive(): boolean {
  return !!useTutorialStore.getState().activeTutorialId;
}

export function canPerformTutorialAction(event: TutorialActionEvent): boolean {
  return useTutorialStore.getState().canPerform(event);
}

export function completeTutorialAction(event: TutorialActionEvent): boolean {
  return useTutorialStore.getState().completeAction(event);
}
