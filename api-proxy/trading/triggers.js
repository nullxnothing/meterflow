import { getPrice } from './jupiter.js';

const POLL_INTERVAL_MS = 10_000;

export class TriggerManager {
  constructor() {
    this.triggers = new Map();
    this.pollHandle = null;
    this.priceCache = new Map();
  }

  create({ mint, condition, order, expiresAt, oneShot = true }) {
    const id = `trig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trigger = {
      id, mint, condition, order, expiresAt: expiresAt || null,
      oneShot, status: 'active', previousPrice: null,
      createdAt: Date.now(), firedAt: null, result: null,
    };
    this.triggers.set(id, trigger);
    this._ensurePolling();
    return trigger;
  }

  cancel(id) {
    const trigger = this.triggers.get(id);
    if (trigger) {
      trigger.status = 'cancelled';
      this._cleanupIfEmpty();
    }
  }

  list() {
    return [...this.triggers.values()].map(t => ({
      id: t.id, mint: t.mint, condition: t.condition, order: t.order,
      status: t.status, createdAt: t.createdAt, firedAt: t.firedAt,
      expiresAt: t.expiresAt,
    }));
  }

  getActive() {
    return [...this.triggers.values()].filter(t => t.status === 'active');
  }

  setExecutor(executeFn) {
    this.executeFn = executeFn;
  }

  _ensurePolling() {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  _cleanupIfEmpty() {
    const activeCount = this.getActive().length;
    if (activeCount === 0 && this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async _poll() {
    const active = this.getActive();
    if (active.length === 0) return;

    // Collect unique mints
    const mints = [...new Set(active.map(t => t.mint))];

    // Fetch prices
    const prices = {};
    await Promise.allSettled(mints.map(async mint => {
      const price = await getPrice(mint);
      if (price !== null) prices[mint] = price;
    }));

    for (const trigger of active) {
      // Check expiry
      if (trigger.expiresAt && Date.now() >= trigger.expiresAt) {
        trigger.status = 'expired';
        continue;
      }

      const currentPrice = prices[trigger.mint];
      if (currentPrice === undefined) continue;

      const shouldFire = this._checkCondition(trigger, currentPrice);
      trigger.previousPrice = currentPrice;

      if (shouldFire) {
        trigger.firedAt = Date.now();
        trigger.status = 'fired';

        if (this.executeFn) {
          try {
            const result = await this.executeFn(trigger);
            trigger.result = { success: true, ...result };
          } catch (err) {
            trigger.result = { success: false, error: err.message };
          }
        }

        if (trigger.oneShot) {
          trigger.status = 'completed';
        } else {
          trigger.status = 'active';
        }
      }
    }

    this._cleanupIfEmpty();
  }

  _checkCondition(trigger, currentPrice) {
    const { type, price: targetPrice } = trigger.condition;

    switch (type) {
      case 'price_above':
        return currentPrice >= targetPrice;

      case 'price_below':
        return currentPrice <= targetPrice;

      case 'price_cross':
        if (trigger.previousPrice === null) return false;
        return (trigger.previousPrice < targetPrice && currentPrice >= targetPrice) ||
               (trigger.previousPrice > targetPrice && currentPrice <= targetPrice);

      default:
        return false;
    }
  }

  stopAll() {
    for (const trigger of this.triggers.values()) {
      if (trigger.status === 'active') trigger.status = 'stopped';
    }
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  destroy() {
    this.stopAll();
    this.triggers.clear();
  }
}
