import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  AlertTriangle,
  Coins,
  Activity,
} from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useFlowStore } from '../../stores/useFlowStore';
import { useFlowResultStore } from '../../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../../stores/useGlobalSettingsStore';
import { getRecipe, getMachine, getProduct, getProductName } from '../../data/lookup';
import { getSpecialRecipe } from '../../data/registry';
import {
  formatCurrency,
  formatPower,
  formatPollution,
  formatQuantity,
  formatMachineCount,
} from '../../utils/unitFormatting';
import { VirtualList } from '../shared/VirtualList';
import { ValidatedNumberInput } from '../shared/ValidatedNumberInput';
import styles from './DashboardPanels.module.css';

interface DiagnosticVirtualItem {
  key: string;
  type: 'header' | 'node';
  productId: string;
  productName: string;
  rate: number;
  nodeId?: string;
  nodeName?: string;
  voidable?: boolean;
  isExpanded?: boolean;
}

interface ProductDeficiencyGroup {
  productId: string;
  productName: string;
  totalRate: number;
  nodes: { nodeId: string; nodeName: string; rate: number }[];
}

interface ProductExcessGroup {
  productId: string;
  productName: string;
  totalRate: number;
  allVoidable: boolean;
  nodes: { nodeId: string; nodeName: string; rate: number; voidable: boolean }[];
}

export function DashboardPanels() {
  const { setCenter } = useReactFlow();
  const isStatsMinimized = useUIStore((s) => s.isStatsMinimized);
  const isExtendedMinimized = useUIStore((s) => s.isExtendedMinimized);
  const toggleStatsMinimized = useUIStore((s) => s.toggleStatsMinimized);
  const toggleExtendedMinimized = useUIStore((s) => s.toggleExtendedMinimized);

  const rateMode = useUIStore((s) => s.rateMode);
  const nodes = useFlowStore((s) => s.nodes);
  const results = useFlowResultStore((s) => s.results);

  const globalPollution = useGlobalSettingsStore((s) => s.settings.global_pollution);
  const setGlobalPollution = useGlobalSettingsStore((s) => s.setGlobalPollution);



  const handleNodeClick = (nodeId?: string) => {
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const x = node.position.x + (node.measured?.width ?? 200) / 2;
      const y = node.position.y + (node.measured?.height ?? 120) / 2;
      setCenter(x, y, { zoom: 1.2 });
    }
  };

  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(() => new Set());

  const toggleProductExpanded = (key: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ─── STATS COMPUTATION ──────────────────────────────────────────────
  let totalConsumption = 0;
  let totalProduction = 0;
  let totalModelCount = 0;
  let totalMachineCost = 0;
  let netPollution = 0;
  let totalProfit = 0;

  nodes.forEach((node) => {
    let recipe = getRecipe(node.data.recipeId);
    if (!recipe) return;

    // Resolve special recipe formulas dynamically
    const sr = getSpecialRecipe(recipe.id);
    if (sr && node.data.settings) {
      const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
        string,
        unknown
      >;
      recipe = sr.compute(node.data.settings, globalSettings);
    }

    const machineCount = node.data.machineCount ?? 0;
    const roundedCount = Math.ceil(machineCount);

    const machine = getMachine(recipe.machine_id);
    if (machine) {
      // Rounded machine counts for machine cost
      totalMachineCost += machine.cost * roundedCount;

      // Calculate profit from Depot sales (scaled by temporal rateModes)
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

    // Power consumption and pollution use raw fractional values
    if (recipe.power_consumption > 0) {
      totalConsumption += recipe.power_consumption * machineCount;
    } else if (recipe.power_consumption < 0) {
      totalProduction += Math.abs(recipe.power_consumption) * machineCount;
    }

    netPollution += recipe.pollution * machineCount;

    // Model Count special formula:
    // - 1 for machine itself
    // - 2 for each input and output
    // - if HV and has power: + 2
    // - if MV and has power: divide by 1500000, ceil, multiply by 2
    let baseModelCount = 1;
    baseModelCount += 2 * recipe.inputs.length;
    baseModelCount += 2 * recipe.outputs.length;

    if (recipe.power_consumption !== 0) {
      if (recipe.power_type === 'HV') {
        baseModelCount += 2;
      } else if (recipe.power_type === 'MV') {
        const absPower = Math.abs(recipe.power_consumption);
        baseModelCount += Math.ceil(absPower / 1500000) * 2;
      }
    }

    totalModelCount += baseModelCount * roundedCount;
  });

  // ─── DIAGNOSTICS GROUPED BY PRODUCT ────────────────────────────────
  const deficienciesMap = new Map<string, ProductDeficiencyGroup>();
  const excessesMap = new Map<string, ProductExcessGroup>();

  const rateModeFactor = rateMode === 'minute' ? 60 : rateMode === 'hour' ? 3600 : 1;

  nodes.forEach((node) => {
    const nodeFlowResult = results.get(node.id);
    if (!nodeFlowResult) return;

    let recipe = getRecipe(node.data.recipeId);
    if (!recipe) return;

    const sr = getSpecialRecipe(recipe.id);
    if (sr && node.data.settings) {
      const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
        string,
        unknown
      >;
      recipe = sr.compute(node.data.settings, globalSettings);
    }

    const machine = getMachine(recipe.machine_id);
    const machineName = machine?.name ?? 'Machine';

    // Inputs -> Deficiencies
    for (let i = 0; i < recipe.inputs.length; i++) {
      const inputFlow = nodeFlowResult.inputFlows[i];
      if (inputFlow && inputFlow.hasDeficiency) {
        const productId = recipe.inputs[i]?.product_id;
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

    // Outputs -> Excesses
    for (let i = 0; i < recipe.outputs.length; i++) {
      const outputFlow = nodeFlowResult.outputFlows[i];
      if (outputFlow && outputFlow.hasExcess) {
        const outDef = recipe.outputs[i];
        const productId = outDef?.product_id;
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
  });

  // Flatten maps to expand/collapse-ready lists for VirtualList
  const flatDeficiencies: DiagnosticVirtualItem[] = [];
  deficienciesMap.forEach((group) => {
    const isExpanded = expandedProducts.has(`def-${group.productId}`);
    flatDeficiencies.push({
      key: `def-header-${group.productId}`,
      type: 'header',
      productId: group.productId,
      productName: group.productName,
      rate: group.totalRate,
      isExpanded,
    });
    if (isExpanded) {
      group.nodes.forEach((n) => {
        flatDeficiencies.push({
          key: `def-node-${group.productId}-${n.nodeId}`,
          type: 'node',
          productId: group.productId,
          productName: group.productName,
          rate: n.rate,
          nodeId: n.nodeId,
          nodeName: n.nodeName,
        });
      });
    }
  });

  const flatExcesses: DiagnosticVirtualItem[] = [];
  excessesMap.forEach((group) => {
    const isExpanded = expandedProducts.has(`exc-${group.productId}`);
    flatExcesses.push({
      key: `exc-header-${group.productId}`,
      type: 'header',
      productId: group.productId,
      productName: group.productName,
      rate: group.totalRate,
      isExpanded,
      voidable: group.allVoidable,
    });
    if (isExpanded) {
      group.nodes.forEach((n) => {
        flatExcesses.push({
          key: `exc-node-${group.productId}-${n.nodeId}`,
          type: 'node',
          productId: group.productId,
          productName: group.productName,
          rate: n.rate,
          nodeId: n.nodeId,
          nodeName: n.nodeName,
          voidable: n.voidable,
        });
      });
    }
  });

  const getProfitSuffix = () => {
    if (rateMode === 'minute') return '/m';
    if (rateMode === 'hour') return '/h';
    return '/s';
  };

  const getRateSuffix = () => {
    if (rateMode === 'minute') return '/m';
    if (rateMode === 'hour') return '/h';
    if (rateMode === 'raw') return ' (raw)';
    return '/s';
  };

  return (
    <div className={styles['dashboard-container']}>
      {/* ─── 1. STATS PANEL ─────────────────────────────────────────── */}
      <div className={styles['panel']}>
        <button className={styles['panel-header']} onClick={toggleStatsMinimized}>
          <span className={styles['panel-header-title']}>
            <Activity className={styles['panel-header-icon']} size={12} />
            Production Stats
          </span>
          {isStatsMinimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {!isStatsMinimized && (
          <div className={styles['panel-body']}>
            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <Zap size={10} /> Power Consumption
              </span>
              <span className={styles['stat-value']}>{formatPower(totalConsumption)}</span>
            </div>

            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <Zap size={10} className={styles['power-production-icon']} /> Power Production
              </span>
              <span className={styles['stat-value']}>{formatPower(totalProduction)}</span>
            </div>

            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <Activity size={10} /> Minimum Model Count
              </span>
              <span className={styles['stat-value']}>{formatMachineCount(totalModelCount)}</span>
            </div>

            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <Coins size={10} /> Machine Cost
              </span>
              <span className={styles['stat-value']}>{formatCurrency(totalMachineCost)}</span>
            </div>

            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <TrendingUp size={10} /> Profit
              </span>
              <span
                className={`${styles['stat-value']} ${totalProfit > 0.0001
                    ? styles['success']
                    : totalProfit < -0.0001
                      ? styles['error']
                      : styles['neutral']
                  }`}
              >
                {formatCurrency(totalProfit)}
                {getProfitSuffix()}
              </span>
            </div>

            <div className={styles['stat-row']}>
              <span className={styles['stat-label']}>
                <AlertTriangle size={10} /> Net Pollution
              </span>
              <span
                className={`${styles['stat-value']} ${netPollution < -0.0001
                    ? styles['success']
                    : netPollution > 0.0001
                      ? styles['error']
                      : styles['neutral']
                  }`}
              >
                {formatPollution(netPollution)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── 2. EXTENDED PANEL ──────────────────────────────────────── */}
      <div className={styles['panel']}>
        <button className={styles['panel-header']} onClick={toggleExtendedMinimized}>
          <span className={styles['panel-header-title']}>
            <AlertTriangle className={styles['panel-header-icon']} size={12} />
            More Stats
          </span>
          {isExtendedMinimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {!isExtendedMinimized && (
          <div className={styles['panel-body']}>
            {/* Global Pollution Control */}
            <div className={styles['global-var-group']}>
              <span className={styles['global-var-label']}>Global Pollution</span>
              <div className={styles['global-var-control']}>
                <ValidatedNumberInput
                  value={globalPollution}
                  onChange={setGlobalPollution}
                  defaultValue={1}
                  allowDecimals={true}
                  allowNegatives={false}
                  min={0}
                  step="any"
                  className={styles['global-var-input']}
                />
              </div>
            </div>

            {/* Deficiencies (Shortages) */}
            <div className={styles['diagnostic-section-title']}>Deficiencies (Shortages)</div>
            <div className={styles['diagnostic-container']}>
              {flatDeficiencies.length === 0 ? (
                <div className={styles['empty-message']}>No shortages detected</div>
              ) : (
                <VirtualList<DiagnosticVirtualItem>
                  items={flatDeficiencies}
                  itemHeight={28}
                  height={Math.min(flatDeficiencies.length * 28, 140)}
                  getKey={(item) => item.key}
                >
                  {(item) =>
                    item.type === 'header' ? (
                      <div
                        className={styles['diagnostic-row-header']}
                        onClick={() => toggleProductExpanded(`def-${item.productId}`)}
                      >
                        <div className={styles['diagnostic-header-left']}>
                          {item.isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          <span className={styles['diagnostic-product-name']}>
                            {item.productName}
                          </span>
                        </div>
                        <div className={styles['diagnostic-header-right']}>
                          <span className={`${styles['diagnostic-rate']} ${styles['deficiency']}`}>
                            -{formatQuantity(item.rate)}
                            {getRateSuffix()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={styles['diagnostic-row-node']}
                        onClick={() => handleNodeClick(item.nodeId)}
                      >
                        <span className={styles['diagnostic-node-indent']}>└─ {item.nodeName}</span>
                        <div className={styles['diagnostic-node-right']}>
                          <span
                            className={`${styles['diagnostic-rate-sub']} ${styles['deficiency']}`}
                          >
                            -{formatQuantity(item.rate)}
                            {getRateSuffix()}
                          </span>
                        </div>
                      </div>
                    )
                  }
                </VirtualList>
              )}
            </div>

            {/* Excess Byproducts */}
            <div className={`${styles['diagnostic-section-title']} ${styles['is-spaced']}`}>
              Excess Byproducts
            </div>
            <div className={styles['diagnostic-container']}>
              {flatExcesses.length === 0 ? (
                <div className={styles['empty-message']}>No excesses detected</div>
              ) : (
                <VirtualList<DiagnosticVirtualItem>
                  items={flatExcesses}
                  itemHeight={28}
                  height={Math.min(flatExcesses.length * 28, 140)}
                  getKey={(item) => item.key}
                >
                  {(item) =>
                    item.type === 'header' ? (
                      <div
                        className={styles['diagnostic-row-header']}
                        onClick={() => toggleProductExpanded(`exc-${item.productId}`)}
                      >
                        <div className={styles['diagnostic-header-left']}>
                          {item.isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          <span className={styles['diagnostic-product-name']}>
                            {item.productName}
                          </span>
                        </div>
                        <div className={styles['diagnostic-header-right']}>
                          <span className={`${styles['diagnostic-rate']} ${styles['excess']}`}>
                            +{formatQuantity(item.rate)}
                            {getRateSuffix()}
                          </span>
                          {item.voidable && (
                            <span className={`${styles['badge']} ${styles['voided']}`}>Voided</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={styles['diagnostic-row-node']}
                        onClick={() => handleNodeClick(item.nodeId)}
                      >
                        <span className={styles['diagnostic-node-indent']}>└─ {item.nodeName}</span>
                        <div className={styles['diagnostic-node-right']}>
                          <span className={`${styles['diagnostic-rate-sub']} ${styles['excess']}`}>
                            +{formatQuantity(item.rate)}
                            {getRateSuffix()}
                          </span>
                          {item.voidable && (
                            <span className={`${styles['badge']} ${styles['voided']}`}>Voided</span>
                          )}
                        </div>
                      </div>
                    )
                  }
                </VirtualList>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
