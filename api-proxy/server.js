import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { logger } from './lib/logger.js';
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
import tradesRouter from './routes/trades.js';
import twitterRouter from './routes/twitter.js';
import alphaRouter from './routes/alpha.js';
import mcpRouter from './routes/mcp.js';
import openaiCompatRouter from './routes/openai-compat.js';
import controlPlaneRouter from './routes/control-plane.js';
import { bootstrapAlphaPipeline } from './alpha-pipeline.js';
import { initSocket, getIO } from './lib/socket.js';
import { initSentry } from './lib/sentry.js';
import { errorAlertMiddleware } from './lib/alerts.js';
import { buildX402Middleware, createX402Gateway } from './lib/x402.js';

const app = express();
app.use(cors({
  origin: [
    'https://meterflow.fun',
    'https://www.meterflow.fun',
    /\.meterflow\.fun$/,
    /\.vercel\.app$/,
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500'] : []),
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
// Default body limit — overridden per-route where needed
app.use(express.json({ limit: '1mb' }));

// Error alerting — fires Discord webhook on 5xx responses
app.use(errorAlertMiddleware);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path === '/health') return;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: duration,
    });
  });
  next();
});

app.use('/oauth', oauthRouter);
app.use('/auth', authRouter);

// x402 gateway — handles HTTP 402 pay-per-request before API key auth.
// Populated async; falls back to no-op until ready.
let x402Gateway = (_req, _res, next) => next();
buildX402Middleware().then(mw => { if (mw) x402Gateway = createX402Gateway(mw); });
app.use((req, res, next) => x402Gateway(req, res, next));
// Chat routes accept base64 image uploads — higher body limit
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
app.use('/v1', twitterRouter);
app.use('/v1', alphaRouter);
app.use('/mcp', mcpRouter);
app.use('/v1', controlPlaneRouter);
app.use('/v1', openaiCompatRouter);

// Sentry error handler (must be after routes, before listen)
initSentry(app);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info('Server started', { port: PORT, token: CONFIG.TOKEN_MINT.slice(0, 8) });

  initSocket(server);

  bootstrapAlphaPipeline().catch(err => {
    logger.error('Alpha pipeline bootstrap failed', { err: err.message });
  });
});

// Graceful shutdown — let in-flight requests (especially streams) finish
const SHUTDOWN_TIMEOUT = 15_000;

function shutdown(signal) {
  logger.info('Shutdown initiated', { signal });

  // Close Socket.IO first — notify connected clients, stop accepting new WS connections
  const io = getIO();
  if (io) {
    logger.info('Closing Socket.IO connections');
    io.close();
  }

  server.close(() => {
    logger.info('All connections closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: reason?.message || String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { err: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

export default app;
