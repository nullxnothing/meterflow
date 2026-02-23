import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
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
import { bootstrapScheduler } from './agent-scheduler.js';

const app = express();
app.use(cors({
  origin: [
    'https://infinitekeys.fun',
    'https://www.infinitekeys.fun',
    /\.infinitekeys\.fun$/,
    /\.vercel\.app$/,
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500'] : []),
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/oauth', oauthRouter);
app.use('/auth', authRouter);
app.use('/v1', chatRouter);
app.use('/v1', multiRouter);
app.use('/v1', imageRouter);
app.use('/v1/video', videoRouter);
app.use('/v1/trading', tradingAnalysisRouter);
app.use('/v1/trading', tradingWalletRouter);
app.use('/v1/trading', tradingAdvancedRouter);
app.use('/v1/trading', tradingPortfolioRouter);
app.use('/', adminRouter);
app.use('/v1', agentsRouter);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  ∞  INFINITE API Proxy                   ║
  ║  Running on port ${PORT}                    ║
  ║  Token: ${CONFIG.TOKEN_MINT.slice(0, 8) || 'NOT SET'}...              ║
  ╚══════════════════════════════════════════╝
  `);

  bootstrapScheduler().catch(err => {
    console.error('[Server] Agent scheduler bootstrap failed:', err.message);
  });
});

// Graceful shutdown — let in-flight requests (especially streams) finish
const SHUTDOWN_TIMEOUT = 15_000;

function shutdown(signal) {
  console.log(`[Server] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] All connections closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
