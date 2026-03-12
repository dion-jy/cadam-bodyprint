import { Readable } from 'node:stream';

const SUPABASE_ORIGIN = 'https://lypojinzxwvmqwtunrot.supabase.co';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
]);

function buildUpstreamUrl(req) {
  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path
    : [req.query.path].filter(Boolean);
  const upstreamUrl = new URL(
    `${SUPABASE_ORIGIN}/${pathSegments.join('/')}`,
  );

  const queryIndex = req.url.indexOf('?');
  if (queryIndex >= 0) {
    const query = req.url.slice(queryIndex + 1);
    upstreamUrl.search = query;
  }

  return upstreamUrl;
}

function buildHeaders(req) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }

  return headers;
}

function buildBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (req.body == null) {
    return undefined;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  return JSON.stringify(req.body);
}

export default async function handler(req, res) {
  const upstreamUrl = buildUpstreamUrl(req);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers: buildHeaders(req),
    body: buildBody(req),
    duplex: 'half',
  });

  res.status(upstreamResponse.status);

  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  if (!upstreamResponse.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(res);
}
