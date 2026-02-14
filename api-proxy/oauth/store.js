import crypto from 'crypto';

// apiKey → { github?: string, google?: { access, refresh, expiresAt }, notion?: string }
const oauthTokens = new Map();

// state → { apiKey, provider, expiresAt }
const pendingStates = new Map();

const STATE_TTL = 10 * 60 * 1000; // 10 minutes

export function setToken(apiKey, provider, tokenData) {
  const existing = oauthTokens.get(apiKey) || {};
  existing[provider] = tokenData;
  oauthTokens.set(apiKey, existing);
}

export function getToken(apiKey, provider) {
  const tokens = oauthTokens.get(apiKey);
  return tokens?.[provider] || null;
}

export function removeToken(apiKey, provider) {
  const tokens = oauthTokens.get(apiKey);
  if (!tokens) return;
  delete tokens[provider];
  oauthTokens.set(apiKey, tokens);
}

export function getConnectedProviders(apiKey) {
  const tokens = oauthTokens.get(apiKey) || {};
  return {
    github: !!tokens.github,
    google: !!tokens.google,
    notion: !!tokens.notion,
  };
}

export function createState(apiKey, provider) {
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, { apiKey, provider, expiresAt: Date.now() + STATE_TTL });
  return state;
}

export function consumeState(state) {
  const data = pendingStates.get(state);
  if (!data) return null;
  pendingStates.delete(state);
  if (Date.now() > data.expiresAt) return null;
  return data;
}

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now > val.expiresAt) pendingStates.delete(key);
  }
}, 5 * 60 * 1000);
