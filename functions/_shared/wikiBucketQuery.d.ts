export const INDUSTRIALIST_BUCKETS: readonly [
  'items',
  'machines',
  'recipes_info',
  'recipes_inputs',
  'recipes_outputs',
];

export type IndustrialistBucketName = (typeof INDUSTRIALIST_BUCKETS)[number];
export type BucketWhereOperator = '=' | '!=' | '<' | '<=' | '>' | '>=';
export type BucketScalarValue = string | number | boolean | null;

export interface BucketWhereClause {
  field: string;
  operator?: BucketWhereOperator;
  value: BucketScalarValue;
}

export interface BucketQueryRequest {
  bucket: IndustrialistBucketName;
  select?: string[];
  where?: BucketWhereClause[];
  limit?: number;
  offset?: number;
}

export const MAX_BUCKET_LIMIT: number;

export function buildWikiBucketQuery(request: BucketQueryRequest): string;
