export const INDUSTRIALIST_BUCKETS = Object.freeze([
  'items',
  'machines',
  'recipes_info',
  'recipes_inputs',
  'recipes_outputs',
]);

export const DEFAULT_SELECT_FIELDS_BY_BUCKET = Object.freeze({
  items: ['page_name', 'page_name_sub', 'title', 'image', 'sellvalue', 'resvalue', 'is_fluid'],
  machines: [
    'page_name',
    'page_name_sub',
    'tier',
    'image',
    'cost',
    'size',
    'pollution',
    'powerinput',
    'poweroutput',
    'transferrate',
    'capacity',
    'title',
    'research',
    'category',
    'subcategory',
    'variant',
    'limited',
  ],
  recipes_info: [
    'page_name',
    'page_name_sub',
    'id',
    'machine',
    'time',
    'time_mode',
    'mamyflux',
    'mamyflux_mode',
  ],
  recipes_inputs: ['page_name', 'page_name_sub', 'id', 'machine', 'item', 'amount', 'amount_mode'],
  recipes_outputs: ['page_name', 'page_name_sub', 'id', 'machine', 'item', 'amount', 'amount_mode'],
});

export const MAX_BUCKET_LIMIT = 1000;

const BUCKET_NAME_SET = new Set(INDUSTRIALIST_BUCKETS);
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;
const ALLOWED_OPERATORS = new Set(['=', '!=', '<', '<=', '>', '>=']);

function assertBucketName(bucket) {
  if (!BUCKET_NAME_SET.has(bucket)) {
    throw new Error(`Unsupported Industrialist wiki bucket: ${bucket}`);
  }
}

function assertFieldName(field) {
  if (!FIELD_NAME_PATTERN.test(field)) {
    throw new Error(`Invalid Bucket field name: ${field}`);
  }
}

function toLuaString(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function toLuaValue(value) {
  if (typeof value === 'string') return toLuaString(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid Bucket numeric value: ${value}`);
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'nil';
  throw new Error(`Unsupported Bucket value type: ${typeof value}`);
}

export function buildWikiBucketQuery(request) {
  assertBucketName(request.bucket);
  let query = `bucket(${toLuaString(request.bucket)})`;
  const selectedFields = Array.isArray(request.select) && request.select.length > 0
    ? request.select
    : DEFAULT_SELECT_FIELDS_BY_BUCKET[request.bucket];

  selectedFields.forEach(assertFieldName);
  query += `.select(${selectedFields.map(toLuaString).join(',')})`;

  if (Array.isArray(request.where) && request.where.length > 0) {
    for (const clause of request.where) {
      assertFieldName(clause.field);
      if (clause.operator) {
        if (!ALLOWED_OPERATORS.has(clause.operator)) {
          throw new Error(`Unsupported Bucket where operator: ${clause.operator}`);
        }
        query += `.where(${toLuaString(clause.field)},${toLuaString(clause.operator)},${toLuaValue(
          clause.value,
        )})`;
      } else {
        query += `.where(${toLuaString(clause.field)},${toLuaValue(clause.value)})`;
      }
    }
  }

  if (request.limit !== undefined) {
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > MAX_BUCKET_LIMIT
    ) {
      throw new Error(`Bucket limit must be an integer from 1 to ${MAX_BUCKET_LIMIT}`);
    }
    query += `.limit(${request.limit})`;
  }

  if (request.offset !== undefined) {
    if (!Number.isInteger(request.offset) || request.offset < 0) {
      throw new Error('Bucket offset must be a non-negative integer');
    }
    query += `.offset(${request.offset})`;
  }

  return `${query}.run()`;
}
