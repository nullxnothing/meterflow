import app from '../api-proxy/app.js';

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

  return app(req, res);
}
