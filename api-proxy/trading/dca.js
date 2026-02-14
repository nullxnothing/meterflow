import { getQuote, executeSwap, SOL_MINT } from './jupiter.js';

export function createDCAOrder(connection, keypair, { inputMint, outputMint, totalAmountLamports, amountPerCycleLamports, cycleIntervalMs, slippageBps = 300, maxCycles, maxPrice }) {
  const id = `dca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const order = {
    id,
    inputMint,
    outputMint,
    totalAmountLamports,
    amountPerCycleLamports,
    cycleIntervalMs,
    slippageBps,
    maxCycles: maxCycles || Math.ceil(totalAmountLamports / amountPerCycleLamports),
    maxPrice: maxPrice || null,
    investedLamports: 0,
    totalTokensReceived: 0,
    cyclesCompleted: 0,
    consecutiveFailures: 0,
    status: 'active',
    createdAt: Date.now(),
    lastCycleAt: null,
    history: [],
    intervalHandle: null,
  };

  order.intervalHandle = setInterval(async () => {
    if (order.status !== 'active') return;
    if (order.cyclesCompleted >= order.maxCycles) {
      order.status = 'completed';
      clearInterval(order.intervalHandle);
      return;
    }
    if (order.investedLamports >= order.totalAmountLamports) {
      order.status = 'completed';
      clearInterval(order.intervalHandle);
      return;
    }

    const remaining = order.totalAmountLamports - order.investedLamports;
    const cycleAmount = Math.min(order.amountPerCycleLamports, remaining);

    try {
      const quote = await getQuote({
        inputMint: order.inputMint,
        outputMint: order.outputMint,
        amount: String(cycleAmount),
        slippageBps: order.slippageBps,
      });

      // Check max price if set
      if (order.maxPrice && quote.outAmount) {
        const price = cycleAmount / parseFloat(quote.outAmount);
        if (price > order.maxPrice) {
          order.history.push({ cycle: order.cyclesCompleted + 1, skipped: true, reason: 'Price exceeds max', timestamp: Date.now() });
          return;
        }
      }

      const result = await executeSwap(connection, keypair, quote);
      order.investedLamports += cycleAmount;
      order.totalTokensReceived += parseFloat(quote.outAmount || '0');
      order.cyclesCompleted++;
      order.consecutiveFailures = 0;
      order.lastCycleAt = Date.now();
      order.history.push({
        cycle: order.cyclesCompleted,
        amountIn: cycleAmount,
        amountOut: quote.outAmount,
        signature: result.signature,
        timestamp: Date.now(),
      });
    } catch (err) {
      order.consecutiveFailures++;
      order.history.push({
        cycle: order.cyclesCompleted + 1,
        error: err.message,
        timestamp: Date.now(),
      });

      if (order.consecutiveFailures >= 5) {
        order.status = 'paused';
        console.error(`[DCA] Order ${order.id} auto-paused after 5 consecutive failures`);
      }
    }
  }, order.cycleIntervalMs);

  return order;
}

export function pauseDCAOrder(order) {
  if (order.status === 'active') order.status = 'paused';
}

export function resumeDCAOrder(order) {
  if (order.status === 'paused') {
    order.status = 'active';
    order.consecutiveFailures = 0;
  }
}

export function cancelDCAOrder(order) {
  order.status = 'cancelled';
  if (order.intervalHandle) {
    clearInterval(order.intervalHandle);
    order.intervalHandle = null;
  }
}

export function getDCAOrderInfo(order) {
  return {
    id: order.id,
    inputMint: order.inputMint,
    outputMint: order.outputMint,
    status: order.status,
    totalAmountLamports: order.totalAmountLamports,
    amountPerCycleLamports: order.amountPerCycleLamports,
    cycleIntervalMs: order.cycleIntervalMs,
    investedLamports: order.investedLamports,
    totalTokensReceived: order.totalTokensReceived,
    cyclesCompleted: order.cyclesCompleted,
    maxCycles: order.maxCycles,
    cyclesRemaining: order.maxCycles - order.cyclesCompleted,
    createdAt: order.createdAt,
    lastCycleAt: order.lastCycleAt,
    recentHistory: order.history.slice(-10),
  };
}
