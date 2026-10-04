import { buildWikiBucketQuery } from '../_shared/wikiBucketQuery.js';

const INDUSTRIALIST_WIKI_API_URL = 'https://industrialist.miraheze.org/w/api.php';
const GENERIC_REQUEST_ERROR = 'Unable to process wiki bucket request.';

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
    const query = buildWikiBucketQuery(bucketRequest);
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
          error: 'Industrialist wiki request failed.',
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
        },
        502,
      );
    }

    if (payload.error) {
      return jsonResponse(
        {
          error: 'Industrialist wiki rejected the bucket request.',
        },
        502,
      );
    }

    return jsonResponse({
      query,
      bucket: payload.bucket ?? [],
    });
  } catch {
    return jsonResponse(
      {
        error: GENERIC_REQUEST_ERROR,
      },
      400,
    );
  }
}
