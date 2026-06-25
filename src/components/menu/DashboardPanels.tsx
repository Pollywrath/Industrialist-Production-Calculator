import { useState, useEffect } from 'react';
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
import { useGlobalSettingsStore } from '../../stores/useGlobalSettingsStore';
import { useDashboardStore, initDashboardStore } from '../../stores/useDashboardStore';
import { isGroupNode, isRecipeNode } from '../../types/nodes';
import {
  formatCurrency,
  formatPower,
  formatPollution,
  formatQuantity,
  formatMachineCount,
} from '../../utils/unitFormatting';
import { VirtualList } from '../shared/VirtualList';
import { ValidatedNumberInput } from '../shared/ValidatedNumberInput';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../stores/useTutorialStore';
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

export function DashboardPanels() {
  useEffect(() => {
    const unsubscribe = initDashboardStore();
    return unsubscribe;
  }, []);

  const { setCenter } = useReactFlow();
  const isStatsMinimized = useUIStore((s) => s.isStatsMinimized);
  const isExtendedMinimized = useUIStore((s) => s.isExtendedMinimized);
  const toggleStatsMinimized = useUIStore((s) => s.toggleStatsMinimized);
  const toggleExtendedMinimized = useUIStore((s) => s.toggleExtendedMinimized);
  const rateMode = useUIStore((s) => s.rateMode);

  const globalPollution = useGlobalSettingsStore((s) => s.settings.global_pollution);
  const difficulty = useGlobalSettingsStore((s) => s.settings.difficulty);
  const setGlobalPollution = useGlobalSettingsStore((s) => s.setGlobalPollution);

  const {
    totalConsumption,
    totalProduction,
    totalModelCount,
    totalMachineCost,
    netPollution,
    totalProfit,
    profitMultiplier,
    deficienciesMap,
    excessesMap,
  } = useDashboardStore();

  const handleNodeClick = (
    nodeId: string | undefined,
    status?: 'deficiency' | 'excess',
    productId?: string,
  ) => {
    if (!nodeId) return;
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'dashboard-diagnostic', status, productId, nodeId })
    ) {
      return;
    }

    const nodes = useFlowStore.getState().nodes;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const targetNode =
      isRecipeNode(node) && node.data.groupId
        ? (() => {
            const groupNode = nodes.find((n) => n.id === node.data.groupId);
            return isGroupNode(groupNode) && groupNode.data.collapsed ? groupNode : node;
          })()
        : node;

    if (targetNode) {
      const x = targetNode.position.x + (targetNode.measured?.width ?? targetNode.width ?? 200) / 2;
      const y = targetNode.position.y + (targetNode.measured?.height ?? targetNode.height ?? 120) / 2;
      setCenter(x, y, { zoom: 1.2 });
      completeTutorialAction({ type: 'dashboard-diagnostic', status, productId, nodeId });
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

  const handleDiagnosticHeaderClick = (
    status: 'deficiency' | 'excess',
    productId: string,
    key: string,
  ) => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'dashboard-diagnostic', status, productId })
    ) {
      return;
    }
    toggleProductExpanded(key);
    completeTutorialAction({ type: 'dashboard-diagnostic', status, productId });
  };

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
      <div className={styles['panel']}>
        <button
          className={styles['panel-header']}
          onClick={() => {
            if (isTutorialActive()) return;
            toggleStatsMinimized();
          }}
        >
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
              <span className={styles['stat-value']}>
                <span
                  className={`${styles['stat-value']} ${styles['profit-pct']} ${
                    profitMultiplier > 0.0001
                      ? styles['success']
                      : profitMultiplier < -0.0001
                        ? styles['error']
                        : styles['neutral']
                  }`}
                >
                  ({profitMultiplier >= 0 ? '+' : ''}
                  {profitMultiplier.toFixed(2)}%)
                </span>
                <span
                  className={`${styles['stat-value']} ${
                    totalProfit > 0.0001
                      ? styles['success']
                      : totalProfit < -0.0001
                        ? styles['error']
                        : styles['neutral']
                  }`}
                >
                  {formatCurrency(totalProfit)}
                  {getProfitSuffix()}
                </span>
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

      <div className={styles['panel']}>
        <button
          className={styles['panel-header']}
          onClick={() => {
            if (isTutorialActive()) return;
            toggleExtendedMinimized();
          }}
        >
          <span className={styles['panel-header-title']}>
            <AlertTriangle className={styles['panel-header-icon']} size={12} />
            More Stats
          </span>
          {isExtendedMinimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {!isExtendedMinimized && (
          <div className={styles['panel-body']}>
            <div className={styles['global-var-group']}>
              <span className={styles['global-var-label']}>Global Pollution</span>
              <div className={styles['global-var-control']}>
                {(() => {
                  const isImpossible = difficulty === 'impossible' || difficulty === 'impossible2';
                  return (
                    <ValidatedNumberInput
                      value={globalPollution}
                      onChange={setGlobalPollution}
                      defaultValue={1}
                      allowDecimals={true}
                      allowNegatives={!isImpossible}
                      min={isImpossible ? 0 : undefined}
                      step="any"
                      className={styles['global-var-input']}
                    />
                  );
                })()}
              </div>
            </div>

            <div className={styles['diagnostic-section-title']}>Deficiencies (Shortages)</div>
            <div className={styles['diagnostic-container']} data-tutorial-dashboard="outputs">
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
                        onClick={() =>
                          handleDiagnosticHeaderClick(
                            'deficiency',
                            item.productId,
                            `def-${item.productId}`,
                          )
                        }
                        data-tutorial-diagnostic-status="deficiency"
                        data-tutorial-diagnostic-product={item.productId}
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
                        onClick={() => handleNodeClick(item.nodeId, 'deficiency', item.productId)}
                        data-tutorial-diagnostic-status="deficiency"
                        data-tutorial-diagnostic-product={item.productId}
                        data-tutorial-diagnostic-node={item.nodeId}
                      >
                        <span className={styles['diagnostic-node-indent']}>|- {item.nodeName}</span>
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
                        onClick={() =>
                          handleDiagnosticHeaderClick(
                            'excess',
                            item.productId,
                            `exc-${item.productId}`,
                          )
                        }
                        data-tutorial-diagnostic-status="excess"
                        data-tutorial-diagnostic-product={item.productId}
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
                        onClick={() => handleNodeClick(item.nodeId, 'excess', item.productId)}
                        data-tutorial-diagnostic-status="excess"
                        data-tutorial-diagnostic-product={item.productId}
                        data-tutorial-diagnostic-node={item.nodeId}
                      >
                        <span className={styles['diagnostic-node-indent']}>|- {item.nodeName}</span>
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

