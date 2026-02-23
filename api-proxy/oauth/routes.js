import { Router } from 'express';
import crypto from 'crypto';
import { PROVIDERS, getRedirectUri, getDashboardUrl, isProviderConfigured } from './config.js';
import { createState, consumeState, setToken, removeToken, getConnectedProviders, getToken } from './store.js';
import { getKeyData } from '../lib/kv-keys.js';
import { logger } from '../lib/logger.js';

const router = Router();

async function validateApiKey(req, res) {
  const apiKey = req.headers.authorization?.split(' ')[1];
  if (!apiKey) { res.status(401).json({ error: 'missing_api_key' }); return null; }
  const keyData = await getKeyData(apiKey);
  if (!keyData) { res.status(401).json({ error: 'invalid_api_key' }); return null; }
  return apiKey;
}

// POST /oauth/:provider/init — Start OAuth flow
router.post('/:provider/init', async (req, res) => {
  const { provider } = req.params;
  const apiKey = await validateApiKey(req, res);
  if (!apiKey) return;

  if (!PROVIDERS[provider]) {
    return res.status(400).json({ error: 'unknown_provider', message: `Unknown provider: ${provider}` });
  }

  if (!isProviderConfigured(provider)) {
    return res.status(503).json({ error: 'provider_not_configured', message: `${provider} OAuth is not configured yet.` });
  }

  const state = createState(apiKey, provider);
  const config = PROVIDERS[provider];
  const redirectUri = getRedirectUri(provider);

  let url;
  if (provider === 'twitter') {
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const twitterState = createState(apiKey, provider, { codeVerifier });
    const scopes = config.scopes.join(' ');
    url = `${config.authUrl}?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${twitterState}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  } else if (provider === 'notion') {
    url = `${config.authUrl}?client_id=${config.clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  } else {
    const scopes = config.scopes.join(' ');
    url = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}&response_type=code`;
    if (provider === 'google') {
      url += '&access_type=offline&prompt=consent';
    }
  }

  res.json({ url });
});

// GET /oauth/:provider/callback — Handle OAuth redirect
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(getDashboardUrl(`oauth_error=${encodeURIComponent(oauthError)}`));
  }

  if (!code || !state) {
    return res.redirect(getDashboardUrl('oauth_error=missing_params'));
  }

  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect(getDashboardUrl('oauth_error=invalid_state'));
  }

  if (stateData.provider !== provider) {
    return res.redirect(getDashboardUrl('oauth_error=provider_mismatch'));
  }

  try {
    const token = await exchangeCode(provider, code, stateData);
    await setToken(stateData.apiKey, provider, token);
    res.redirect(getDashboardUrl(`connected=${provider}`));
  } catch (err) {
    logger.error(`OAuth ${provider} exchange failed`, { err: err.message });
    res.redirect(getDashboardUrl(`oauth_error=${encodeURIComponent(err.message)}`));
  }
});

// GET /oauth/status — Get connected providers
router.get('/status', async (req, res) => {
  const apiKey = await validateApiKey(req, res);
  if (!apiKey) return;
  const providers = await getConnectedProviders(apiKey);
  res.json(providers);
});

// POST /oauth/:provider/disconnect — Remove OAuth connection
router.post('/:provider/disconnect', async (req, res) => {
  const { provider } = req.params;
  const apiKey = await validateApiKey(req, res);
  if (!apiKey) return;

  if (!PROVIDERS[provider]) {
    return res.status(400).json({ error: 'unknown_provider' });
  }

  await removeToken(apiKey, provider);
  if (provider === 'twitter') await removeToken(apiKey, 'twitter_byok');
  res.json({ success: true, provider });
});

async function exchangeCode(provider, code, stateData = {}) {
  const config = PROVIDERS[provider];
  const redirectUri = getRedirectUri(provider);

  if (provider === 'github') {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data.access_token;
  }

  if (provider === 'google') {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return {
      access: data.access_token,
      refresh: data.refresh_token || null,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  }

  if (provider === 'notion') {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error || 'Notion auth failed');
    return data.access_token;
  }

  if (provider === 'twitter') {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: stateData.codeVerifier,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return {
      access: data.access_token,
      refresh: data.refresh_token || null,
      expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// Refresh Google token if expired
export async function ensureValidGoogleToken(apiKey) {
  const tokenData = await getToken(apiKey, 'google');
  if (!tokenData) return null;

  if (typeof tokenData === 'string') return tokenData;

  if (tokenData.expiresAt && Date.now() > tokenData.expiresAt - 60_000 && tokenData.refresh) {
    const config = PROVIDERS.google;
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokenData.refresh,
        grant_type: 'refresh_token',
      }),
    });
    const data = await response.json();
    if (data.access_token) {
      tokenData.access = data.access_token;
      tokenData.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      await setToken(apiKey, 'google', tokenData);
    }
  }

  return tokenData.access || null;
}

// Refresh X/Twitter token if expired, or return BYOK token
export async function ensureValidTwitterToken(apiKey) {
  const byokToken = await getToken(apiKey, 'twitter_byok');
  if (byokToken) return byokToken;

  const tokenData = await getToken(apiKey, 'twitter');
  if (!tokenData) return null;

  if (typeof tokenData === 'string') return tokenData;

  if (tokenData.expiresAt && Date.now() > tokenData.expiresAt - 60_000 && tokenData.refresh) {
    const config = PROVIDERS.twitter;
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        refresh_token: tokenData.refresh,
        grant_type: 'refresh_token',
      }),
    });
    const data = await response.json();
    if (data.access_token) {
      tokenData.access = data.access_token;
      tokenData.refresh = data.refresh_token || tokenData.refresh;
      tokenData.expiresAt = Date.now() + (data.expires_in || 7200) * 1000;
      await setToken(apiKey, 'twitter', tokenData);
    }
  }

  return tokenData.access || null;
}

// POST /oauth/twitter/byok — Store user-provided Bearer Token
router.post('/twitter/byok', async (req, res) => {
  const apiKey = await validateApiKey(req, res);
  if (!apiKey) return;

  const { token } = req.body;
  if (!token || typeof token !== 'string' || token.trim().length < 10) {
    return res.status(400).json({ error: 'invalid_token', message: 'A valid Bearer Token is required.' });
  }

  try {
    const verify = await fetch('https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10', {
      headers: { 'Authorization': `Bearer ${token.trim()}` },
    });
    if (!verify.ok) {
      return res.status(400).json({ error: 'token_invalid', message: 'Token verification failed. Check your Bearer Token.' });
    }
  } catch {
    return res.status(502).json({ error: 'verification_failed', message: 'Could not verify token with X API.' });
  }

  await setToken(apiKey, 'twitter_byok', token.trim());
  res.json({ success: true, provider: 'twitter' });
});

export default router;
