import { createSafetyManager, TriggerManager } from '../trading/index.js';
import { safetyManagers, activeTriggers, tradingPositions, tradeHistory } from '../state.js';
import { persistPositions, loadPositions, persistTrade, loadHistory } from './kv-trading.js';
import { logger } from './logger.js';

function getSafetyManager(apiKey) {
  if (!safetyManagers.has(apiKey)) safetyManagers.set(apiKey, createSafetyManager());
  return safetyManagers.get(apiKey);
}

function getTriggerManager(apiKey) {
  if (!activeTriggers.has(apiKey)) activeTriggers.set(apiKey, new TriggerManager());
  return activeTriggers.get(apiKey);
}

async function getPositions(apiKey) {
  if (!tradingPositions.has(apiKey)) {
    const persisted = await loadPositions(apiKey);
    tradingPositions.set(apiKey, persisted || new Map());
  }
  return tradingPositions.get(apiKey);
}

async function getHistory(apiKey) {
  if (!tradeHistory.has(apiKey)) {
    const persisted = await loadHistory(apiKey);
    tradeHistory.set(apiKey, persisted || []);
  }
  return tradeHistory.get(apiKey);
}

async function recordTrade(apiKey, entry) {
  const hist = await getHistory(apiKey);
  const record = { id: `t_${Date.now()}`, ...entry, ts: Date.now() };
  hist.push(record);
  if (hist.length > 1000) hist.splice(0, hist.length - 1000);
  await persistTrade(apiKey, record).catch(err => {
    logger.error('Failed to persist trade', { err: err.message });
  });
}

async function updatePosition(apiKey, mint, position) {
  const positions = await getPositions(apiKey);
  if (position) {
    positions.set(mint, position);
  } else {
    positions.delete(mint);
  }
  await persistPositions(apiKey, positions).catch(err => {
    logger.error('Failed to persist positions', { err: err.message });
  });
}

export { getSafetyManager, getTriggerManager, getPositions, getHistory, recordTrade, updatePosition };
