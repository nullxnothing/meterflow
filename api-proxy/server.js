import { CONFIG } from './config.js';
import { logger } from './lib/logger.js';
import { bootstrapAlphaPipeline } from './alpha-pipeline.js';
import { initSocket, getIO } from './lib/socket.js';
import app from './app.js';

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
