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
import adminRouter from './routes/admin.js';
import agentsRouter from './routes/agents.js';
import { bootstrapScheduler } from './agent-scheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/oauth', oauthRouter);
app.use('/auth', authRouter);
app.use('/v1', chatRouter);
app.use('/v1', imageRouter);
app.use('/v1/video', videoRouter);
app.use('/v1/trading', tradingAnalysisRouter);
app.use('/v1/trading', tradingWalletRouter);
app.use('/v1/trading', tradingAdvancedRouter);
app.use('/v1/trading', tradingPortfolioRouter);
app.use('/', adminRouter);
app.use('/v1', agentsRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  ∞  INFINITE API Proxy                   ║
  ║  Running on port ${PORT}                    ║
  ║  Token: ${CONFIG.TOKEN_MINT.slice(0, 8) || 'NOT SET'}...              ║
  ╚══════════════════════════════════════════╝
  `);

  // Bootstrap agent scheduler after server starts
  bootstrapScheduler().catch(err => {
    console.error('[Server] Agent scheduler bootstrap failed:', err.message);
  });
});

export default app;
