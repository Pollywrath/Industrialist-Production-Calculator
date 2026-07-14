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
import { getRecipePowerTotals } from '../utils/recipePower';
import { getRecipeOptimizationMetrics } from '../utils/optimizationMetrics';
import { ceilMachineCount } from '../utils/precision';
import {
  EMPTY_RESEARCH_INFRASTRUCTURE_STATS,
  getOptimalSatelliteDishCount,
  type ResearchInfrastructureStats,
} from '../utils/researchInfrastructure';

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
  totalPowerUse: number;
  totalPowerOutput: number;
  mvUse: number;
  mvOutput: number;
  hvUse: number;
  hvOutput: number;
  totalModelCount: number;
  totalMachineCost: number;
  totalMachineSpace: number;
  netPollution: number;
  totalProfit: number;
  profitMultiplier: number;
  researchInfrastructure: ResearchInfrastructureStats;
  deficienciesMap: Map<string, ProductDeficiencyGroup>;
  excessesMap: Map<string, ProductExcessGroup>;
  recompute: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  totalPowerUse: 0,
  totalPowerOutput: 0,
  mvUse: 0,
  mvOutput: 0,
  hvUse: 0,
  hvOutput: 0,
  totalModelCount: 0,
  totalMachineCost: 0,
  totalMachineSpace: 0,
  netPollution: 0,
  totalProfit: 0,
  profitMultiplier: 0,
  researchInfrastructure: EMPTY_RESEARCH_INFRASTRUCTURE_STATS,
  deficienciesMap: new Map(),
  excessesMap: new Map(),

  recompute: () => {
    const uiStore = useUIStore.getState();
    const isExtendedMinimized = uiStore.isExtendedMinimized;
    const rateMode = uiStore.rateMode;

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

    let totalPowerUse = 0;
    let totalPowerOutput = 0;
    let mvUse = 0;
    let mvOutput = 0;
    let hvUse = 0;
    let hvOutput = 0;
    let totalModelCount = 0;
    let totalMachineCost = 0;
    let totalMachineSpace = 0;
    let netPollution = 0;
    let totalProfit = 0;
    const researchInfrastructure: ResearchInfrastructureStats = {
      ...EMPTY_RESEARCH_INFRASTRUCTURE_STATS,
    };

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
      const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id, helpers, {
        globalSettings: globalSettings as unknown as Record<string, unknown>,
      });
      if (!recipe) return;

      const sr = getSpecialRecipe(recipe.id);

      const machineCount = node.data.machineCount ?? 0;
      const roundedCount = ceilMachineCount(machineCount);

      const machine = getMachine(recipe.machine_id);
      const machineName = machine?.name ?? 'Machine';

      const optimizationMetrics = getRecipeOptimizationMetrics(
        recipe,
        node.data.settings,
        globalSettings as unknown as Record<string, unknown>,
        node.id,
      );

      if (machine) {
        if (roundedCount > 0 && optimizationMetrics.hasInfiniteMachineCost) {
          totalMachineCost = Infinity;
        } else if (Number.isFinite(totalMachineCost)) {
          totalMachineCost += optimizationMetrics.machineCostPerWholeMachine * roundedCount;
        }
        totalMachineSpace += optimizationMetrics.machineSpacePerWholeMachine * roundedCount;

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
      totalPowerUse += powerTotals.use;
      totalPowerOutput += powerTotals.output;
      mvUse += powerTotals.mvUse;
      mvOutput += powerTotals.mvOutput;
      hvUse += powerTotals.hvUse;
      hvOutput += powerTotals.hvOutput;

      const pollutionMultiplier =
        recipe.pollutionIndependentOfMachineCount || sr?.pollutionIndependentOfMachineCount
          ? 1
          : machineCount;
      netPollution += recipe.pollution * pollutionMultiplier;

      totalModelCount += optimizationMetrics.modelCountPerWholeMachine * roundedCount;

      if (recipe.id === 'r_research_station1_01') {
        researchInfrastructure.researchStation1Count += roundedCount;
      } else if (recipe.id === 'r_research_station2_01') {
        researchInfrastructure.researchStation2Count += roundedCount;
      } else if (recipe.id === 'r_research_station3_01') {
        if (node.data.settings?.has_station_4 === 'Yes') {
          researchInfrastructure.researchStation3With4Count += roundedCount;
        } else {
          researchInfrastructure.researchStation3Count += roundedCount;
        }
      } else if (recipe.id === 'r_satellite_dish_controller_01') {
        const configuredDishes = Number(node.data.settings?.satellite_dish_count ?? 1);
        const dishesPerController = Number.isFinite(configuredDishes)
          ? Math.max(1, Math.round(configuredDishes))
          : 1;
        researchInfrastructure.satelliteDishControllerCount += roundedCount;
        researchInfrastructure.satelliteDishCount += roundedCount * dishesPerController;
        const fluid = getProduct(recipe.inputs[0]?.product_id ?? '');
        researchInfrastructure.satelliteDishResearchPoints +=
          (fluid?.rp_multiplier ?? 0) * roundedCount;
      }

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
            const productId = resolvedProducts[handleId] || helpers.resolveProduct('input', i);
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
            const productId = resolvedProducts[handleId] || helpers.resolveProduct('output', i);
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
    researchInfrastructure.optimalSatelliteDishCount = getOptimalSatelliteDishCount(
      researchInfrastructure.satelliteDishControllerCount,
      researchInfrastructure.satelliteDishResearchPoints,
    );

    set({
      totalPowerUse,
      totalPowerOutput,
      mvUse,
      mvOutput,
      hvUse,
      hvOutput,
      totalModelCount,
      totalMachineCost,
      totalMachineSpace,
      netPollution,
      totalProfit: finalProfit,
      profitMultiplier: y,
      researchInfrastructure,
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
