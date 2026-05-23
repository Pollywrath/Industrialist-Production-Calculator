import { create } from 'zustand';
import { useFlowStore } from './useFlowStore';
import { useFlowResultStore } from './useFlowResultStore';
import { useUIStore } from './useUIStore';
import { useGlobalSettingsStore } from './useGlobalSettingsStore';
import { resolveActiveRecipe, getMachine, getProduct, getProductName } from '../data/lookup';
import { resolveHandleProduct, buildEdgeLookupMap } from '../utils/productResolver';
import { getSpecialRecipe } from '../data/registry';
import { buildHandleId } from '../utils/idGenerator';

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
        deficienciesMap: new Map(),
        excessesMap: new Map(),
      });
      return;
    }

    const flowStore = useFlowStore.getState();
    const nodes = flowStore.nodes;
    const storeNodesMap = flowStore.nodesMap;
    const edges = flowStore.edges;
    const resolvedProducts = flowStore.resolvedProducts;
    const results = useFlowResultStore.getState().results;
    const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
      string,
      unknown
    >;

    let totalConsumption = 0;
    let totalProduction = 0;
    let totalModelCount = 0;
    let totalMachineCost = 0;
    let netPollution = 0;
    let totalProfit = 0;

    const deficienciesMap = new Map<string, ProductDeficiencyGroup>();
    const excessesMap = new Map<string, ProductExcessGroup>();

    const rateModeFactor = rateMode === 'minute' ? 60 : rateMode === 'hour' ? 3600 : 1;
    const edgeLookup = buildEdgeLookupMap(edges);

    nodes.forEach((node) => {
      const helpers = {
        resolveProduct: (s: 'input' | 'output', idx: number) =>
          resolveHandleProduct(node.id, s, idx, storeNodesMap, edgeLookup),
        hasConnection: (s: 'input' | 'output', idx: number) => {
          const handleId = `${node.id}-${s}-${idx}`;
          return (edgeLookup.get(handleId)?.length ?? 0) > 0;
        },
      };
      const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id, helpers);
      if (!recipe) return;

      const sr = getSpecialRecipe(recipe.id);

      const machineCount = node.data.machineCount ?? 0;
      const roundedCount = Math.ceil(machineCount);

      const machine = getMachine(recipe.machine_id);
      const machineName = machine?.name ?? 'Machine';

      if (machine) {
        const baseCost = sr && sr.computeMachineCost
          ? sr.computeMachineCost(node.data.settings ?? {}, globalSettings, node.id)
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

      if (recipe.power_consumption > 0) {
        totalConsumption += recipe.power_consumption * machineCount;
      } else if (recipe.power_consumption < 0) {
        totalProduction += Math.abs(recipe.power_consumption) * machineCount;
      }

      netPollution += recipe.pollution * machineCount;

      let baseModelCount: number;
      if (sr && sr.computeModelCount) {
        baseModelCount = sr.computeModelCount(node.data.settings ?? {}, globalSettings, node.id);
      } else {
        baseModelCount = 1 + 2 * recipe.inputs.length + 2 * recipe.outputs.length;

        if (recipe.power_consumption !== 0) {
          if (recipe.power_type === 'HV') {
            baseModelCount += 2;
          } else if (recipe.power_type === 'MV') {
            const absPower = Math.abs(recipe.power_consumption);
            baseModelCount += Math.ceil(absPower / 1500000) * 2;
          }
        }
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
            const productId = resolvedProducts[handleId] || resolveHandleProduct(node.id, 'input', i, storeNodesMap, edgeLookup);
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
            const productId = resolvedProducts[handleId] || resolveHandleProduct(node.id, 'output', i, storeNodesMap, edgeLookup);
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

    set({
      totalConsumption,
      totalProduction,
      totalModelCount,
      totalMachineCost,
      netPollution,
      totalProfit,
      deficienciesMap,
      excessesMap,
    });
  },
}));

// Setup subscriptions to trigger recomputation only when dependency states change
export function initDashboardStore(): () => void {
  // 1. Recompute on solver execution updates
  const unsubFlow = useFlowStore.subscribe(
    (s) => s.solverVersion,
    () => {
      useDashboardStore.getState().recompute();
    }
  );

  // 2. Recompute when results map updates
  let lastResults = useFlowResultStore.getState().results;
  const unsubFlowResult = useFlowResultStore.subscribe((state) => {
    if (state.results !== lastResults) {
      lastResults = state.results;
      useDashboardStore.getState().recompute();
    }
  });

  // 3. Recompute on UI config changes that affect dashboard rendering
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

  // 4. Recompute on global settings (pollution) changes
  let lastGlobalPollution = useGlobalSettingsStore.getState().settings.global_pollution;
  const unsubGlobalSettings = useGlobalSettingsStore.subscribe((state) => {
    if (state.settings.global_pollution !== lastGlobalPollution) {
      lastGlobalPollution = state.settings.global_pollution;
      useDashboardStore.getState().recompute();
    }
  });

  // Run initial computation on setup
  useDashboardStore.getState().recompute();

  return () => {
    unsubFlow();
    unsubFlowResult();
    unsubUI();
    unsubGlobalSettings();
  };
}

// Run initial computation once on module load so the store is pre-populated
useDashboardStore.getState().recompute();
