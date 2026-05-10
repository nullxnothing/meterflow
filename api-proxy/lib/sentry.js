import * as Sentry from '@sentry/node';

const DSN = process.env.SENTRY_DSN?.trim();

export function initSentry(app) {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Strip API keys from breadcrumbs/extra
      if (event.extra?.apiKey) {
        event.extra.apiKey = event.extra.apiKey.slice(0, 8) + '...';
      }
      return event;
    },
  });

  Sentry.setupExpressErrorHandler(app);
}

export function captureError(err, ctx) {
  if (!DSN) return;
  Sentry.withScope(scope => {
    if (ctx) {
      Object.entries(ctx).forEach(([k, v]) => scope.setExtra(k, v));
    }
    Sentry.captureException(err);
  });
}
