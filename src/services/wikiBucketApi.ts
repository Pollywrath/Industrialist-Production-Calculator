import {
  getWikiBucketCache,
  saveWikiBucketCache,
  type WikiBucketCacheRecord,
} from '../persistence/idb';
import {
  buildWikiBucketQuery,
  INDUSTRIALIST_BUCKETS,
  MAX_BUCKET_LIMIT,
} from '../../functions/_shared/wikiBucketQuery.js';
import type {
  BucketQueryRequest,
  BucketScalarValue,
  BucketWhereClause,
  BucketWhereOperator,
  IndustrialistBucketName,
} from '../../functions/_shared/wikiBucketQuery.js';

export { buildWikiBucketQuery, INDUSTRIALIST_BUCKETS, MAX_BUCKET_LIMIT };
export type {
  BucketQueryRequest,
  BucketScalarValue,
  BucketWhereClause,
  BucketWhereOperator,
  IndustrialistBucketName,
};

export const INDUSTRIALIST_WIKI_API_URL =
  import.meta.env.VITE_INDUSTRIALIST_WIKI_API_URL ?? 'https://industrialist.miraheze.org/w/api.php';

export const INDUSTRIALIST_WIKI_BUCKET_PROXY_URL =
  import.meta.env.VITE_INDUSTRIALIST_WIKI_BUCKET_PROXY_URL ?? '/api/wiki-bucket';

export interface WikiBucketFetchOptions {
  apiUrl?: string;
  proxyUrl?: string;
  useProxy?: boolean;
  allowDirectFallback?: boolean;
  signal?: AbortSignal;
}

export interface WikiBucketFetchAllOptions extends WikiBucketFetchOptions {
  pageSize?: number;
}

export type WikiBucketRow = Record<string, unknown>;

export interface CachedWikiBucketRowsResult {
  rows: WikiBucketRow[];
  bucket: IndustrialistBucketName;
  source: 'cache' | 'network';
  contentHash: string;
  fetchedAt: number;
  checkedAt: number;
  stale?: boolean;
  freshnessError?: string;
}

export interface WikiBucketApiResponse<TBucket = WikiBucketRow[]> {
  bucketQuery?: string;
  bucket?: TBucket;
  error?: string | { code?: string; info?: string; [key: string]: unknown };
}

interface MediaWikiRecentChangesResponse {
  query?: {
    recentchanges?: Array<{
      title?: string;
      timestamp?: string;
    }>;
  };
  error?: string | { code?: string; info?: string; [key: string]: unknown };
}

export class WikiBucketApiError extends Error {
  readonly apiError: WikiBucketApiResponse['error'];
  readonly query: string;

  constructor(message: string, query: string, apiError?: WikiBucketApiResponse['error']) {
    super(message);
    this.name = 'WikiBucketApiError';
    this.apiError = apiError;
    this.query = query;
  }
}

const SHOULD_USE_BUCKET_PROXY = import.meta.env.VITE_INDUSTRIALIST_WIKI_BUCKET_USE_PROXY === 'true';
const SHOULD_ALLOW_DIRECT_FALLBACK =
  import.meta.env.VITE_INDUSTRIALIST_WIKI_BUCKET_ALLOW_DIRECT_FALLBACK === 'true';

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildWikiBucketCacheSignature(request: BucketQueryRequest): string {
  const cacheRequest: BucketQueryRequest = { ...request };
  delete cacheRequest.limit;
  delete cacheRequest.offset;
  return buildWikiBucketQuery(cacheRequest);
}

function buildWikiBucketCacheId(querySignature: string): string {
  return `wiki-bucket:${hashString(querySignature)}`;
}

function toCachedResult(
  record: WikiBucketCacheRecord,
  source: CachedWikiBucketRowsResult['source'],
  extras: Pick<CachedWikiBucketRowsResult, 'stale' | 'freshnessError'> = {},
): CachedWikiBucketRowsResult {
  return {
    rows: record.rows,
    bucket: record.bucket as IndustrialistBucketName,
    source,
    contentHash: record.contentHash,
    fetchedAt: record.fetchedAt,
    checkedAt: record.checkedAt,
    ...extras,
  };
}

function getApiErrorMessage(error: WikiBucketApiResponse['error']): string {
  if (!error) return 'Unknown Bucket API error';
  if (typeof error === 'string') return error;
  return error.info ?? error.code ?? 'Unknown Bucket API error';
}

async function fetchWikiBucketDirect<TBucket>(
  query: string,
  options: WikiBucketFetchOptions,
): Promise<TBucket> {
  const params = new URLSearchParams({
    action: 'bucket',
    format: 'json',
    formatversion: '2',
    origin: '*',
    query,
  });
  const response = await fetch(`${options.apiUrl ?? INDUSTRIALIST_WIKI_API_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new WikiBucketApiError(`Bucket API request failed with HTTP ${response.status}`, query);
  }

  const payload = (await response.json()) as WikiBucketApiResponse<TBucket>;
  if (payload.error) {
    throw new WikiBucketApiError(getApiErrorMessage(payload.error), query, payload.error);
  }
  if (payload.bucket === undefined) {
    throw new WikiBucketApiError('Bucket API response did not include bucket data', query);
  }

  return payload.bucket;
}

async function hasIndustrialistWikiChangedSince(
  timestamp: number,
  options: WikiBucketFetchOptions,
): Promise<boolean> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    list: 'recentchanges',
    rcdir: 'newer',
    rclimit: '1',
    rcprop: 'timestamp|title',
    rcstart: new Date(timestamp).toISOString(),
  });

  const response = await fetch(`${options.apiUrl ?? INDUSTRIALIST_WIKI_API_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new WikiBucketApiError(
      `Wiki recent changes request failed with HTTP ${response.status}`,
      params.toString(),
    );
  }

  const payload = (await response.json()) as MediaWikiRecentChangesResponse;
  if (payload.error) {
    throw new WikiBucketApiError(
      getApiErrorMessage(payload.error),
      params.toString(),
      payload.error,
    );
  }

  return (payload.query?.recentchanges?.length ?? 0) > 0;
}

async function fetchWikiBucketProxy<TBucket>(
  request: BucketQueryRequest,
  query: string,
  options: WikiBucketFetchOptions,
): Promise<TBucket> {
  const response = await fetch(options.proxyUrl ?? INDUSTRIALIST_WIKI_BUCKET_PROXY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new WikiBucketApiError(`Bucket proxy request failed with HTTP ${response.status}`, query);
  }

  const payload = (await response.json()) as WikiBucketApiResponse<TBucket>;
  if (payload.error) {
    throw new WikiBucketApiError(getApiErrorMessage(payload.error), query, payload.error);
  }
  if (payload.bucket === undefined) {
    throw new WikiBucketApiError('Bucket proxy response did not include bucket data', query);
  }

  return payload.bucket;
}

export async function fetchWikiBucket<TBucket = WikiBucketRow[]>(
  request: BucketQueryRequest,
  options: WikiBucketFetchOptions = {},
): Promise<TBucket> {
  const query = buildWikiBucketQuery(request);
  const useProxy = options.useProxy ?? SHOULD_USE_BUCKET_PROXY;
  const allowDirectFallback = options.allowDirectFallback ?? SHOULD_ALLOW_DIRECT_FALLBACK;

  if (!useProxy) {
    return fetchWikiBucketDirect<TBucket>(query, options);
  }

  try {
    return await fetchWikiBucketProxy<TBucket>(request, query, options);
  } catch (error) {
    if (!allowDirectFallback) {
      throw error;
    }
    return fetchWikiBucketDirect<TBucket>(query, options);
  }
}

export async function fetchAllWikiBucketRows(
  request: BucketQueryRequest,
  options: WikiBucketFetchAllOptions = {},
): Promise<WikiBucketRow[]> {
  const pageSize = options.pageSize ?? MAX_BUCKET_LIMIT;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_BUCKET_LIMIT) {
    throw new Error(`Bucket page size must be an integer from 1 to ${MAX_BUCKET_LIMIT}`);
  }

  const rows: WikiBucketRow[] = [];
  let offset = request.offset ?? 0;

  while (true) {
    const page = await fetchWikiBucket<WikiBucketRow[]>(
      {
        ...request,
        limit: pageSize,
        offset,
      },
      options,
    );

    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
    offset += pageSize;
  }
}

export async function getCachedWikiBucketRows(
  request: BucketQueryRequest,
): Promise<CachedWikiBucketRowsResult | null> {
  const querySignature = buildWikiBucketCacheSignature(request);
  const cacheRecord = await getWikiBucketCache(buildWikiBucketCacheId(querySignature));
  if (!cacheRecord || cacheRecord.querySignature !== querySignature) {
    return null;
  }
  return toCachedResult(cacheRecord, 'cache');
}

export async function fetchCachedWikiBucketRows(
  request: BucketQueryRequest,
  options: WikiBucketFetchAllOptions = {},
): Promise<CachedWikiBucketRowsResult> {
  const querySignature = buildWikiBucketCacheSignature(request);
  const cacheId = buildWikiBucketCacheId(querySignature);
  const cachedRecord = await getWikiBucketCache(cacheId);

  if (cachedRecord && cachedRecord.querySignature === querySignature) {
    try {
      const wikiChanged = await hasIndustrialistWikiChangedSince(
        cachedRecord.checkedAt || cachedRecord.fetchedAt,
        options,
      );

      if (!wikiChanged) {
        const checkedRecord: WikiBucketCacheRecord = {
          ...cachedRecord,
          checkedAt: Date.now(),
        };
        await saveWikiBucketCache(checkedRecord);
        return toCachedResult(checkedRecord, 'cache');
      }
    } catch (error) {
      return toCachedResult(cachedRecord, 'cache', {
        stale: true,
        freshnessError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const fetchStartedAt = Date.now();
    const rows = await fetchAllWikiBucketRows(request, options);
    const now = Date.now();
    const contentHash = hashString(JSON.stringify(rows));
    const cacheRecord: WikiBucketCacheRecord = {
      id: cacheId,
      bucket: request.bucket,
      querySignature,
      rows,
      contentHash,
      fetchedAt: now,
      checkedAt: fetchStartedAt,
    };
    await saveWikiBucketCache(cacheRecord);
    return toCachedResult(cacheRecord, 'network');
  } catch (error) {
    if (cachedRecord && cachedRecord.querySignature === querySignature) {
      return toCachedResult(cachedRecord, 'cache', {
        stale: true,
        freshnessError: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}
