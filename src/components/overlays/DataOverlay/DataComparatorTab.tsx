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
  getWikiString,
  getOptionalWikiBoolean,
  getOptionalWikiNumber,
  type ComparisonResult,
  type DiffItem,
  type WikiRecipe,
} from '../../../utils/dataComparator';
import { getAllProducts, getAllMachines, getAllResearches, getAllRecipes } from '../../../data/lookup';
import styles from './DataOverlay.module.css';
import { VirtualList } from '../../shared/VirtualList';
import type { Machine, Product, Recipe } from '../../../types/data';

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

type ComparatorIcon = ComponentType<{ size?: number; className?: string }>;
type ComparatorBadge = NonNullable<ComparatorVirtualRow['badgeType']>;
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
  icon: ComparatorIcon;
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

type BucketRowsSnapshot = BucketSnapshot & { rows: Record<string, unknown>[] };
type ComparatorProp = { label: string; val: unknown };
type ComparisonCounts = Record<ComparisonFilter, number>;

function hasBucketRows(snapshot: BucketSnapshot | undefined): snapshot is BucketRowsSnapshot {
  return Array.isArray(snapshot?.rows) && snapshot.rows.length > 0;
}

function needsFreshErrorState(snapshot: BucketSnapshot | undefined): boolean {
  return snapshot?.status === 'error' && (!snapshot.rows || (Array.isArray(snapshot.rows) && snapshot.rows.length === 0));
}

function getFilteredItems<TApp, TWiki>(
  result: ComparisonResult<TApp, TWiki>,
  filter: ComparisonFilter
): Array<DiffItem<TApp, TWiki>> {
  return result[filter];
}

function getComparisonCounts<TApp, TWiki>(result: ComparisonResult<TApp, TWiki>): ComparisonCounts {
  return {
    changed: result.changed.length,
    onlyInApp: result.onlyInApp.length,
    onlyInWiki: result.onlyInWiki.length,
    unchanged: result.unchanged.length,
  };
}

function pushHeaderRow(
  rows: ComparatorVirtualRow[],
  itemKey: string,
  isExpanded: boolean,
  badgeType?: ComparatorBadge,
  diffCount?: number
) {
  rows.push({
    key: `header-${itemKey}`,
    type: 'header',
    itemKey,
    isExpanded,
    badgeType,
    diffCount,
  });
}

function pushChangedRows<TApp, TWiki>(
  rows: ComparatorVirtualRow[],
  item: DiffItem<TApp, TWiki>,
  isExpanded: boolean
) {
  pushHeaderRow(rows, item.key, isExpanded, 'changed', item.differences?.length);
  if (!isExpanded || !item.differences) return;

  rows.push({
    key: `diff-header-${item.key}`,
    type: 'diff-header',
    itemKey: item.key,
    isExpanded,
  });

  item.differences.forEach((diff, index) => {
    rows.push({
      key: `diff-${item.key}-${diff.field}`,
      type: 'diff-row',
      itemKey: item.key,
      isExpanded,
      field: diff.field,
      appValue: diff.appValue,
      wikiValue: diff.wikiValue,
      isLastChild: index === item.differences!.length - 1,
    });
  });
}

function pushPropRows(
  rows: ComparatorVirtualRow[],
  itemKey: string,
  isExpanded: boolean,
  props: ComparatorProp[]
) {
  if (!isExpanded) return;

  props.forEach((prop, index) => {
    rows.push({
      key: `prop-${itemKey}-${prop.label}`,
      type: 'prop-row',
      itemKey,
      isExpanded,
      propLabel: prop.label,
      propValue: prop.val,
      isLastChild: index === props.length - 1,
    });
  });
}

function buildComparatorRows<TApp, TWiki>(
  result: ComparisonResult<TApp, TWiki>,
  filter: ComparisonFilter,
  expandedKeys: Set<string>,
  prefix: string,
  getAppProps: (item: TApp) => ComparatorProp[],
  getWikiProps: (item: TWiki) => ComparatorProp[]
): ComparatorVirtualRow[] {
  const rows: ComparatorVirtualRow[] = [];

  for (const item of getFilteredItems(result, filter)) {
    const isExpanded = expandedKeys.has(`${prefix}-${filter}-${item.key}`);

    if (filter === 'changed') {
      pushChangedRows(rows, item, isExpanded);
    } else if (filter === 'onlyInApp' && item.appItem) {
      pushHeaderRow(rows, item.key, isExpanded, 'only-app');
      pushPropRows(rows, item.key, isExpanded, getAppProps(item.appItem));
    } else if (filter === 'onlyInWiki' && item.wikiItem) {
      pushHeaderRow(rows, item.key, isExpanded, 'only-wiki');
      pushPropRows(rows, item.key, isExpanded, getWikiProps(item.wikiItem));
    } else {
      pushHeaderRow(rows, item.key, false);
    }
  }

  return rows;
}

function formatQuantityList<T>(
  items: T[],
  getName: (item: T) => string,
  getQuantity: (item: T) => number
): string {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const name = getName(item);
    grouped.set(name, (grouped.get(name) || 0) + getQuantity(item));
  }

  return Array.from(grouped.entries())
    .map(([name, quantity]) => `${name} x${quantity}`)
    .join(', ') || '(None)';
}

function getAppProductProps(product: Product): ComparatorProp[] {
  return [
    { label: 'Type', val: product.type },
    { label: 'Sell Price', val: product.sell_price },
    { label: 'RP Multiplier', val: product.rp_multiplier },
  ];
}

function getWikiProductProps(row: Record<string, unknown>): ComparatorProp[] {
  const isFluid = getOptionalWikiBoolean(row.is_fluid);
  const sellPrice = getOptionalWikiNumber(row.sellvalue !== undefined ? row.sellvalue : row.sellValue);
  const rpMultiplier = getOptionalWikiNumber(row.resvalue !== undefined ? row.resvalue : row.resValue);

  return [
    { label: 'Type', val: isFluid === null ? 'Missing' : isFluid ? 'Fluid' : 'Item' },
    { label: 'Sell Price', val: sellPrice ?? 'Missing' },
    { label: 'RP Multiplier', val: rpMultiplier ?? 'Missing' },
  ];
}

function getAppMachineProps(
  machine: Machine,
  researchMap: Map<string, string>,
  machineIdToNameMap: Map<string, string>
): ComparatorProp[] {
  const appResearchName = researchMap.get(machine.research) || machine.research || '(None)';
  const appVariantName = machine.variant && machine.variant !== 'none'
    ? machineIdToNameMap.get(machine.variant) || machine.variant
    : 'none';

  return [
    { label: 'Category', val: machine.category },
    { label: 'Subcategory', val: machine.subcategory },
    { label: 'Cost', val: machine.cost },
    { label: 'Tier', val: machine.tier },
    { label: 'Size', val: `${machine.size.x}x${machine.size.y}` },
    { label: 'Limited', val: machine.limited ? 'Yes' : 'No' },
    { label: 'Variant', val: appVariantName },
    { label: 'Research', val: appResearchName },
  ];
}

function getWikiMachineProps(row: Record<string, unknown>): ComparatorProp[] {
  const limited = getOptionalWikiBoolean(row.limited);

  return [
    { label: 'Category', val: getWikiString(row.category) },
    { label: 'Subcategory', val: getWikiString(row.subcategory) },
    { label: 'Cost', val: getOptionalWikiNumber(row.cost) ?? 'Missing' },
    { label: 'Tier', val: getOptionalWikiNumber(row.tier) ?? 'Missing' },
    { label: 'Size', val: getWikiString(row.size) },
    { label: 'Limited', val: limited === null ? 'Missing' : limited ? 'Yes' : 'No' },
    { label: 'Variant', val: getWikiString(row.variant) },
    { label: 'Research', val: getWikiString(row.research) },
  ];
}

function getAppRecipeProps(
  recipe: Recipe,
  productMap: Map<string, string>,
  machineMap: Map<string, string>
): ComparatorProp[] {
  const getProductName = (productId: string) => productMap.get(productId) || productId;

  return [
    { label: 'Machine', val: machineMap.get(recipe.machine_id) || recipe.machine_id },
    { label: 'Cycle Time', val: recipe.cycle_time },
    { label: 'Power Consumption', val: recipe.power_consumption },
    { label: 'Pollution', val: recipe.pollution },
    { label: 'Inputs', val: formatQuantityList(recipe.inputs, (input) => getProductName(input.product_id), (input) => input.quantity) },
    { label: 'Outputs', val: formatQuantityList(recipe.outputs, (output) => getProductName(output.product_id), (output) => output.quantity) },
  ];
}

function getWikiRecipeProps(recipe: WikiRecipe): ComparatorProp[] {
  return [
    { label: 'Machine', val: recipe.machine },
    { label: 'Cycle Time', val: recipe.time },
    { label: 'Power Consumption', val: recipe.mamyflux },
    { label: 'Pollution', val: recipe.pollution || '(None)' },
    { label: 'Inputs', val: formatQuantityList(recipe.inputs, (input) => input.item, (input) => input.amount) },
    { label: 'Outputs', val: formatQuantityList(recipe.outputs, (output) => output.item, (output) => output.amount) },
  ];
}

function CompareEmptyState({
  icon: Icon,
  title,
  description,
  spin = false,
}: {
  icon: ComparatorIcon;
  title: string;
  description?: string;
  spin?: boolean;
}) {
  return (
    <div className={styles['compare-empty']}>
      <Icon className={spin ? styles['spin'] : undefined} size={32} />
      <div className={styles['compare-empty-title']}>{title}</div>
      {description && <div className={styles['compare-empty-desc']}>{description}</div>}
    </div>
  );
}

function ComparisonSubTabs({
  activeFilter,
  counts,
  onChange,
}: {
  activeFilter: ComparisonFilter;
  counts: ComparisonCounts;
  onChange: (filter: ComparisonFilter) => void;
}) {
  const tabs: Array<{ id: ComparisonFilter; label: string }> = [
    { id: 'changed', label: 'Changed' },
    { id: 'onlyInApp', label: 'Only in App' },
    { id: 'onlyInWiki', label: 'Only in Wiki' },
    { id: 'unchanged', label: 'Unchanged' },
  ];

  return (
    <div className={styles['compare-subtabs']}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles['compare-subtab-btn']} ${activeFilter === tab.id ? styles['is-active'] : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          <span className={styles['compare-subtab-count']}>{counts[tab.id]}</span>
        </button>
      ))}
    </div>
  );
}

function ComparatorRowsList({
  rows,
  prefix,
  activeFilter,
  onToggle,
}: {
  rows: ComparatorVirtualRow[];
  prefix: string;
  activeFilter: ComparisonFilter;
  onToggle: (key: string) => void;
}) {
  return (
    <VirtualList<ComparatorVirtualRow>
      key={`${prefix}s-${activeFilter}`}
      items={rows}
      itemHeight={32}
      height={450}
      getKey={(item) => item.key}
    >
      {(row) => {
        if (row.type === 'header') {
          const expKey = `${prefix}-${activeFilter}-${row.itemKey}`;
          if (activeFilter === 'unchanged') {
            return (
              <div className={styles['unchanged-row']}>
                <CheckCircle2 className={styles['unchanged-icon']} size={14} />
                <span>{row.itemKey}</span>
              </div>
            );
          }
          return (
            <div
              className={`${styles['compare-row-header']} ${row.isExpanded ? styles['is-expanded'] : ''}`}
              onClick={() => onToggle(expKey)}
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
  );
}

function ComparisonResultView({
  counts,
  rows,
  activeFilter,
  prefix,
  warning,
  error,
  onFilterChange,
  onToggle,
}: {
  counts: ComparisonCounts;
  rows: ComparatorVirtualRow[];
  activeFilter: ComparisonFilter;
  prefix: string;
  warning?: string;
  error?: string;
  onFilterChange: (filter: ComparisonFilter) => void;
  onToggle: (key: string) => void;
}) {
  return (
    <>
      {warning && <div className={styles['compare-warning']}>{warning}</div>}
      {error && <div className={styles['compare-error']}>{error}</div>}

      <ComparisonSubTabs activeFilter={activeFilter} counts={counts} onChange={onFilterChange} />

      <div className={styles['compare-results-container']}>
        {rows.length === 0 ? (
          <div className={styles['diff-empty-msg']}>
            No items in this category.
          </div>
        ) : (
          <ComparatorRowsList
            rows={rows}
            prefix={prefix}
            activeFilter={activeFilter}
            onToggle={onToggle}
          />
        )}
      </div>
    </>
  );
}

export function DataComparatorTab() {
  const [activeTab, setActiveTab] = useState<ComparatorDataType>('products');
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>('changed');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [snapshots, setSnapshots] = useState<Partial<Record<IndustrialistBucketName, BucketSnapshot>>>({});

  const activeBuckets = DATA_TYPE_BUCKETS[activeTab];
  const hasActiveLoading = activeBuckets.some((bucket) => snapshots[bucket]?.status === 'loading');
  const hasAllActiveRows =
    activeBuckets.length > 0 && activeBuckets.every((bucket) => snapshots[bucket]?.rows !== undefined);

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

  const renderProductsTab = () => {
    const snapshot = snapshots.items;
    const status = snapshot?.status ?? 'idle';

    if (status === 'loading') {
      return (
        <CompareEmptyState icon={RefreshCw} title="Loading Wiki Data..." spin />
      );
    }

    if (needsFreshErrorState(snapshot)) {
      return (
        <CompareEmptyState
          icon={AlertTriangle}
          title="Error Loading Wiki Data"
          description={snapshot?.error}
        />
      );
    }

    if (!hasBucketRows(snapshot)) {
      return (
        <CompareEmptyState
          icon={Package}
          title="No Wiki Data Fetched"
          description={'Click the "Fetch" button in the toolbar to load product data from the wiki.'}
        />
      );
    }

    const result = compareProducts(getAllProducts(), snapshot.rows);
    const rows = buildComparatorRows(
      result,
      activeFilter,
      expandedKeys,
      'product',
      getAppProductProps,
      getWikiProductProps
    );

    return (
      <ComparisonResultView
        counts={getComparisonCounts(result)}
        rows={rows}
        activeFilter={activeFilter}
        prefix="product"
        warning={snapshot.warning}
        error={snapshot.error}
        onFilterChange={setActiveFilter}
        onToggle={toggleExpanded}
      />
    );
  };

  const renderMachinesTab = () => {
    const snapshot = snapshots.machines;
    const status = snapshot?.status ?? 'idle';

    if (status === 'loading') {
      return (
        <CompareEmptyState icon={RefreshCw} title="Loading Wiki Data..." spin />
      );
    }

    if (needsFreshErrorState(snapshot)) {
      return (
        <CompareEmptyState
          icon={AlertTriangle}
          title="Error Loading Wiki Data"
          description={snapshot?.error}
        />
      );
    }

    if (!hasBucketRows(snapshot)) {
      return (
        <CompareEmptyState
          icon={Cpu}
          title="No Wiki Data Fetched"
          description={'Click the "Fetch" button in the toolbar to load machine data from the wiki.'}
        />
      );
    }

    const result = compareMachines(
      getAllMachines(),
      snapshot.rows,
      getAllResearches(),
      getAllMachines()
    );
    const researchMap = new Map(getAllResearches().map((r) => [r.id, r.name]));
    const machineIdToNameMap = new Map(getAllMachines().map((m) => [m.id, m.name]));
    const rows = buildComparatorRows(
      result,
      activeFilter,
      expandedKeys,
      'machine',
      (machine) => getAppMachineProps(machine, researchMap, machineIdToNameMap),
      getWikiMachineProps
    );

    return (
      <ComparisonResultView
        counts={getComparisonCounts(result)}
        rows={rows}
        activeFilter={activeFilter}
        prefix="machine"
        warning={snapshot.warning}
        error={snapshot.error}
        onFilterChange={setActiveFilter}
        onToggle={toggleExpanded}
      />
    );
  };

  const renderRecipesTab = () => {
    const infoSnap = snapshots.recipes_info;
    const inputsSnap = snapshots.recipes_inputs;
    const outputsSnap = snapshots.recipes_outputs;
    const machinesSnap = snapshots.machines;

    const recipeSnapshots = [infoSnap, inputsSnap, outputsSnap, machinesSnap];
    const isAnyLoading = recipeSnapshots.some((snapshot) => snapshot?.status === 'loading');

    if (isAnyLoading) {
      return (
        <CompareEmptyState icon={RefreshCw} title="Loading Wiki Data..." spin />
      );
    }

    const errorSnapshot = recipeSnapshots.find(needsFreshErrorState);

    if (errorSnapshot) {
      return (
        <CompareEmptyState
          icon={AlertTriangle}
          title="Error Loading Wiki Data"
          description={errorSnapshot.error || 'Unknown error'}
        />
      );
    }

    if (
      !hasBucketRows(infoSnap) ||
      !hasBucketRows(inputsSnap) ||
      !hasBucketRows(outputsSnap) ||
      !hasBucketRows(machinesSnap)
    ) {
      return (
        <CompareEmptyState
          icon={ClipboardList}
          title="No Wiki Data Fetched"
          description={'Click the "Fetch" button in the toolbar to load recipe data from the wiki.'}
        />
      );
    }

    const result = compareRecipes(
      getAllRecipes(),
      infoSnap.rows,
      inputsSnap.rows,
      outputsSnap.rows,
      getAllMachines(),
      getAllProducts(),
      machinesSnap.rows
    );

    const productMap = new Map(getAllProducts().map((product) => [product.id, product.name]));
    const machineMap = new Map(getAllMachines().map((machine) => [machine.id, machine.name]));
    const rows = buildComparatorRows(
      result,
      activeFilter,
      expandedKeys,
      'recipe',
      (recipe) => getAppRecipeProps(recipe, productMap, machineMap),
      getWikiRecipeProps
    );

    const warning = infoSnap?.warning || inputsSnap?.warning || outputsSnap?.warning || machinesSnap?.warning;
    const error = infoSnap?.error || inputsSnap?.error || outputsSnap?.error || machinesSnap?.error;

    return (
      <ComparisonResultView
        counts={getComparisonCounts(result)}
        rows={rows}
        activeFilter={activeFilter}
        prefix="recipe"
        warning={warning}
        error={error}
        onFilterChange={setActiveFilter}
        onToggle={toggleExpanded}
      />
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
          <span>{hasActiveLoading ? 'Checking' : hasAllActiveRows ? 'Check' : 'Fetch'}</span>
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
