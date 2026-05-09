import app from '../api-proxy/app.js';

export default function handler(req, res) {
  req.url = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
  return app(req, res);
}
