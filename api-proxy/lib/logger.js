const IS_PROD = process.env.NODE_ENV === 'production';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug')];

function formatDev(level, msg, ctx) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] ${level.toUpperCase().padEnd(5)}`;
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : '';
  return `${prefix} ${msg}${ctxStr}`;
}

function formatProd(level, msg, ctx) {
  return JSON.stringify({
    level,
    ts: Date.now(),
    msg,
    ...ctx,
  });
}

function log(level, msg, ctx) {
  if (LEVELS[level] > CURRENT_LEVEL) return;
  const output = IS_PROD ? formatProd(level, msg, ctx) : formatDev(level, msg, ctx);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  error: (msg, ctx) => log('error', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  info: (msg, ctx) => log('info', msg, ctx),
  debug: (msg, ctx) => log('debug', msg, ctx),

  /** Create a child logger with preset context fields */
  child(defaults) {
    return {
      error: (msg, ctx) => log('error', msg, { ...defaults, ...ctx }),
      warn: (msg, ctx) => log('warn', msg, { ...defaults, ...ctx }),
      info: (msg, ctx) => log('info', msg, { ...defaults, ...ctx }),
      debug: (msg, ctx) => log('debug', msg, { ...defaults, ...ctx }),
    };
  },
};
