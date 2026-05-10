import express from 'express';
import cors from 'cors';
import oauthRouter from './oauth/routes.js';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import imageRouter from './routes/image.js';
import videoRouter from './routes/video.js';
import tradingAnalysisRouter from './routes/trading-analysis.js';
import tradingWalletRouter from './routes/trading-wallet.js';
import tradingAdvancedRouter from './routes/trading-advanced.js';
import tradingPortfolioRouter from './routes/trading-portfolio.js';
import multiRouter from './routes/multi.js';
import adminRouter from './routes/admin.js';
import applicationsRouter from './routes/applications.js';
import tradesRouter from './routes/trades.js';
import alphaRouter from './routes/alpha.js';
import mcpRouter from './routes/mcp.js';
import openaiCompatRouter from './routes/openai-compat.js';
import controlPlaneRouter from './routes/control-plane.js';
import { logger } from './lib/logger.js';
import { initSentry } from './lib/sentry.js';
import { errorAlertMiddleware } from './lib/alerts.js';
import { buildX402Middleware, createX402Gateway } from './lib/x402.js';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: [
    'https://meterflow.fun',
    'https://www.meterflow.fun',
    /\.meterflow\.fun$/,
    /\.vercel\.app$/,
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500'] : []),
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'X-Request-Id',
    'Payment-Signature',
    'Payment-Required',
    'Payment-Response',
    'X-Payment',
    'X-Payment-Response',
    'X-Payment-Transaction',
    'X-Payment-Signature',
    'X-Transaction-Signature',
  ],
  exposedHeaders: [
    'Payment-Required',
    'Payment-Response',
    'X-Payment-Response',
    'X-Payment-Transaction',
    'X-Payment-Signature',
    'X-Transaction-Signature',
  ],
  credentials: true,
}));

// Default body limit - overridden per-route where needed.
app.use(express.json({ limit: '1mb' }));
app.use(errorAlertMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      runtime: process.env.VERCEL ? 'vercel' : 'node',
    });
  });
  next();
});

app.use('/oauth', oauthRouter);
app.use('/auth', authRouter);
app.use('/', applicationsRouter);

let x402Gateway = null;
const x402GatewayReady = buildX402Middleware()
  .then(mw => {
    x402Gateway = mw ? createX402Gateway(mw) : (_req, _res, next) => next();
    return x402Gateway;
  })
  .catch(err => {
    logger.error('x402 middleware init failed', { err: err.message });
    x402Gateway = (_req, _res, next) => next();
    return x402Gateway;
  });

app.use(async (req, res, next) => {
  const gateway = x402Gateway || await x402GatewayReady;
  return gateway(req, res, next);
});

app.use('/v1', express.json({ limit: '10mb' }), chatRouter);
app.use('/v1', multiRouter);
app.use('/v1', imageRouter);
app.use('/v1/video', videoRouter);
app.use('/v1/trading', tradingAnalysisRouter);
app.use('/v1/trading', tradingWalletRouter);
app.use('/v1/trading', tradingAdvancedRouter);
app.use('/v1/trading', tradingPortfolioRouter);
app.use('/', adminRouter);
app.use('/v1', tradesRouter);
app.use('/v1', alphaRouter);
app.use('/mcp', mcpRouter);
app.use('/v1', controlPlaneRouter);
app.use('/v1', openaiCompatRouter);

initSentry(app);

export default app;
