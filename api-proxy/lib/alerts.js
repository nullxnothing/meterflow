// Discord webhook alerting for critical errors
import { logger } from './logger.js';

const WEBHOOK_URL = process.env.DISCORD_ALERT_WEBHOOK;
const RATE_LIMIT_MS = 60_000; // max 1 alert per error type per minute
const recentAlerts = new Map();

/**
 * Send a critical error alert to the Discord webhook.
 * Rate-limited per error type to avoid flooding.
 */
export async function sendErrorAlert({ title, message, model, endpoint, statusCode, apiKey }) {
  if (!WEBHOOK_URL) return;

  const alertKey = `${endpoint}:${statusCode}:${model || 'unknown'}`;
  const now = Date.now();
  const lastSent = recentAlerts.get(alertKey);
  if (lastSent && now - lastSent < RATE_LIMIT_MS) return;
  recentAlerts.set(alertKey, now);

  // Prune old entries to prevent memory leak
  if (recentAlerts.size > 200) {
    for (const [k, ts] of recentAlerts) {
      if (now - ts > RATE_LIMIT_MS * 5) recentAlerts.delete(k);
    }
  }

  const embed = {
    title: title || 'API Error',
    color: statusCode >= 500 ? 0xFF5F57 : 0xEAB308, // red for 5xx, yellow for 4xx
    fields: [
      { name: 'Endpoint', value: endpoint || 'unknown', inline: true },
      { name: 'Status', value: String(statusCode || 'N/A'), inline: true },
      { name: 'Model', value: model || 'N/A', inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'INFINITE API Monitor' },
  };

  if (message) {
    embed.description = message.length > 300 ? message.slice(0, 300) + '...' : message;
  }
  if (apiKey) {
    embed.fields.push({ name: 'Key', value: apiKey.slice(0, 12) + '...', inline: true });
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.warn('Failed to send Discord alert', { err: err.message });
  }
}

/**
 * Middleware that catches 5xx responses and fires alerts.
 * Mount after routes but before the error handler.
 */
export function errorAlertMiddleware(req, res, next) {
  const originalEnd = res.end.bind(res);

  res.end = function (...args) {
    if (res.statusCode >= 500) {
      sendErrorAlert({
        title: `${res.statusCode} on ${req.method} ${req.path}`,
        message: res._alertMessage || '',
        endpoint: `${req.method} ${req.path}`,
        statusCode: res.statusCode,
        model: req.body?.model,
        apiKey: req.infinite?.apiKey,
      });
    }
    return originalEnd(...args);
  };

  next();
}
