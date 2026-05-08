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
import agentsRouter from './routes/agents.js';
import tradesRouter from './routes/trades.js';
import twitterRouter from './routes/twitter.js';
import alphaRouter from './routes/alpha.js';
import launchRouter from './routes/launch.js';
import openaiCompatRouter from './routes/openai-compat.js';
import controlPlaneRouter from './routes/control-plane.js';
import { bootstrapScheduler } from './agent-scheduler.js';
import { bootstrapAlphaPipeline } from './alpha-pipeline.js';
import { agentRuntime } from './lib/agent-runtime.js';
import { initSocket, getIO } from './lib/socket.js';
import { initSentry } from './lib/sentry.js';
import { errorAlertMiddleware } from './lib/alerts.js';

const app = express();
app.use(cors({
  origin: [
    'https://meterflow.fun',
    'https://www.meterflow.fun',
    /\.meterflow\.fun$/,
    'https://clawforge.tech',
    'https://www.clawforge.tech',
    /\.clawforge\.tech$/,
    /\.vercel\.app$/,
    /^chrome-extension:\/\//,
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
app.use('/v1', agentsRouter);
app.use('/v1', tradesRouter);
app.use('/v1', twitterRouter);
app.use('/v1', alphaRouter);
app.use('/v1', express.json({ limit: '10mb' }), launchRouter);
app.use('/v1', controlPlaneRouter);
app.use('/v1', openaiCompatRouter);

// Sentry error handler (must be after routes, before listen)
initSentry(app);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info('Server started', { port: PORT, token: CONFIG.TOKEN_MINT.slice(0, 8) });

  bootstrapScheduler().catch(err => {
    logger.error('Agent scheduler bootstrap failed', { err: err.message });
  });

  initSocket(server);

  bootstrapAlphaPipeline().catch(err => {
    logger.error('Alpha pipeline bootstrap failed', { err: err.message });
  });

  agentRuntime.start().catch(err => {
    logger.error('Agent runtime bootstrap failed', { err: err.message });
  });
});

// Graceful shutdown — let in-flight requests (especially streams) finish
const SHUTDOWN_TIMEOUT = 15_000;

function shutdown(signal) {
  logger.info('Shutdown initiated', { signal });

  // Stop agent runtime loops
  agentRuntime.stop();

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
