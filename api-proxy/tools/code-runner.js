import vm from 'node:vm';

const TIMEOUT_MS = 5000;

export async function executeCodeRunner({ code }) {
  if (!code || typeof code !== 'string') {
    return { error: 'code is required' };
  }

  if (code.length > 10000) {
    return { error: 'Code too long (max 10,000 characters)' };
  }

  const logs = [];
  const sandbox = {
    Math, Date, JSON, String, Number, Array, Object, Map, Set,
    parseInt, parseFloat, isNaN, isFinite,
    RegExp, Error, TypeError, RangeError,
    Promise, setTimeout: undefined, setInterval: undefined,
    console: {
      log: (...args) => logs.push(args.map(formatArg).join(' ')),
      error: (...args) => logs.push('[error] ' + args.map(formatArg).join(' ')),
      warn: (...args) => logs.push('[warn] ' + args.map(formatArg).join(' ')),
    },
  };

  const context = vm.createContext(sandbox);
  const start = Date.now();

  try {
    const script = new vm.Script(code, { filename: 'user-code.js' });
    const returnValue = script.runInContext(context, { timeout: TIMEOUT_MS });
    const executionTimeMs = Date.now() - start;

    return {
      output: logs.join('\n').slice(0, 4000),
      returnValue: formatArg(returnValue),
      error: null,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - start;
    const isTimeout = err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';

    return {
      output: logs.join('\n').slice(0, 4000),
      returnValue: null,
      error: isTimeout ? 'Execution timed out (5s limit)' : err.message,
      executionTimeMs,
    };
  }
}

function formatArg(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'function') return '[Function]';
  if (typeof val === 'object') {
    try { return JSON.stringify(val, null, 2).slice(0, 2000); } catch { return String(val); }
  }
  return String(val);
}
