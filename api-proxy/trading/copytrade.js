import { PublicKey } from '@solana/web3.js';
import { getQuote, executeSwap, SOL_MINT } from './jupiter.js';

export class CopyTrader {
  constructor(connection, keypair, options = {}) {
    this.connection = connection;
    this.keypair = keypair;
    this.targets = new Map();
    this.subscriptions = new Map();
    this.history = [];
    this.isRunning = false;
    this.stats = { totalTradesCopied: 0, successCount: 0, failCount: 0, totalPnlSol: 0 };
    this.maxHistorySize = options.maxHistorySize || 500;
    this.onTrade = options.onTrade || null;
  }

  addTarget(address, config = {}) {
    const id = `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const target = {
      id,
      address,
      name: config.name || address.slice(0, 8),
      multiplier: config.multiplier || 1.0,
      maxPositionSol: config.maxPositionSol || 0.5,
      minTradeSol: config.minTradeSol || 0.01,
      copyBuys: config.copyBuys !== false,
      copySells: config.copySells !== false,
      slippageBps: config.slippageBps || 500,
      delayMs: config.delayMs || 2000,
      allowedMints: config.allowedMints || null,
      blockedMints: new Set(config.blockedMints || []),
      isPaused: false,
      tradesCopied: 0,
      addedAt: Date.now(),
    };
    this.targets.set(id, target);
    if (this.isRunning) this._subscribe(target);
    return target;
  }

  removeTarget(id) {
    this._unsubscribe(id);
    this.targets.delete(id);
  }

  pauseTarget(id) {
    const target = this.targets.get(id);
    if (target) target.isPaused = true;
  }

  resumeTarget(id) {
    const target = this.targets.get(id);
    if (target) target.isPaused = false;
  }

  listTargets() {
    return [...this.targets.values()];
  }

  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  getStats() {
    return {
      ...this.stats,
      totalTargets: this.targets.size,
      activeTargets: [...this.targets.values()].filter(t => !t.isPaused).length,
      successRate: this.stats.totalTradesCopied > 0
        ? ((this.stats.successCount / this.stats.totalTradesCopied) * 100).toFixed(1)
        : '0.0',
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    for (const target of this.targets.values()) {
      this._subscribe(target);
    }
  }

  stop() {
    this.isRunning = false;
    for (const id of this.subscriptions.keys()) {
      this._unsubscribe(id);
    }
  }

  _subscribe(target) {
    try {
      const pubkey = new PublicKey(target.address);
      const subId = this.connection.onLogs(pubkey, async (logs) => {
        if (target.isPaused) return;
        await this._processLogs(target, logs);
      }, 'confirmed');
      this.subscriptions.set(target.id, subId);
    } catch (err) {
      console.error(`[CopyTrade] Failed to subscribe to ${target.address}:`, err.message);
    }
  }

  _unsubscribe(id) {
    const subId = this.subscriptions.get(id);
    if (subId !== undefined) {
      this.connection.removeOnLogsListener(subId).catch(() => {});
      this.subscriptions.delete(id);
    }
  }

  async _processLogs(target, logs) {
    if (logs.err) return;
    const sig = logs.signature;

    try {
      const tx = await this.connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
      if (!tx?.meta) return;

      const trade = this._detectTrade(target, tx);
      if (!trade) return;

      if (trade.action === 'buy' && !target.copyBuys) return;
      if (trade.action === 'sell' && !target.copySells) return;
      if (target.blockedMints.has(trade.mint)) return;
      if (target.allowedMints && !target.allowedMints.includes(trade.mint)) return;
      if (trade.solAmount < target.minTradeSol) return;

      // Apply delay
      if (target.delayMs > 0) await new Promise(r => setTimeout(r, target.delayMs));

      // Calculate copy amount
      const copySolAmount = Math.min(trade.solAmount * target.multiplier, target.maxPositionSol);
      const lamports = Math.floor(copySolAmount * 1e9);

      const inputMint = trade.action === 'buy' ? SOL_MINT : trade.mint;
      const outputMint = trade.action === 'buy' ? trade.mint : SOL_MINT;
      const amount = trade.action === 'buy' ? lamports : trade.tokenAmount;

      const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps: target.slippageBps });
      const result = await executeSwap(this.connection, this.keypair, quote);

      target.tradesCopied++;
      this.stats.totalTradesCopied++;
      this.stats.successCount++;
      this._recordHistory({ target: target.id, action: trade.action, mint: trade.mint, solAmount: copySolAmount, signature: result.signature, success: true });
      if (this.onTrade) this.onTrade({ target, trade, result });
    } catch (err) {
      this.stats.failCount++;
      this._recordHistory({ target: target.id, action: 'unknown', mint: null, solAmount: 0, signature: null, success: false, error: err.message });
      console.error(`[CopyTrade] Failed to copy trade from ${target.address}:`, err.message);
    }
  }

  _detectTrade(target, tx) {
    const { meta } = tx;
    const accountKeys = tx.transaction.message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey?.toBase58?.() || k.pubkey);
    const ownerIndex = accountKeys.indexOf(target.address);
    if (ownerIndex === -1) return null;

    const preSOL = (meta.preBalances?.[ownerIndex] || 0) / 1e9;
    const postSOL = (meta.postBalances?.[ownerIndex] || 0) / 1e9;
    const solChange = postSOL - preSOL;

    // Find token changes for this wallet
    const preTokens = (meta.preTokenBalances || []).filter(t => t.owner === target.address);
    const postTokens = (meta.postTokenBalances || []).filter(t => t.owner === target.address);

    if (postTokens.length === 0 && preTokens.length === 0) return null;

    // Detect the primary token that changed
    const tokenChanges = {};
    for (const pt of postTokens) {
      const mint = pt.mint;
      const postAmt = parseFloat(pt.uiTokenAmount?.uiAmountString || '0');
      const pre = preTokens.find(p => p.mint === mint);
      const preAmt = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || '0') : 0;
      tokenChanges[mint] = { change: postAmt - preAmt, amount: postAmt };
    }

    // Find largest absolute token change
    let bestMint = null;
    let bestChange = 0;
    for (const [mint, data] of Object.entries(tokenChanges)) {
      if (Math.abs(data.change) > Math.abs(bestChange)) {
        bestChange = data.change;
        bestMint = mint;
      }
    }
    if (!bestMint) return null;

    const isBuy = bestChange > 0 && solChange < 0;
    const isSell = bestChange < 0 && solChange > 0;
    if (!isBuy && !isSell) return null;

    return {
      action: isBuy ? 'buy' : 'sell',
      mint: bestMint,
      solAmount: Math.abs(solChange),
      tokenAmount: Math.abs(bestChange),
    };
  }

  _recordHistory(entry) {
    this.history.push({ ...entry, timestamp: Date.now() });
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  destroy() {
    this.stop();
    this.targets.clear();
    this.history = [];
  }
}
