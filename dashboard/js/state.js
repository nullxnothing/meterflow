// ═══════════════════════════════════════════
// INFINITE Dashboard — State & Constants
// ═══════════════════════════════════════════

export const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : '/proxy';

export const STORAGE_KEY = 'infinite_session';
export const CHAT_STORAGE_KEY = 'infinite_chats';

// ─── Main State ───

export const STATE = {
  connected: false,
  connecting: false,
  wallet: null,
  walletProvider: null,
  apiKey: null,
  apiKeyFull: null,
  tier: null,
  balance: 0,
  usage: { today: 0, limit: 0, remaining: 0 },
  models: [],
  treasury: { healthStatus: 'unknown', runwayDays: 0, multiplier: 1.0, treasuryBalanceUsd: 0, treasuryBalanceSol: 0, solPrice: 0 },
  providers: { claude: false, gemini: false, openai: false },
  connections: { github: false, google: false, notion: false },
  activeTab: 'overview',
  keyVisible: false,
  error: null,
};

export const CHAT = {
  conversations: [],
  activeId: null,
  selectedModel: '',
  isGenerating: false,
  abortController: null,
  enabledTools: ['web_search', 'url_reader', 'code_runner', 'image_generate', 'github_lookup', 'google_lookup', 'notion_lookup'],
  pendingImages: [],
};

export const IMAGES = {
  gallery: [],
  isGenerating: false,
};

export const VIDEOS = {
  gallery: [],
  isGenerating: false,
  pollIntervals: new Map(),
};

export const TRADING = {
  conversations: [],
  activeId: null,
  selectedModel: '',
  isGenerating: false,
  abortController: null,
  tokenInfo: null,
  // Bot state
  wallet: null,
  portfolio: null,
  positions: [],
  dcaOrders: [],
  copyTargets: [],
  triggers: [],
  safety: null,
  history: [],
  activePanel: 'portfolio',
  pollInterval: null,
  _endpointsDead: false,
  _fetchFailCount: 0,
};

export const AGENTS = {
  list: [],
  templates: [],
  activity: [],
  notifications: [],
  notifOpen: false,
  notifSeen: 0,
  wizardStep: 0,
  wizardTemplate: null,
  wizardConfig: {},
  selectedAgent: null,
  loading: false,
  pollInterval: null,
  runningAgents: new Set(),
};

export const VOTES = {
  userVotes: new Set(),
  voteCounts: {},
};

// Status polling interval reference
export let statusPollInterval = null;

export function setStatusPollInterval(interval) {
  statusPollInterval = interval;
}

export function clearStatusPollInterval() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

export let selectedApiCategory = 'All';
export function setSelectedApiCategory(val) { selectedApiCategory = val; }
