// Socket.IO real-time layer for Meterflow alpha updates
import { Server } from 'socket.io';
import { getKeyData } from './kv-keys.js';
import { logger } from './logger.js';

const log = logger.child({ mod: 'alpha-ws' });
let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        'https://meterflow.fun',
        'https://www.meterflow.fun',
        /\.meterflow\.fun$/,
        /^chrome-extension:\/\//,
        ...(process.env.NODE_ENV !== 'production'
          ? ['http://localhost:5500', 'http://localhost:3000']
          : []),
      ],
      credentials: true,
    },
    path: '/alpha/ws',
    transports: ['websocket', 'polling'],
  });

  // Auth middleware — validate API key on connect
  io.use(async (socket, next) => {
    const apiKey = socket.handshake.auth?.apiKey || socket.handshake.query?.apiKey;
    if (!apiKey) return next(new Error('missing_api_key'));

    try {
      const keyData = await getKeyData(apiKey);
      if (!keyData) return next(new Error('invalid_api_key'));
      socket.data.apiKey = apiKey;
      socket.data.wallet = keyData.wallet;
      next();
    } catch (err) {
      next(new Error('auth_failed'));
    }
  });

  io.on('connection', (socket) => {
    log.debug('Client connected', { wallet: socket.data.wallet });

    // Everyone gets the main alpha feed
    socket.join('alpha:feed');

    // Subscribe to specific profile updates
    socket.on('subscribe:profile', (twitterId) => {
      if (typeof twitterId === 'string' && twitterId.length < 30) {
        socket.join(`alpha:profile:${twitterId}`);
      }
    });

    socket.on('unsubscribe:profile', (twitterId) => {
      socket.leave(`alpha:profile:${twitterId}`);
    });

    socket.on('disconnect', () => {
      log.debug('Client disconnected', { wallet: socket.data.wallet });
    });
  });

  log.info('Socket.IO initialized on /alpha/ws');
  return io;
}

export function getIO() {
  return io;
}

// ── Emit helpers (called from alpha-pipeline.js) ──

export function emitDiscovery(data) {
  io?.to('alpha:feed').emit('discovery', data);
}

export function emitAlert(twitterId, data) {
  io?.to('alpha:feed').emit('alert', { twitterId, ...data });
  io?.to(`alpha:profile:${twitterId}`).emit('profile:alert', data);
}

export function emitTrending(data) {
  io?.to('alpha:feed').emit('trending', data);
}

export function emitCADetection(twitterId, data) {
  io?.to('alpha:feed').emit('ca', { twitterId, ...data });
  io?.to(`alpha:profile:${twitterId}`).emit('profile:ca', data);
}
