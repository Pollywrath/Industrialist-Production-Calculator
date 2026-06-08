import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Cpu,
  FlaskConical,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import {
  fetchCachedWikiBucketRows,
  getCachedWikiBucketRows,
  type CachedWikiBucketRowsResult,
  type IndustrialistBucketName,
} from '../../../services/wikiBucketApi';
import {
  compareProducts,
  compareMachines,
  compareRecipes,
  getWikiBoolean,
  getWikiNumber,
  getWikiString,
  type WikiRecipe,
} from '../../../utils/dataComparator';
import { getAllProducts, getAllMachines, getAllResearches, getAllRecipes } from '../../../data/lookup';
import styles from './DataOverlay.module.css';
import { VirtualList } from '../../shared/VirtualList';
import type { Recipe } from '../../../types/data';

interface ComparatorVirtualRow {
  key: string;
  type: 'header' | 'diff-header' | 'diff-row' | 'prop-row';
  itemKey: string;
  isExpanded: boolean;
  diffCount?: number;
  badgeType?: 'changed' | 'only-app' | 'only-wiki';
  field?: string;
  appValue?: unknown;
  wikiValue?: unknown;
  propLabel?: string;
  propValue?: unknown;
  isLastChild?: boolean;
}

type ComparatorDataType = 'products' | 'machines' | 'recipes' | 'research';
type BucketLoadStatus = 'idle' | 'loading' | 'success' | 'cached' | 'error';
type ComparisonFilter = 'changed' | 'onlyInApp' | 'onlyInWiki' | 'unchanged';

interface BucketSnapshot {
  bucket: IndustrialistBucketName;
  status: BucketLoadStatus;
  rows: unknown;
  error?: string;
  warning?: string;
  fetchedAt?: number;
  checkedAt?: number;
}

const COMPARATOR_TABS: Array<{
  id: ComparatorDataType;
  label: string;
  icon: ComponentType<{ size?: number }>;
}> = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'machines', label: 'Machines', icon: Cpu },
    { id: 'recipes', label: 'Recipes', icon: ClipboardList },
    { id: 'research', label: 'Research', icon: FlaskConical },
  ];

const DATA_TYPE_BUCKETS: Record<ComparatorDataType, IndustrialistBucketName[]> = {
  products: ['items'],
  machines: ['machines'],
  recipes: ['recipes_info', 'recipes_inputs', 'recipes_outputs', 'machines'],
  research: [],
};
const COMPARATOR_BUCKETS = Array.from(
  new Set(Object.values(DATA_TYPE_BUCKETS).flat()),
) as IndustrialistBucketName[];

function snapshotFromResult(result: CachedWikiBucketRowsResult): BucketSnapshot {
  return {
    bucket: result.bucket,
    status: result.source === 'cache' ? 'cached' : 'success',
    rows: result.rows,
    fetchedAt: result.fetchedAt,
    checkedAt: result.checkedAt,
    warning: result.freshnessError
      ? `Using cached data. Freshness check failed: ${result.freshnessError}`
      : undefined,
  };
}

function getBucketRowsCount(rows: unknown): number {
  return Array.isArray(rows) ? rows.length : rows === undefined ? 0 : 1;
}

function getBucketOutput(snapshot: BucketSnapshot | undefined): string {
  if (!snapshot || snapshot.rows === undefined) return '[]';
  return JSON.stringify(snapshot.rows, null, 2);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatFetchedAt(timestamp: number | undefined): string {
  if (!timestamp) return 'Not fetched';
  return new Date(timestamp).toLocaleTimeString();
}

export function DataComparatorTab() {
  const [activeTab, setActiveTab] = useState<ComparatorDataType>('products');
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>('changed');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [snapshots, setSnapshots] = useState<Partial<Record<IndustrialistBucketName, BucketSnapshot>>>({});

  const activeBuckets = DATA_TYPE_BUCKETS[activeTab];
  const hasActiveLoading = activeBuckets.some((bucket) => snapshots[bucket]?.status === 'loading');
  const hasActiveRows = activeBuckets.some((bucket) => snapshots[bucket]?.rows !== undefined);

  useEffect(() => {
    let isCancelled = false;

    const loadCachedBuckets = async () => {
      const cachedSnapshots = await Promise.all(
        COMPARATOR_BUCKETS.map(async (bucket) => ({
          bucket,
          result: await getCachedWikiBucketRows({ bucket }),
        })),
      );

      if (isCancelled) return;

      setSnapshots((prev) => {
        const next = { ...prev };
        for (const { bucket, result } of cachedSnapshots) {
          if (result && next[bucket]?.rows === undefined) {
            next[bucket] = snapshotFromResult(result);
          }
        }
        return next;
      });
    };

    void loadCachedBuckets();

    return () => {
      isCancelled = true;
    };
  }, []);

  const fetchBucket = async (bucket: IndustrialistBucketName) => {
    setSnapshots((prev) => ({
      ...prev,
      [bucket]: {
        bucket,
        status: 'loading',
        rows: prev[bucket]?.rows,
        warning: prev[bucket]?.warning,
        fetchedAt: prev[bucket]?.fetchedAt,
        checkedAt: prev[bucket]?.checkedAt,
      },
    }));

    try {
      const result = await fetchCachedWikiBucketRows({ bucket });
      setSnapshots((prev) => ({
        ...prev,
        [bucket]: snapshotFromResult(result),
      }));
    } catch (error) {
      setSnapshots((prev) => ({
        ...prev,
        [bucket]: {
          bucket,
          status: 'error',
          rows: prev[bucket]?.rows,
          error: getErrorMessage(error),
          warning: prev[bucket]?.warning,
          fetchedAt: prev[bucket]?.fetchedAt,
          checkedAt: prev[bucket]?.checkedAt,
        },
      }));
    }
  };

  const fetchActiveBuckets = () => {
    activeBuckets.forEach((bucket) => {
      void fetchBucket(bucket);
    });
  };

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const productsCompare = (() => {
    const itemsSnapshot = snapshots.items;
    if (!itemsSnapshot || !Array.isArray(itemsSnapshot.rows)) return null;
    return compareProducts(getAllProducts(), itemsSnapshot.rows as Record<string, unknown>[]);
  })();

  const machinesCompare = (() => {
    const machinesSnapshot = snapshots.machines;
    if (!machinesSnapshot || !Array.isArray(machinesSnapshot.rows)) return null;
    return compareMachines(
      getAllMachines(),
      machinesSnapshot.rows as Record<string, unknown>[],
      getAllResearches(),
      getAllMachines()
    );
  })();

  const recipesCompare = (() => {
    const infoSnap = snapshots.recipes_info;
    const inputsSnap = snapshots.recipes_inputs;
    const outputsSnap = snapshots.recipes_outputs;
    const machinesSnap = snapshots.machines;
    if (
      !infoSnap ||
      !inputsSnap ||
      !outputsSnap ||
      !machinesSnap ||
      !Array.isArray(infoSnap.rows) ||
      !Array.isArray(inputsSnap.rows) ||
      !Array.isArray(outputsSnap.rows) ||
      !Array.isArray(machinesSnap.rows)
    ) {
      return null;
    }
    return compareRecipes(
      getAllRecipes(),
      infoSnap.rows as Record<string, unknown>[],
      inputsSnap.rows as Record<string, unknown>[],
      outputsSnap.rows as Record<string, unknown>[],
      getAllMachines(),
      getAllProducts(),
      machinesSnap.rows as Record<string, unknown>[]
    );
  })();

  const renderSubTabs = (
    changedCount: number,
    onlyInAppCount: number,
    onlyInWikiCount: number,
    unchangedCount: number
  ) => {
    return (
      <div className={styles['compare-subtabs']}>
        <button
          className={`${styles['compare-subtab-btn']} ${activeFilter === 'changed' ? styles['is-active'] : ''}`}
          onClick={() => setActiveFilter('changed')}
        >
          <span>Changed</span>
          <span className={styles['compare-subtab-count']}>{changedCount}</span>
        </button>
        <button
          className={`${styles['compare-subtab-btn']} ${activeFilter === 'onlyInApp' ? styles['is-active'] : ''}`}
          onClick={() => setActiveFilter('onlyInApp')}
        >
          <span>Only in App</span>
          <span className={styles['compare-subtab-count']}>{onlyInAppCount}</span>
        </button>
        <button
          className={`${styles['compare-subtab-btn']} ${activeFilter === 'onlyInWiki' ? styles['is-active'] : ''}`}
          onClick={() => setActiveFilter('onlyInWiki')}
        >
          <span>Only in Wiki</span>
          <span className={styles['compare-subtab-count']}>{onlyInWikiCount}</span>
        </button>
        <button
          className={`${styles['compare-subtab-btn']} ${activeFilter === 'unchanged' ? styles['is-active'] : ''}`}
          onClick={() => setActiveFilter('unchanged')}
        >
          <span>Unchanged</span>
          <span className={styles['compare-subtab-count']}>{unchangedCount}</span>
        </button>
      </div>
    );
  };

  const renderProductsTab = () => {
    const snapshot = snapshots.items;
    const status = snapshot?.status ?? 'idle';

    if (status === 'loading') {
      return (
        <div className={styles['compare-empty']}>
          <RefreshCw className={styles['spin']} size={32} />
          <div className={styles['compare-empty-title']}>Loading Wiki Data...</div>
        </div>
      );
    }

    if (status === 'error' && (!snapshot || !snapshot.rows)) {
      return (
        <div className={styles['compare-empty']}>
          <AlertTriangle size={32} />
          <div className={styles['compare-empty-title']}>Error Loading Wiki Data</div>
          <div className={styles['compare-empty-desc']}>{snapshot?.error}</div>
        </div>
      );
    }

    if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
      return (
        <div className={styles['compare-empty']}>
          <Package size={32} />
          <div className={styles['compare-empty-title']}>No Wiki Data Fetched</div>
          <div className={styles['compare-empty-desc']}>
            Click the "Fetch" button in the toolbar to load product data from the wiki.
          </div>
        </div>
      );
    }

    const result = productsCompare;
    if (!result) return null;

    const currentList =
      activeFilter === 'changed'
        ? result.changed
        : activeFilter === 'onlyInApp'
          ? result.onlyInApp
          : activeFilter === 'onlyInWiki'
            ? result.onlyInWiki
            : result.unchanged;

    const flatItems: ComparatorVirtualRow[] = [];

    currentList.forEach((item) => {
      const productKey = item.key;
      const expKey = `product-${activeFilter}-${productKey}`;
      const isExpanded = expandedKeys.has(expKey);

      if (activeFilter === 'changed') {
        flatItems.push({
          key: `header-${productKey}`,
          type: 'header',
          itemKey: productKey,
          isExpanded,
          diffCount: item.differences?.length,
          badgeType: 'changed',
        });
        if (isExpanded && item.differences) {
          flatItems.push({
            key: `diff-header-${productKey}`,
            type: 'diff-header',
            itemKey: productKey,
            isExpanded,
          });
          item.differences.forEach((diff, idx) => {
            flatItems.push({
              key: `diff-${productKey}-${diff.field}`,
              type: 'diff-row',
              itemKey: productKey,
              isExpanded,
              field: diff.field,
              appValue: diff.appValue,
              wikiValue: diff.wikiValue,
              isLastChild: idx === item.differences!.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInApp') {
        const p = item.appItem!;
        flatItems.push({
          key: `header-${productKey}`,
          type: 'header',
          itemKey: productKey,
          isExpanded,
          badgeType: 'only-app',
        });
        if (isExpanded) {
          const props = [
            { label: 'Type', val: p.type },
            { label: 'Sell Price', val: p.sell_price },
            { label: 'RP Multiplier', val: p.rp_multiplier },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${productKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: productKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInWiki') {
        const row = item.wikiItem!;
        const isFluid = getWikiBoolean(row.is_fluid);
        const sellPrice = getWikiNumber(row.sellvalue !== undefined ? row.sellvalue : row.sellValue);
        const rpMultiplier = getWikiNumber(row.resvalue !== undefined ? row.resvalue : row.resValue);

        flatItems.push({
          key: `header-${productKey}`,
          type: 'header',
          itemKey: productKey,
          isExpanded,
          badgeType: 'only-wiki',
        });
        if (isExpanded) {
          const props = [
            { label: 'Type', val: isFluid ? 'Fluid' : 'Item' },
            { label: 'Sell Price', val: sellPrice },
            { label: 'RP Multiplier', val: rpMultiplier },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${productKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: productKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else {
        flatItems.push({
          key: `header-${productKey}`,
          type: 'header',
          itemKey: productKey,
          isExpanded: false,
        });
      }
    });

    return (
      <>
        {snapshot.warning && (
          <div className={styles['compare-warning']}>{snapshot.warning}</div>
        )}
        {snapshot.error && (
          <div className={styles['compare-error']}>{snapshot.error}</div>
        )}

        {renderSubTabs(
          result.changed.length,
          result.onlyInApp.length,
          result.onlyInWiki.length,
          result.unchanged.length
        )}

        <div className={styles['compare-results-container']}>
          {flatItems.length === 0 ? (
            <div className={styles['diff-empty-msg']}>
              No items in this category.
            </div>
          ) : (
            <VirtualList<ComparatorVirtualRow>
              key={`products-${activeFilter}`}
              items={flatItems}
              itemHeight={32}
              height={450}
              getKey={(item) => item.key}
            >
              {(row) => {
                if (row.type === 'header') {
                  const expKey = `product-${activeFilter}-${row.itemKey}`;
                  if (activeFilter === 'unchanged') {
                    return (
                      <div className={styles['unchanged-row']} style={{ height: '100%' }}>
                        <CheckCircle2 className={styles['unchanged-icon']} size={14} />
                        <span>{row.itemKey}</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      className={styles['compare-row-header']}
                      style={{ height: '100%', borderBottom: row.isExpanded ? 'none' : undefined }}
                      onClick={() => toggleExpanded(expKey)}
                    >
                      <div className={styles['compare-row-header-left']}>
                        {row.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{row.itemKey}</span>
                      </div>
                      <div className={styles['compare-row-header-right']}>
                        {row.badgeType === 'changed' && (
                          <span className={`${styles['compare-row-badge']} ${styles['changed']}`}>
                            {row.diffCount} {row.diffCount === 1 ? 'difference' : 'differences'}
                          </span>
                        )}
                        {row.badgeType === 'only-app' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-app']}`}>
                            Only in App
                          </span>
                        )}
                        {row.badgeType === 'only-wiki' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-wiki']}`}>
                            Only in Wiki
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (row.type === 'diff-header') {
                  return (
                    <div className={styles['compare-row-diff-header']}>
                      <div className={styles['compare-row-diff-cell']}>Field</div>
                      <div className={styles['compare-row-diff-cell']}>App Value</div>
                      <div className={styles['compare-row-diff-cell']}>Wiki Value</div>
                    </div>
                  );
                }

                if (row.type === 'diff-row') {
                  return (
                    <div className={`${styles['compare-row-diff']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['field']}`}>{row.field}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['app']}`}>{String(row.appValue)}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['wiki']}`}>{String(row.wikiValue)}</div>
                    </div>
                  );
                }

                if (row.type === 'prop-row') {
                  return (
                    <div className={`${styles['compare-row-prop']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['label']}`}>{row.propLabel}</div>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['value']}`}>{String(row.propValue)}</div>
                    </div>
                  );
                }

                return null;
              }}
            </VirtualList>
          )}
        </div>
      </>
    );
  };

  const renderMachinesTab = () => {
    const snapshot = snapshots.machines;
    const status = snapshot?.status ?? 'idle';

    if (status === 'loading') {
      return (
        <div className={styles['compare-empty']}>
          <RefreshCw className={styles['spin']} size={32} />
          <div className={styles['compare-empty-title']}>Loading Wiki Data...</div>
        </div>
      );
    }

    if (status === 'error' && (!snapshot || !snapshot.rows)) {
      return (
        <div className={styles['compare-empty']}>
          <AlertTriangle size={32} />
          <div className={styles['compare-empty-title']}>Error Loading Wiki Data</div>
          <div className={styles['compare-empty-desc']}>{snapshot?.error}</div>
        </div>
      );
    }

    if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
      return (
        <div className={styles['compare-empty']}>
          <Cpu size={32} />
          <div className={styles['compare-empty-title']}>No Wiki Data Fetched</div>
          <div className={styles['compare-empty-desc']}>
            Click the "Fetch" button in the toolbar to load machine data from the wiki.
          </div>
        </div>
      );
    }

    const result = machinesCompare;
    if (!result) return null;

    const currentList =
      activeFilter === 'changed'
        ? result.changed
        : activeFilter === 'onlyInApp'
          ? result.onlyInApp
          : activeFilter === 'onlyInWiki'
            ? result.onlyInWiki
            : result.unchanged;

    const researchesList = getAllResearches();
    const researchMap = new Map(researchesList.map((r) => [r.id, r.name]));
    const machinesList = getAllMachines();
    const machineIdToNameMap = new Map(machinesList.map((m) => [m.id, m.name]));

    const flatItems: ComparatorVirtualRow[] = [];

    currentList.forEach((item) => {
      const machineKey = item.key;
      const expKey = `machine-${activeFilter}-${machineKey}`;
      const isExpanded = expandedKeys.has(expKey);

      if (activeFilter === 'changed') {
        flatItems.push({
          key: `header-${machineKey}`,
          type: 'header',
          itemKey: machineKey,
          isExpanded,
          diffCount: item.differences?.length,
          badgeType: 'changed',
        });
        if (isExpanded && item.differences) {
          flatItems.push({
            key: `diff-header-${machineKey}`,
            type: 'diff-header',
            itemKey: machineKey,
            isExpanded,
          });
          item.differences.forEach((diff, idx) => {
            flatItems.push({
              key: `diff-${machineKey}-${diff.field}`,
              type: 'diff-row',
              itemKey: machineKey,
              isExpanded,
              field: diff.field,
              appValue: diff.appValue,
              wikiValue: diff.wikiValue,
              isLastChild: idx === item.differences!.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInApp') {
        const m = item.appItem!;
        const appResearchName = researchMap.get(m.research) || m.research || '(None)';
        let appVariantName = 'none';
        if (m.variant && m.variant !== 'none') {
          appVariantName = machineIdToNameMap.get(m.variant) || m.variant;
        }
        const sizeStr = `${m.size.x}x${m.size.y}`;

        flatItems.push({
          key: `header-${machineKey}`,
          type: 'header',
          itemKey: machineKey,
          isExpanded,
          badgeType: 'only-app',
        });
        if (isExpanded) {
          const props = [
            { label: 'Category', val: m.category },
            { label: 'Subcategory', val: m.subcategory },
            { label: 'Cost', val: m.cost },
            { label: 'Tier', val: m.tier },
            { label: 'Size', val: sizeStr },
            { label: 'Limited', val: m.limited ? 'Yes' : 'No' },
            { label: 'Variant', val: appVariantName },
            { label: 'Research', val: appResearchName },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${machineKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: machineKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInWiki') {
        const row = item.wikiItem!;
        const category = getWikiString(row.category);
        const subcategory = getWikiString(row.subcategory);
        const cost = getWikiNumber(row.cost);
        const tier = getWikiNumber(row.tier);
        const size = getWikiString(row.size);
        const limited = getWikiBoolean(row.limited);
        const variant = getWikiString(row.variant);
        const research = getWikiString(row.research);

        flatItems.push({
          key: `header-${machineKey}`,
          type: 'header',
          itemKey: machineKey,
          isExpanded,
          badgeType: 'only-wiki',
        });
        if (isExpanded) {
          const props = [
            { label: 'Category', val: category },
            { label: 'Subcategory', val: subcategory },
            { label: 'Cost', val: cost },
            { label: 'Tier', val: tier },
            { label: 'Size', val: size },
            { label: 'Limited', val: limited ? 'Yes' : 'No' },
            { label: 'Variant', val: variant },
            { label: 'Research', val: research },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${machineKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: machineKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else {
        flatItems.push({
          key: `header-${machineKey}`,
          type: 'header',
          itemKey: machineKey,
          isExpanded: false,
        });
      }
    });

    return (
      <>
        {snapshot.warning && (
          <div className={styles['compare-warning']}>{snapshot.warning}</div>
        )}
        {snapshot.error && (
          <div className={styles['compare-error']}>{snapshot.error}</div>
        )}

        {renderSubTabs(
          result.changed.length,
          result.onlyInApp.length,
          result.onlyInWiki.length,
          result.unchanged.length
        )}

        <div className={styles['compare-results-container']}>
          {flatItems.length === 0 ? (
            <div className={styles['diff-empty-msg']}>
              No items in this category.
            </div>
          ) : (
            <VirtualList<ComparatorVirtualRow>
              key={`machines-${activeFilter}`}
              items={flatItems}
              itemHeight={32}
              height={450}
              getKey={(item) => item.key}
            >
              {(row) => {
                if (row.type === 'header') {
                  const expKey = `machine-${activeFilter}-${row.itemKey}`;
                  if (activeFilter === 'unchanged') {
                    return (
                      <div className={styles['unchanged-row']} style={{ height: '100%' }}>
                        <CheckCircle2 className={styles['unchanged-icon']} size={14} />
                        <span>{row.itemKey}</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      className={styles['compare-row-header']}
                      style={{ height: '100%', borderBottom: row.isExpanded ? 'none' : undefined }}
                      onClick={() => toggleExpanded(expKey)}
                    >
                      <div className={styles['compare-row-header-left']}>
                        {row.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{row.itemKey}</span>
                      </div>
                      <div className={styles['compare-row-header-right']}>
                        {row.badgeType === 'changed' && (
                          <span className={`${styles['compare-row-badge']} ${styles['changed']}`}>
                            {row.diffCount} {row.diffCount === 1 ? 'difference' : 'differences'}
                          </span>
                        )}
                        {row.badgeType === 'only-app' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-app']}`}>
                            Only in App
                          </span>
                        )}
                        {row.badgeType === 'only-wiki' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-wiki']}`}>
                            Only in Wiki
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (row.type === 'diff-header') {
                  return (
                    <div className={styles['compare-row-diff-header']}>
                      <div className={styles['compare-row-diff-cell']}>Field</div>
                      <div className={styles['compare-row-diff-cell']}>App Value</div>
                      <div className={styles['compare-row-diff-cell']}>Wiki Value</div>
                    </div>
                  );
                }

                if (row.type === 'diff-row') {
                  return (
                    <div className={`${styles['compare-row-diff']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['field']}`}>{row.field}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['app']}`}>{String(row.appValue)}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['wiki']}`}>{String(row.wikiValue)}</div>
                    </div>
                  );
                }

                if (row.type === 'prop-row') {
                  return (
                    <div className={`${styles['compare-row-prop']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['label']}`}>{row.propLabel}</div>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['value']}`}>{String(row.propValue)}</div>
                    </div>
                  );
                }

                return null;
              }}
            </VirtualList>
          )}
        </div>
      </>
    );
  };

  const renderRecipesTab = () => {
    const infoSnap = snapshots.recipes_info;
    const inputsSnap = snapshots.recipes_inputs;
    const outputsSnap = snapshots.recipes_outputs;
    const machinesSnap = snapshots.machines;

    const isAnyLoading =
      infoSnap?.status === 'loading' ||
      inputsSnap?.status === 'loading' ||
      outputsSnap?.status === 'loading' ||
      machinesSnap?.status === 'loading';

    if (isAnyLoading) {
      return (
        <div className={styles['compare-empty']}>
          <RefreshCw className={styles['spin']} size={32} />
          <div className={styles['compare-empty-title']}>Loading Wiki Data...</div>
        </div>
      );
    }

    const isAnyError =
      (infoSnap?.status === 'error' && (!infoSnap.rows || (Array.isArray(infoSnap.rows) && infoSnap.rows.length === 0))) ||
      (inputsSnap?.status === 'error' && (!inputsSnap.rows || (Array.isArray(inputsSnap.rows) && inputsSnap.rows.length === 0))) ||
      (outputsSnap?.status === 'error' && (!outputsSnap.rows || (Array.isArray(outputsSnap.rows) && outputsSnap.rows.length === 0))) ||
      (machinesSnap?.status === 'error' && (!machinesSnap.rows || (Array.isArray(machinesSnap.rows) && machinesSnap.rows.length === 0)));

    if (isAnyError) {
      const errorMsg =
        infoSnap?.error || inputsSnap?.error || outputsSnap?.error || machinesSnap?.error || 'Unknown error';
      return (
        <div className={styles['compare-empty']}>
          <AlertTriangle size={32} />
          <div className={styles['compare-empty-title']}>Error Loading Wiki Data</div>
          <div className={styles['compare-empty-desc']}>{errorMsg}</div>
        </div>
      );
    }

    const hasNoData =
      !infoSnap || !Array.isArray(infoSnap.rows) || infoSnap.rows.length === 0 ||
      !inputsSnap || !Array.isArray(inputsSnap.rows) || inputsSnap.rows.length === 0 ||
      !outputsSnap || !Array.isArray(outputsSnap.rows) || outputsSnap.rows.length === 0 ||
      !machinesSnap || !Array.isArray(machinesSnap.rows) || machinesSnap.rows.length === 0;

    if (hasNoData) {
      return (
        <div className={styles['compare-empty']}>
          <ClipboardList size={32} />
          <div className={styles['compare-empty-title']}>No Wiki Data Fetched</div>
          <div className={styles['compare-empty-desc']}>
            Click the "Fetch" button in the toolbar to load recipe data from the wiki.
          </div>
        </div>
      );
    }

    const result = recipesCompare;
    if (!result) return null;

    const currentList =
      activeFilter === 'changed'
        ? result.changed
        : activeFilter === 'onlyInApp'
          ? result.onlyInApp
          : activeFilter === 'onlyInWiki'
            ? result.onlyInWiki
            : result.unchanged;

    const productsList = getAllProducts();
    const productMap = new Map(productsList.map((p) => [p.id, p.name]));
    const machinesList = getAllMachines();
    const machineMap = new Map(machinesList.map((m) => [m.id, m.name]));

    const formatAppInputs = (r: Recipe) => {
      const grouped = new Map<string, number>();
      for (const input of r.inputs) {
        const name = productMap.get(input.product_id) || input.product_id;
        grouped.set(name, (grouped.get(name) || 0) + input.quantity);
      }
      return Array.from(grouped.entries())
        .map(([name, quantity]) => `${name} x${quantity}`)
        .join(', ') || '(None)';
    };

    const formatAppOutputs = (r: Recipe) => {
      const grouped = new Map<string, number>();
      for (const output of r.outputs) {
        const name = productMap.get(output.product_id) || output.product_id;
        grouped.set(name, (grouped.get(name) || 0) + output.quantity);
      }
      return Array.from(grouped.entries())
        .map(([name, quantity]) => `${name} x${quantity}`)
        .join(', ') || '(None)';
    };

    const formatWikiInputs = (wr: WikiRecipe) => {
      const grouped = new Map<string, number>();
      for (const input of wr.inputs) {
        grouped.set(input.item, (grouped.get(input.item) || 0) + input.amount);
      }
      return Array.from(grouped.entries())
        .map(([item, amount]) => `${item} x${amount}`)
        .join(', ') || '(None)';
    };

    const formatWikiOutputs = (wr: WikiRecipe) => {
      const grouped = new Map<string, number>();
      for (const output of wr.outputs) {
        grouped.set(output.item, (grouped.get(output.item) || 0) + output.amount);
      }
      return Array.from(grouped.entries())
        .map(([item, amount]) => `${item} x${amount}`)
        .join(', ') || '(None)';
    };

    const flatItems: ComparatorVirtualRow[] = [];

    currentList.forEach((item) => {
      const recipeKey = item.key;
      const expKey = `recipe-${activeFilter}-${recipeKey}`;
      const isExpanded = expandedKeys.has(expKey);

      if (activeFilter === 'changed') {
        flatItems.push({
          key: `header-${recipeKey}`,
          type: 'header',
          itemKey: recipeKey,
          isExpanded,
          diffCount: item.differences?.length,
          badgeType: 'changed',
        });
        if (isExpanded && item.differences) {
          flatItems.push({
            key: `diff-header-${recipeKey}`,
            type: 'diff-header',
            itemKey: recipeKey,
            isExpanded,
          });
          item.differences.forEach((diff, idx) => {
            flatItems.push({
              key: `diff-${recipeKey}-${diff.field}`,
              type: 'diff-row',
              itemKey: recipeKey,
              isExpanded,
              field: diff.field,
              appValue: diff.appValue,
              wikiValue: diff.wikiValue,
              isLastChild: idx === item.differences!.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInApp') {
        const r = item.appItem!;
        const appMachineName = machineMap.get(r.machine_id) || r.machine_id;

        flatItems.push({
          key: `header-${recipeKey}`,
          type: 'header',
          itemKey: recipeKey,
          isExpanded,
          badgeType: 'only-app',
        });
        if (isExpanded) {
          const props = [
            { label: 'Machine', val: appMachineName },
            { label: 'Cycle Time', val: r.cycle_time },
            { label: 'Power Consumption', val: r.power_consumption },
            { label: 'Pollution', val: r.pollution },
            { label: 'Inputs', val: formatAppInputs(r) },
            { label: 'Outputs', val: formatAppOutputs(r) },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${recipeKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: recipeKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else if (activeFilter === 'onlyInWiki') {
        const wr = item.wikiItem!;

        flatItems.push({
          key: `header-${recipeKey}`,
          type: 'header',
          itemKey: recipeKey,
          isExpanded,
          badgeType: 'only-wiki',
        });
        if (isExpanded) {
          const props = [
            { label: 'Machine', val: wr.machine },
            { label: 'Cycle Time', val: wr.time },
            { label: 'Power Consumption', val: wr.mamyflux },
            { label: 'Pollution', val: wr.pollution || '(None)' },
            { label: 'Inputs', val: formatWikiInputs(wr) },
            { label: 'Outputs', val: formatWikiOutputs(wr) },
          ];
          props.forEach((prop, idx) => {
            flatItems.push({
              key: `prop-${recipeKey}-${prop.label}`,
              type: 'prop-row',
              itemKey: recipeKey,
              isExpanded,
              propLabel: prop.label,
              propValue: prop.val,
              isLastChild: idx === props.length - 1,
            });
          });
        }
      } else {
        flatItems.push({
          key: `header-${recipeKey}`,
          type: 'header',
          itemKey: recipeKey,
          isExpanded: false,
        });
      }
    });

    const warning = infoSnap?.warning || inputsSnap?.warning || outputsSnap?.warning || machinesSnap?.warning;
    const error = infoSnap?.error || inputsSnap?.error || outputsSnap?.error || machinesSnap?.error;

    return (
      <>
        {warning && (
          <div className={styles['compare-warning']}>{warning}</div>
        )}
        {error && (
          <div className={styles['compare-error']}>{error}</div>
        )}

        {renderSubTabs(
          result.changed.length,
          result.onlyInApp.length,
          result.onlyInWiki.length,
          result.unchanged.length
        )}

        <div className={styles['compare-results-container']}>
          {flatItems.length === 0 ? (
            <div className={styles['diff-empty-msg']}>
              No items in this category.
            </div>
          ) : (
            <VirtualList<ComparatorVirtualRow>
              key={`recipes-${activeFilter}`}
              items={flatItems}
              itemHeight={32}
              height={450}
              getKey={(item) => item.key}
            >
              {(row) => {
                if (row.type === 'header') {
                  const expKey = `recipe-${activeFilter}-${row.itemKey}`;
                  if (activeFilter === 'unchanged') {
                    return (
                      <div className={styles['unchanged-row']} style={{ height: '100%' }}>
                        <CheckCircle2 className={styles['unchanged-icon']} size={14} />
                        <span>{row.itemKey}</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      className={styles['compare-row-header']}
                      style={{ height: '100%', borderBottom: row.isExpanded ? 'none' : undefined }}
                      onClick={() => toggleExpanded(expKey)}
                    >
                      <div className={styles['compare-row-header-left']}>
                        {row.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{row.itemKey}</span>
                      </div>
                      <div className={styles['compare-row-header-right']}>
                        {row.badgeType === 'changed' && (
                          <span className={`${styles['compare-row-badge']} ${styles['changed']}`}>
                            {row.diffCount} {row.diffCount === 1 ? 'difference' : 'differences'}
                          </span>
                        )}
                        {row.badgeType === 'only-app' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-app']}`}>
                            Only in App
                          </span>
                        )}
                        {row.badgeType === 'only-wiki' && (
                          <span className={`${styles['compare-row-badge']} ${styles['only-wiki']}`}>
                            Only in Wiki
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                if (row.type === 'diff-header') {
                  return (
                    <div className={styles['compare-row-diff-header']}>
                      <div className={styles['compare-row-diff-cell']}>Field</div>
                      <div className={styles['compare-row-diff-cell']}>App Value</div>
                      <div className={styles['compare-row-diff-cell']}>Wiki Value</div>
                    </div>
                  );
                }

                if (row.type === 'diff-row') {
                  return (
                    <div className={`${styles['compare-row-diff']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['field']}`}>{row.field}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['app']}`}>{String(row.appValue)}</div>
                      <div className={`${styles['compare-row-diff-cell']} ${styles['wiki']}`}>{String(row.wikiValue)}</div>
                    </div>
                  );
                }

                if (row.type === 'prop-row') {
                  return (
                    <div className={`${styles['compare-row-prop']} ${row.isLastChild ? styles['is-last'] : ''}`}>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['label']}`}>{row.propLabel}</div>
                      <div className={`${styles['compare-row-prop-cell']} ${styles['value']}`}>{String(row.propValue)}</div>
                    </div>
                  );
                }

                return null;
              }}
            </VirtualList>
          )}
        </div>
      </>
    );
  };

  return (
    <div className={styles['compare-container']}>
      <div className={styles['compare-tabs']}>
        {COMPARATOR_TABS.map((tab) => {
          const Icon = tab.icon;
          const buckets = DATA_TYPE_BUCKETS[tab.id];
          const loadedCount = buckets.filter((bucket) => snapshots[bucket]?.rows !== undefined).length;
          return (
            <button
              key={tab.id}
              className={`${styles['compare-tab-btn']} ${activeTab === tab.id ? styles['is-active'] : ''
                }`}
              onClick={() => {
                setActiveTab(tab.id);
                setActiveFilter('changed');
                setExpandedKeys(new Set());
              }}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
              {buckets.length > 0 && (
                <span className={styles['compare-tab-count']}>
                  {loadedCount}/{buckets.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={styles['compare-toolbar']}>
        <div className={styles['compare-toolbar-title']}>
          <span>{COMPARATOR_TABS.find((tab) => tab.id === activeTab)?.label}</span>
          <span className={styles['compare-toolbar-meta']}>
            {activeBuckets.length} wiki bucket{activeBuckets.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          className={`${styles['compare-fetch-btn']} ${hasActiveLoading || activeBuckets.length === 0 ? styles['is-disabled'] : ''
            }`}
          onClick={fetchActiveBuckets}
          disabled={hasActiveLoading || activeBuckets.length === 0}
        >
          <RefreshCw className={hasActiveLoading ? styles['spin'] : ''} size={14} />
          <span>{hasActiveLoading ? 'Checking' : hasActiveRows ? 'Check' : 'Fetch'}</span>
        </button>
      </div>

      <div className={styles['compare-content']}>
        {activeTab === 'products' ? (
          renderProductsTab()
        ) : activeTab === 'machines' ? (
          renderMachinesTab()
        ) : activeTab === 'recipes' ? (
          renderRecipesTab()
        ) : activeBuckets.length === 0 ? (
          <div className={styles['compare-empty']}>
            <FlaskConical size={32} />
            <div className={styles['compare-empty-title']}>No Wiki Bucket Mapped</div>
            <div className={styles['compare-empty-desc']}>
              Add a research bucket mapping when the wiki exposes one.
            </div>
          </div>
        ) : (
          activeBuckets.map((bucket) => {
            const snapshot = snapshots[bucket];
            const status = snapshot?.status ?? 'idle';
            const statusLabel = snapshot?.warning && status === 'cached' ? 'stale cache' : status;
            return (
              <section key={bucket} className={styles['compare-bucket']}>
                <div className={styles['compare-bucket-header']}>
                  <div className={styles['compare-bucket-title']}>
                    <span>{bucket}</span>
                    <span className={styles['compare-bucket-count']}>
                      {getBucketRowsCount(snapshot?.rows)} rows
                    </span>
                  </div>
                  <div className={styles['compare-bucket-actions']}>
                    <span className={styles[`compare-status-${status}`]}>
                      {status === 'success' && <CheckCircle2 size={13} />}
                      {status === 'cached' && <CheckCircle2 size={13} />}
                      {status === 'error' && <AlertTriangle size={13} />}
                      {status === 'loading' && <RefreshCw className={styles['spin']} size={13} />}
                      {statusLabel}
                    </span>
                    <span className={styles['compare-bucket-time']}>
                      {formatFetchedAt(snapshot?.fetchedAt)}
                    </span>
                    <button
                      className={`${styles['compare-fetch-small']} ${status === 'loading' ? styles['is-disabled'] : ''
                        }`}
                      onClick={() => {
                        void fetchBucket(bucket);
                      }}
                      disabled={status === 'loading'}
                    >
                      <RefreshCw className={status === 'loading' ? styles['spin'] : ''} size={13} />
                    </button>
                  </div>
                </div>

                {status === 'error' && (
                  <div className={styles['compare-error']}>{snapshot?.error}</div>
                )}
                {snapshot?.warning && (
                  <div className={styles['compare-warning']}>{snapshot.warning}</div>
                )}

                <pre className={styles['compare-output']}>{getBucketOutput(snapshot)}</pre>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
