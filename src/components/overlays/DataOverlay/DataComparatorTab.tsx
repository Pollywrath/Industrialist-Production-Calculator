import { AlertTriangle, CheckCircle2, ClipboardList, Cpu, FlaskConical, Package, RefreshCw } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  fetchAllWikiBucketRows,
  type IndustrialistBucketName,
} from '../../../services/wikiBucketApi';
import styles from './DataOverlay.module.css';

type ComparatorDataType = 'products' | 'machines' | 'recipes' | 'research';
type BucketLoadStatus = 'idle' | 'loading' | 'success' | 'error';

interface BucketSnapshot {
  bucket: IndustrialistBucketName;
  status: BucketLoadStatus;
  rows: unknown;
  error?: string;
  fetchedAt?: number;
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
  recipes: ['recipes_info', 'recipes_inputs', 'recipes_outputs'],
  research: [],
};

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
  const [snapshots, setSnapshots] = useState<Partial<Record<IndustrialistBucketName, BucketSnapshot>>>({});
  const activeBuckets = DATA_TYPE_BUCKETS[activeTab];
  const hasActiveLoading = activeBuckets.some((bucket) => snapshots[bucket]?.status === 'loading');

  const fetchBucket = async (bucket: IndustrialistBucketName) => {
    setSnapshots((prev) => ({
      ...prev,
      [bucket]: {
        bucket,
        status: 'loading',
        rows: prev[bucket]?.rows,
        fetchedAt: prev[bucket]?.fetchedAt,
      },
    }));

    try {
      const rows = await fetchAllWikiBucketRows({ bucket });
      setSnapshots((prev) => ({
        ...prev,
        [bucket]: {
          bucket,
          status: 'success',
          rows,
          fetchedAt: Date.now(),
        },
      }));
    } catch (error) {
      setSnapshots((prev) => ({
        ...prev,
        [bucket]: {
          bucket,
          status: 'error',
          rows: prev[bucket]?.rows,
          error: getErrorMessage(error),
          fetchedAt: prev[bucket]?.fetchedAt,
        },
      }));
    }
  };

  const fetchActiveBuckets = () => {
    activeBuckets.forEach((bucket) => {
      void fetchBucket(bucket);
    });
  };

  return (
    <div className={styles['compare-container']}>
      <div className={styles['compare-tabs']}>
        {COMPARATOR_TABS.map((tab) => {
          const Icon = tab.icon;
          const buckets = DATA_TYPE_BUCKETS[tab.id];
          const loadedCount = buckets.filter((bucket) => snapshots[bucket]?.status === 'success').length;
          return (
            <button
              key={tab.id}
              className={`${styles['compare-tab-btn']} ${
                activeTab === tab.id ? styles['is-active'] : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
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
          className={`${styles['compare-fetch-btn']} ${
            hasActiveLoading || activeBuckets.length === 0 ? styles['is-disabled'] : ''
          }`}
          onClick={fetchActiveBuckets}
          disabled={hasActiveLoading || activeBuckets.length === 0}
        >
          <RefreshCw size={14} />
          <span>{hasActiveLoading ? 'Fetching' : 'Fetch'}</span>
        </button>
      </div>

      <div className={styles['compare-content']}>
        {activeBuckets.length === 0 ? (
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
                      {status === 'error' && <AlertTriangle size={13} />}
                      {status === 'loading' && <RefreshCw size={13} />}
                      {status}
                    </span>
                    <span className={styles['compare-bucket-time']}>
                      {formatFetchedAt(snapshot?.fetchedAt)}
                    </span>
                    <button
                      className={`${styles['compare-fetch-small']} ${
                        status === 'loading' ? styles['is-disabled'] : ''
                      }`}
                      onClick={() => {
                        void fetchBucket(bucket);
                      }}
                      disabled={status === 'loading'}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {status === 'error' && (
                  <div className={styles['compare-error']}>{snapshot?.error}</div>
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
