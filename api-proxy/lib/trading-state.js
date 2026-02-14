import { createSafetyManager, TriggerManager } from '../trading/index.js';
import { safetyManagers, activeTriggers, tradingPositions, tradeHistory } from '../state.js';

function getSafetyManager(apiKey) {
  if (!safetyManagers.has(apiKey)) safetyManagers.set(apiKey, createSafetyManager());
  return safetyManagers.get(apiKey);
}

function getTriggerManager(apiKey) {
  if (!activeTriggers.has(apiKey)) activeTriggers.set(apiKey, new TriggerManager());
  return activeTriggers.get(apiKey);
}

function getPositions(apiKey) {
  if (!tradingPositions.has(apiKey)) tradingPositions.set(apiKey, new Map());
  return tradingPositions.get(apiKey);
}

function getHistory(apiKey) {
  if (!tradeHistory.has(apiKey)) tradeHistory.set(apiKey, []);
  return tradeHistory.get(apiKey);
}

function recordTrade(apiKey, entry) {
  const hist = getHistory(apiKey);
  hist.push({ id: `t_${Date.now()}`, ...entry, ts: Date.now() });
  if (hist.length > 1000) hist.splice(0, hist.length - 1000);
}

export { getSafetyManager, getTriggerManager, getPositions, getHistory, recordTrade };
