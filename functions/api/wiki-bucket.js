const INDUSTRIALIST_WIKI_API_URL = 'https://industrialist.miraheze.org/w/api.php';
const ALLOWED_BUCKETS = new Set([
  'items',
  'machines',
  'recipes_info',
  'recipes_inputs',
  'recipes_outputs',
]);
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;
const ALLOWED_OPERATORS = new Set(['=', '!=', '<', '<=', '>', '>=']);
const DEFAULT_SELECT_FIELDS_BY_BUCKET = {
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
};
const MAX_BUCKET_LIMIT = 1000;

const jsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

function assertBucketName(bucket) {
  if (!ALLOWED_BUCKETS.has(bucket)) {
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

function buildBucketQuery(request) {
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

function parseGetRequest(request) {
  const url = new URL(request.url);
  const bucket = url.searchParams.get('bucket');
  const selectParam = url.searchParams.get('select');
  return {
    bucket,
    select: selectParam
      ? selectParam
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
      : undefined,
    limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    offset: url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined,
  };
}

async function parseRequest(request) {
  if (request.method === 'GET') {
    return parseGetRequest(request);
  }

  if (request.method !== 'POST') {
    throw new Error(`Unsupported method: ${request.method}`);
  }

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }
  return body;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: jsonHeaders,
    });
  }

  try {
    const bucketRequest = await parseRequest(request);
    const query = buildBucketQuery(bucketRequest);
    const params = new URLSearchParams({
      action: 'bucket',
      format: 'json',
      formatversion: '2',
      query,
    });
    const wikiResponse = await fetch(`${INDUSTRIALIST_WIKI_API_URL}?${params}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    const responseText = await wikiResponse.text();
    if (!wikiResponse.ok) {
      return jsonResponse(
        {
          error: `Industrialist wiki request failed with HTTP ${wikiResponse.status}`,
          query,
          body: responseText,
        },
        502,
      );
    }

    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      return jsonResponse(
        {
          error: 'Industrialist wiki returned non-JSON data.',
          query,
          body: responseText,
        },
        502,
      );
    }

    if (payload.error) {
      return jsonResponse(
        {
          error: payload.error,
          query,
        },
        502,
      );
    }

    return jsonResponse({
      query,
      bucket: payload.bucket ?? [],
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}
