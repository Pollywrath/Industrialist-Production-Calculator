import { create } from 'zustand';
import { useFlowStore } from './useFlowStore';
import { useFlowResultStore } from './useFlowResultStore';
import { useUIStore } from './useUIStore';
import { useGlobalSettingsStore } from './useGlobalSettingsStore';
import { resolveActiveRecipe, getMachine, getProduct, getProductName } from '../data/lookup';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { getSpecialRecipe } from '../data/registry';
import { buildHandleId } from '../utils/idGenerator';
import { isRecipeNode } from '../types/nodes';
import { estimatePowerModelCount, getRecipePowerTotals } from '../utils/recipePower';

export interface ProductDeficiencyGroup {
  productId: string;
  productName: string;
  totalRate: number;
  nodes: { nodeId: string; nodeName: string; rate: number }[];
}

export interface ProductExcessGroup {
  productId: string;
  productName: string;
  totalRate: number;
  allVoidable: boolean;
  nodes: { nodeId: string; nodeName: string; rate: number; voidable: boolean }[];
}

interface DashboardState {
  totalConsumption: number;
  totalProduction: number;
  totalModelCount: number;
  totalMachineCost: number;
  netPollution: number;
  totalProfit: number;
  profitMultiplier: number;
  deficienciesMap: Map<string, ProductDeficiencyGroup>;
  excessesMap: Map<string, ProductExcessGroup>;
  recompute: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  totalConsumption: 0,
  totalProduction: 0,
  totalModelCount: 0,
  totalMachineCost: 0,
  netPollution: 0,
  totalProfit: 0,
  profitMultiplier: 0,
  deficienciesMap: new Map(),
  excessesMap: new Map(),

  recompute: () => {
    const uiStore = useUIStore.getState();
    const isStatsMinimized = uiStore.isStatsMinimized;
    const isExtendedMinimized = uiStore.isExtendedMinimized;
    const rateMode = uiStore.rateMode;

    if (isStatsMinimized && isExtendedMinimized) {
      set({
        totalConsumption: 0,
        totalProduction: 0,
        totalModelCount: 0,
        totalMachineCost: 0,
        netPollution: 0,
        totalProfit: 0,
        profitMultiplier: 0,
        deficienciesMap: new Map(),
        excessesMap: new Map(),
      });
      return;
    }

    const flowStore = useFlowStore.getState();
    const nodes = flowStore.nodes.filter(isRecipeNode);
    const recipeNodeIds = new Set(nodes.map((node) => node.id));
    const edges = flowStore.edges.filter(
      (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
    );
    const flowResultState = useFlowResultStore.getState();
    const isSolutionFresh = flowResultState.graphVersion === flowStore.graphVersion;
    const resolvedProducts = isSolutionFresh ? flowResultState.resolvedProducts : {};
    const results = isSolutionFresh ? flowResultState.results : new Map();
    const edgeFlows = isSolutionFresh ? flowResultState.edgeFlows : {};
    const globalSettings = useGlobalSettingsStore.getState().settings;

    let totalConsumption = 0;
    let totalProduction = 0;
    let totalModelCount = 0;
    let totalMachineCost = 0;
    let netPollution = 0;
    let totalProfit = 0;

    const deficienciesMap = new Map<string, ProductDeficiencyGroup>();
    const excessesMap = new Map<string, ProductExcessGroup>();

    const rateModeFactor = rateMode === 'minute' ? 60 : rateMode === 'hour' ? 3600 : 1;
    const resolutionContext = createGraphResolutionContext(nodes, edges);

    nodes.forEach((node) => {
      const baseHelpers = resolutionContext.createHelpers(node.id);
      const helpers = {
        ...baseHelpers,
        getFlowRate: (side: 'input' | 'output', index: number) => {
          const handleId = buildHandleId(node.id, side, index);
          const connectedEdges = resolutionContext.edgeLookup.get(handleId) ?? [];
          let totalFlow = 0;
          for (let i = 0; i < connectedEdges.length; i++) {
            totalFlow += edgeFlows[connectedEdges[i].id] ?? 0;
          }
          return totalFlow;
        },
      };
      const recipe = resolveActiveRecipe(
        node.data.recipeId,
        node.data.settings,
        node.id,
        helpers,
        { globalSettings: globalSettings as unknown as Record<string, unknown> },
      );
      if (!recipe) return;

      const sr = getSpecialRecipe(recipe.id);

      const machineCount = node.data.machineCount ?? 0;
      const roundedCount = Math.ceil(machineCount);

      const machine = getMachine(recipe.machine_id);
      const machineName = machine?.name ?? 'Machine';

      const defaultSettings = sr
        ? Object.entries(sr.settings).reduce(
            (acc, [key, def]) => {
              acc[key] = def.default;
              return acc;
            },
            {} as Record<string, unknown>,
          )
        : {};
      const resolvedSettings = {
        ...defaultSettings,
        ...(node.data.settings ?? {}),
      };

      if (machine) {
        const baseCost =
          sr && sr.computeMachineCost
            ? sr.computeMachineCost(resolvedSettings, globalSettings as unknown as Record<string, unknown>, node.id)
            : machine.cost;
        totalMachineCost += baseCost * roundedCount;

        if (machine.subcategory === 'Depot') {
          const nodeFlowResult = results.get(node.id);
          if (nodeFlowResult) {
            for (let i = 0; i < recipe.inputs.length; i++) {
              const inputEntry = recipe.inputs[i];
              const inputFlow = nodeFlowResult.inputFlows[i];
              if (inputEntry && inputFlow) {
                const ratePerSec = inputFlow.connected;
                const product = getProduct(inputEntry.product_id);
                if (product) {
                  const profitPerSec = ratePerSec * product.sell_price;
                  let scaledProfit = profitPerSec;
                  if (rateMode === 'minute') {
                    scaledProfit = profitPerSec * 60;
                  } else if (rateMode === 'hour') {
                    scaledProfit = profitPerSec * 3600;
                  }
                  totalProfit += scaledProfit;
                }
              }
            }
          }
        }
      }

      const powerTotals = getRecipePowerTotals(recipe, machineCount);
      totalConsumption += powerTotals.consumption;
      totalProduction += powerTotals.production;

      const pollutionMultiplier = (recipe.pollutionIndependentOfMachineCount || sr?.pollutionIndependentOfMachineCount) ? 1 : machineCount;
      netPollution += recipe.pollution * pollutionMultiplier;

      let baseModelCount: number;
      if (sr && sr.computeModelCount) {
        baseModelCount = sr.computeModelCount(resolvedSettings, globalSettings as unknown as Record<string, unknown>, node.id);
      } else {
        baseModelCount = 1 + 2 * recipe.inputs.length + 2 * recipe.outputs.length;

        baseModelCount += estimatePowerModelCount(recipe);
      }

      totalModelCount += baseModelCount * roundedCount;

      if (!isExtendedMinimized) {
        const nodeFlowResult = results.get(node.id);
        if (!nodeFlowResult) return;

        for (let i = 0; i < recipe.inputs.length; i++) {
          const inputEntry = recipe.inputs[i];
          if (inputEntry?.variable) continue;
          const inputFlow = nodeFlowResult.inputFlows[i];
          if (inputFlow && inputFlow.hasDeficiency) {
            const rawProductId = inputEntry?.product_id;
            if (!rawProductId) continue;
            const handleId = buildHandleId(node.id, 'input', i);
            const productId =
              resolvedProducts[handleId] ||
              helpers.resolveProduct('input', i);
            if (!productId) continue;
            const defRate = (inputFlow.rate - inputFlow.connected) * rateModeFactor;
            if (defRate > 0.0001) {
              let group = deficienciesMap.get(productId);
              if (!group) {
                group = {
                  productId,
                  productName: getProductName(productId),
                  totalRate: 0,
                  nodes: [],
                };
                deficienciesMap.set(productId, group);
              }
              group.totalRate += defRate;
              group.nodes.push({
                nodeId: node.id,
                nodeName: machineName,
                rate: defRate,
              });
            }
          }
        }

        for (let i = 0; i < recipe.outputs.length; i++) {
          const outDef = recipe.outputs[i];
          if (outDef?.variable) continue;
          const outputFlow = nodeFlowResult.outputFlows[i];
          if (outputFlow && outputFlow.hasExcess) {
            if (!outDef) continue;
            const handleId = buildHandleId(node.id, 'output', i);
            const productId =
              resolvedProducts[handleId] ||
              helpers.resolveProduct('output', i);
            if (!productId) continue;
            const excRate = (outputFlow.rate - outputFlow.connected) * rateModeFactor;
            if (excRate > 0.0001) {
              let group = excessesMap.get(productId);
              if (!group) {
                group = {
                  productId,
                  productName: getProductName(productId),
                  totalRate: 0,
                  allVoidable: true,
                  nodes: [],
                };
                excessesMap.set(productId, group);
              }
              group.totalRate += excRate;
              const isVoidable = !!outDef.voidable;
              if (!isVoidable) {
                group.allVoidable = false;
              }
              group.nodes.push({
                nodeId: node.id,
                nodeName: machineName,
                rate: excRate,
                voidable: isVoidable,
              });
            }
          }
        }
      }
    });

    const difficulty = globalSettings.difficulty || 'normal';
    const x = globalSettings.global_pollution;
    
    let y: number;
    if (difficulty === 'hard') {
      const val = (-77 * x) / 290;
      const lower = -2800 / 29;
      const upper = 200 / 29;
      y = Math.min(Math.max(val, lower), upper);
    } else if (difficulty === 'impossible') {
      const val = -(x * x) / 290;
      const lower = -2800 / 29;
      const upper = 0;
      y = Math.min(Math.max(val, lower), upper);
    } else if (difficulty === 'impossible2') {
      const val = -x / 2;
      const lower = -2850 / 29;
      const upper = 200 / 29;
      y = Math.min(Math.max(val, lower), upper);
    } else {
      const val = (-5 * x) / 29;
      const lower = -2800 / 29;
      const upper = 200 / 29;
      y = Math.min(Math.max(val, lower), upper);
    }

    const finalProfit = totalProfit * (1 + y / 100);

    set({
      totalConsumption,
      totalProduction,
      totalModelCount,
      totalMachineCost,
      netPollution,
      totalProfit: finalProfit,
      profitMultiplier: y,
      deficienciesMap,
      excessesMap,
    });
  },
}));

export function initDashboardStore(): () => void {
  const unsubSolution = useFlowStore.subscribe(
    (s) => s.solutionVersion,
    () => {
      useDashboardStore.getState().recompute();
    },
  );
  const unsubGraph = useFlowStore.subscribe(
    (s) => s.graphVersion,
    () => {
      useDashboardStore.getState().recompute();
    },
  );

  let lastRateMode = useUIStore.getState().rateMode;
  let lastIsStatsMinimized = useUIStore.getState().isStatsMinimized;
  let lastIsExtendedMinimized = useUIStore.getState().isExtendedMinimized;

  const unsubUI = useUIStore.subscribe((state) => {
    if (
      state.rateMode !== lastRateMode ||
      state.isStatsMinimized !== lastIsStatsMinimized ||
      state.isExtendedMinimized !== lastIsExtendedMinimized
    ) {
      lastRateMode = state.rateMode;
      lastIsStatsMinimized = state.isStatsMinimized;
      lastIsExtendedMinimized = state.isExtendedMinimized;
      useDashboardStore.getState().recompute();
    }
  });

  let lastGlobalSettings = useGlobalSettingsStore.getState().settings;
  const unsubGlobalSettings = useGlobalSettingsStore.subscribe((state) => {
    if (state.settings !== lastGlobalSettings) {
      lastGlobalSettings = state.settings;
      useDashboardStore.getState().recompute();
    }
  });

  useDashboardStore.getState().recompute();

  return () => {
    unsubSolution();
    unsubGraph();
    unsubUI();
    unsubGlobalSettings();
  };
}

useDashboardStore.getState().recompute();
