import app from '../api-proxy/app.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function preserveVercelParsedBody(req) {
  if (req.body === undefined) return;

  if (Buffer.isBuffer(req.body)) {
    req.body = req.body.toString('utf8');
  }

  if (typeof req.body === 'string' && req.headers['content-type']?.includes('application/json')) {
    try {
      req.body = req.body ? JSON.parse(req.body) : {};
    } catch {
      // Leave invalid JSON as-is so route validation can return the right error.
    }
  }

  req._body = true;
}

export default function handler(req, res) {
  const url = new URL(req.url, 'https://meterflow.fun');
  const rewritePath = url.searchParams.get('path');

  if (rewritePath) {
    url.searchParams.delete('path');
    const query = url.searchParams.toString();
    const normalizedPath = `/${rewritePath.replace(/^\/+/, '')}`;
    req.url = `${normalizedPath}${query ? `?${query}` : ''}`;
    req.originalUrl = `/proxy${req.url}`;
  } else {
    req.url = req.url.replace(/^\/(?:api\/proxy|api|proxy)(?=\/|$)/, '') || '/';
  }

  if (req.url === '/registry' || req.url.startsWith('/registry?')) {
    req.url = req.url.replace(/^\/registry/, '/v1/registry');
  }

  if (req.url === '/admin/zauth/submit-default' || req.url.startsWith('/admin/zauth/submit-default?')) {
    req.url = req.url.replace(/^\/admin\/zauth\/submit-default/, '/v1/admin/zauth/submit-default');
  }

  preserveVercelParsedBody(req);

  return app(req, res);
}
