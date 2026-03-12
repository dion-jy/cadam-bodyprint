import { Readable } from 'node:stream';

const SUPABASE_ORIGIN = 'https://lypojinzxwvmqwtunrot.supabase.co';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'transfer-encoding',
]);

function normalizePath(pathValue) {
  if (Array.isArray(pathValue)) {
    return pathValue.filter(Boolean).join('/');
  }

  return `${pathValue ?? ''}`.replace(/^\/+/, '');
}

function buildUpstreamUrl(req) {
  const upstreamUrl = new URL(`${SUPABASE_ORIGIN}/${normalizePath(req.query.path)}`);
  const originalUrl = new URL(req.url, 'http://localhost');

  for (const [key, value] of originalUrl.searchParams.entries()) {
    if (key !== 'path') {
      upstreamUrl.searchParams.append(key, value);
    }
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
    } else {
      headers.set(key, value);
    }
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

  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
    return req.body;
  }

  return JSON.stringify(req.body);
}

export default async function handler(req, res) {
  try {
    const upstreamResponse = await fetch(buildUpstreamUrl(req), {
      method: req.method,
      headers: buildHeaders(req),
      body: buildBody(req),
      ...(req.method === 'GET' || req.method === 'HEAD'
        ? {}
        : { duplex: 'half' }),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    res.status(502).json({ error: message });
  }
}
