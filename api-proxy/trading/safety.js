const DEFAULT_CONFIG = {
  dailyLossLimitSol: 2.0,
  dailyLossLimitPct: 10,
  maxDrawdownPct: 25,
  maxConcentrationPct: 50,
  maxDailyTrades: 200,
  cooldownMs: 4 * 60 * 60 * 1000,
  maxOrderSizeSol: 5.0,
  maxTotalExposureSol: 20.0,
};

export function createSafetyManager(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const state = {
    isKilled: false,
    killReason: null,
    isCooldown: false,
    cooldownUntil: null,
    dailyPnlSol: 0,
    dailyTrades: 0,
    peakValueSol: 0,
    currentValueSol: 0,
    alerts: [],
    tradeLog: [],
    lastResetDate: getTodayKey(),
  };

  let cooldownTimer = null;

  // Midnight reset
  const resetTimer = setInterval(() => {
    const today = getTodayKey();
    if (state.lastResetDate !== today) {
      state.dailyPnlSol = 0;
      state.dailyTrades = 0;
      state.lastResetDate = today;
      state.alerts = [];
    }
  }, 60_000);

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function addAlert(category, message, severity = 'warning') {
    state.alerts.push({ category, message, severity, timestamp: Date.now() });
    if (state.alerts.length > 100) state.alerts = state.alerts.slice(-100);
  }

  function canTrade() {
    if (state.isKilled) return { allowed: false, reason: `Kill switch active: ${state.killReason}` };
    if (state.isCooldown && Date.now() < state.cooldownUntil) {
      return { allowed: false, reason: `Cooldown active until ${new Date(state.cooldownUntil).toISOString()}` };
    }
    if (state.isCooldown && Date.now() >= state.cooldownUntil) {
      state.isCooldown = false;
      state.cooldownUntil = null;
    }
    return { allowed: true };
  }

  function validateTrade({ action, solAmount, mint, positions = [] }) {
    const tradeable = canTrade();
    if (!tradeable.allowed) return tradeable;

    if (solAmount > cfg.maxOrderSizeSol) {
      return { allowed: false, reason: `Order size ${solAmount} SOL exceeds max ${cfg.maxOrderSizeSol} SOL` };
    }

    if (state.dailyTrades >= cfg.maxDailyTrades) {
      return { allowed: false, reason: `Daily trade limit reached (${cfg.maxDailyTrades})` };
    }

    // Daily loss check
    if (state.dailyPnlSol < 0 && Math.abs(state.dailyPnlSol) >= cfg.dailyLossLimitSol) {
      tripBreaker('daily_loss', `Daily loss of ${Math.abs(state.dailyPnlSol).toFixed(4)} SOL exceeds limit`);
      return { allowed: false, reason: 'Daily loss limit breached' };
    }

    // Exposure check for buys
    if (action === 'buy') {
      const totalExposure = positions.reduce((sum, p) => sum + (p.valueSol || 0), 0) + solAmount;
      if (totalExposure > cfg.maxTotalExposureSol) {
        return { allowed: false, reason: `Total exposure ${totalExposure.toFixed(4)} SOL would exceed max ${cfg.maxTotalExposureSol} SOL` };
      }
    }

    return { allowed: true };
  }

  function recordTrade({ pnlSol = 0, solAmount = 0 }) {
    state.dailyTrades++;
    state.dailyPnlSol += pnlSol;
    state.tradeLog.push({ pnlSol, solAmount, timestamp: Date.now() });
    if (state.tradeLog.length > 500) state.tradeLog = state.tradeLog.slice(-500);

    // Check daily loss after recording
    if (state.dailyPnlSol < 0 && Math.abs(state.dailyPnlSol) >= cfg.dailyLossLimitSol) {
      tripBreaker('daily_loss', `Daily loss limit reached: ${Math.abs(state.dailyPnlSol).toFixed(4)} SOL`);
    }
  }

  function updatePortfolioValue(valueSol) {
    state.currentValueSol = valueSol;
    if (valueSol > state.peakValueSol) state.peakValueSol = valueSol;

    // Drawdown check
    if (state.peakValueSol > 0) {
      const drawdownPct = ((state.peakValueSol - valueSol) / state.peakValueSol) * 100;
      if (drawdownPct >= cfg.maxDrawdownPct) {
        tripBreaker('drawdown', `Drawdown ${drawdownPct.toFixed(1)}% exceeds max ${cfg.maxDrawdownPct}%`);
      }
    }
  }

  function tripBreaker(category, reason) {
    state.isCooldown = true;
    state.cooldownUntil = Date.now() + cfg.cooldownMs;
    addAlert(category, reason, 'critical');
    console.error(`[Safety] Circuit breaker tripped: ${category} — ${reason}`);

    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      state.isCooldown = false;
      state.cooldownUntil = null;
      addAlert('recovery', 'Cooldown expired, trading resumed', 'info');
    }, cfg.cooldownMs);
  }

  function killSwitch(reason = 'Manual kill switch') {
    state.isKilled = true;
    state.killReason = reason;
    addAlert('kill_switch', reason, 'critical');
    console.error(`[Safety] KILL SWITCH: ${reason}`);
  }

  function resumeTrading() {
    if (!state.isKilled && !state.isCooldown) return false;
    state.isKilled = false;
    state.killReason = null;
    state.isCooldown = false;
    state.cooldownUntil = null;
    if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; }
    addAlert('resume', 'Trading manually resumed', 'info');
    return true;
  }

  function getState() {
    return {
      ...state,
      config: cfg,
      canTrade: canTrade().allowed,
    };
  }

  function getAlerts(limit = 50) {
    return state.alerts.slice(-limit);
  }

  function destroy() {
    clearInterval(resetTimer);
    if (cooldownTimer) clearTimeout(cooldownTimer);
  }

  return { canTrade, validateTrade, recordTrade, updatePortfolioValue, killSwitch, resumeTrading, getState, getAlerts, destroy };
}
