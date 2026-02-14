import { Router } from 'express';
import { PROVIDERS, getRedirectUri, isProviderConfigured } from './config.js';
import { createState, consumeState, setToken, removeToken, getConnectedProviders, getToken } from './store.js';

const router = Router();

// POST /oauth/:provider/init — Start OAuth flow
router.post('/:provider/init', async (req, res) => {
  const { provider } = req.params;
  const apiKey = req.headers.authorization?.split(' ')[1];

  if (!apiKey) {
    return res.status(401).json({ error: 'missing_api_key' });
  }

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
  if (provider === 'notion') {
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
    return res.redirect(`/dashboard?oauth_error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return res.redirect('/dashboard?oauth_error=missing_params');
  }

  const stateData = consumeState(state);
  if (!stateData) {
    return res.redirect('/dashboard?oauth_error=invalid_state');
  }

  if (stateData.provider !== provider) {
    return res.redirect('/dashboard?oauth_error=provider_mismatch');
  }

  try {
    const token = await exchangeCode(provider, code);
    setToken(stateData.apiKey, provider, token);
    res.redirect(`/dashboard?connected=${provider}`);
  } catch (err) {
    console.error(`OAuth ${provider} exchange failed:`, err.message);
    res.redirect(`/dashboard?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /oauth/status — Get connected providers
router.get('/status', (req, res) => {
  const apiKey = req.headers.authorization?.split(' ')[1];
  if (!apiKey) {
    return res.status(401).json({ error: 'missing_api_key' });
  }
  res.json(getConnectedProviders(apiKey));
});

// POST /oauth/:provider/disconnect — Remove OAuth connection
router.post('/:provider/disconnect', (req, res) => {
  const { provider } = req.params;
  const apiKey = req.headers.authorization?.split(' ')[1];

  if (!apiKey) {
    return res.status(401).json({ error: 'missing_api_key' });
  }

  if (!PROVIDERS[provider]) {
    return res.status(400).json({ error: 'unknown_provider' });
  }

  removeToken(apiKey, provider);
  res.json({ success: true, provider });
});

async function exchangeCode(provider, code) {
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

  throw new Error(`Unsupported provider: ${provider}`);
}

// Refresh Google token if expired
export async function ensureValidGoogleToken(apiKey) {
  const tokenData = getToken(apiKey, 'google');
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
      setToken(apiKey, 'google', tokenData);
    }
  }

  return tokenData.access || null;
}

export default router;
