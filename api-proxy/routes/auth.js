import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { CONFIG, TRIAL_CONFIG, FREE_ACCESS_TIER, isFreeAccessActive, getFreeAccessEndsAt } from '../config.js';
import { authenticateApiKey } from '../middleware.js';
import { getTokenBalance } from '../lib/balance.js';
import { generateApiKey, getTierForBalance } from '../lib/helpers.js';
import { isModelAvailable } from '../lib/providers.js';
import { getKeyData, setKeyData, getKeyForWallet, setKeyForWallet, deleteKey } from '../lib/kv-keys.js';
import { deleteWallet } from '../lib/kv-wallets.js';
import { logger } from '../lib/logger.js';
import { resetUsage } from '../lib/kv-usage.js';
import { getRedis } from '../lib/redis.js';

const router = Router();

const SIG_MAX_AGE_MS = 5 * 60 * 1000;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_PREFIX = 'meterflow:auth-challenge:';
const fallbackChallenges = new Map();
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many registration attempts. Try again in 15 minutes.' },
});

function challengeKey(wallet, nonce) {
  return `${CHALLENGE_PREFIX}${wallet}:${nonce}`;
}

function buildChallengeMessage(wallet, nonce, action = 'register') {
  const timestamp = Date.now();
  return {
    nonce,
    timestamp,
    expiresAt: new Date(timestamp + CHALLENGE_TTL_SECONDS * 1000).toISOString(),
    message: [
      'Meterflow Wallet Challenge',
      'Domain: meterflow.fun',
      'Product: Meterflow',
      `Action: ${action}`,
      `Wallet: ${wallet}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${timestamp}`,
    ].join('\n'),
  };
}

async function storeChallenge(wallet, challenge) {
  const key = challengeKey(wallet, challenge.nonce);
  const row = { wallet, nonce: challenge.nonce, message: challenge.message, expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000 };
  fallbackChallenges.set(key, row);
  const r = getRedis();
  if (r) await r.set(key, JSON.stringify(row), 'EX', CHALLENGE_TTL_SECONDS);
}

async function consumeChallenge(wallet, nonce) {
  const key = challengeKey(wallet, nonce);
  const fallback = fallbackChallenges.get(key) || null;
  fallbackChallenges.delete(key);
  const r = getRedis();
  if (!r) return fallback && fallback.expiresAt > Date.now() ? fallback : null;
  const raw = await r.get(key);
  await r.del(key);
  const row = raw ? JSON.parse(raw) : fallback;
  return row && row.expiresAt > Date.now() ? row : null;
}

function validateChallengeMessage(message, wallet) {
  const fields = Object.fromEntries(
    String(message || '').split(/\r?\n/).map(line => {
      const idx = line.indexOf(':');
      return idx > 0 ? [line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()] : null;
    }).filter(Boolean)
  );
  if (fields.domain !== 'meterflow.fun' || fields.product !== 'Meterflow') return { ok: false, error: 'invalid_domain' };
  if (!['register', 'agent-register'].includes(fields.action)) return { ok: false, error: 'invalid_action' };
  if (fields.wallet !== wallet) return { ok: false, error: 'wallet_mismatch' };
  if (!fields.nonce) return { ok: false, error: 'missing_nonce' };
  if (!fields.timestamp || Math.abs(Date.now() - Number(fields.timestamp)) > SIG_MAX_AGE_MS) return { ok: false, error: 'signature_expired' };
  return { ok: true, nonce: fields.nonce };
}

function buildTokenAccess({ tier = 'trial', balance = 0 } = {}) {
  const isHolder = tier && tier !== 'trial';
  const minSignal = CONFIG.TIERS.signal?.min || 0;
  const purchaseUrl = CONFIG.TOKEN_SWAP_URL || (CONFIG.TOKEN_MINT ? `https://jup.ag/swap/SOL-${CONFIG.TOKEN_MINT}` : null);
  const usdcPurchaseUrl = CONFIG.TOKEN_MINT ? `https://jup.ag/swap/${USDC_MINT}-${CONFIG.TOKEN_MINT}` : null;
  const protocolFeeBps = isHolder ? CONFIG.HOLDER_PROTOCOL_FEE_BPS : CONFIG.PROTOCOL_FEE_BPS;

  return {
    symbol: CONFIG.TOKEN_SYMBOL,
    mint: CONFIG.TOKEN_MINT || null,
    chain: 'solana',
    isHolder,
    balance,
    minSignal,
    protocolFeeBps,
    holderProtocolFeeBps: CONFIG.HOLDER_PROTOCOL_FEE_BPS,
    nonHolderProtocolFeeBps: CONFIG.PROTOCOL_FEE_BPS,
    purchaseUrl,
    usdcPurchaseUrl,
    jupiterQuoteTemplate: CONFIG.TOKEN_MINT
      ? `https://api.jup.ag/ultra/v1/order?inputMint=${WRAPPED_SOL_MINT}&outputMint=${CONFIG.TOKEN_MINT}&amount={lamports}&taker={wallet}`
      : null,
    agentInstructions: CONFIG.TOKEN_MINT
      ? {
          action: 'open_purchase_url_or_quote_jupiter',
          outputMint: CONFIG.TOKEN_MINT,
          defaultInputMint: WRAPPED_SOL_MINT,
          usdcInputMint: USDC_MINT,
          verifyWith: '/auth/status',
        }
      : { action: 'wait_for_token_launch', verifyWith: '/auth/tiers' },
  };
}

/**
 * Shared wallet verification + key issuance logic.
 * @param {{ wallet, signature, message }} params
 * @param {{ source?: string, extraResponse?: object }} opts
 * @returns {{ status: number, body: object }}
 */
async function registerWallet({ wallet, signature, message }, opts = {}) {
  const challenge = validateChallengeMessage(message, wallet);
  if (challenge.ok) {
    const stored = await consumeChallenge(wallet, challenge.nonce);
    if (!stored || stored.message !== message) {
      return { status: 401, body: { error: 'invalid_challenge', message: 'Challenge is missing, expired, or already used.' } };
    }
  } else if (process.env.ALLOW_LEGACY_WALLET_REGISTER !== 'true') {
    return {
      status: 400,
      body: {
        error: 'challenge_required',
        message: 'Request /auth/challenge first and sign the returned Meterflow challenge message.',
      },
    };
  }

  const tsMatch = message.match(/Timestamp:\s*(\d+)/);
  if (!tsMatch) {
    return { status: 400, body: { error: 'invalid_message', message: 'Signed message must include a Timestamp field.' } };
  }
  const sigTimestamp = parseInt(tsMatch[1], 10);
  if (Math.abs(Date.now() - sigTimestamp) > SIG_MAX_AGE_MS) {
    return { status: 401, body: { error: 'signature_expired', message: 'Signature has expired. Please sign a new message.' } };
  }

  let sigBytes;
  try {
    sigBytes = bs58.decode(signature);
  } catch {
    sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  }

  const verified = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    sigBytes,
    bs58.decode(wallet)
  );

  if (!verified) {
    return { status: 401, body: { error: 'invalid_signature', message: 'Wallet signature verification failed.' } };
  }

  const isWhitelisted = CONFIG.WHITELISTED_WALLETS.has(wallet);
  const balance = isWhitelisted ? 0 : await getTokenBalance(wallet);
  const tier = isWhitelisted ? 'architect' : getTierForBalance(balance);
  const effectiveTier = tier || 'trial';
  const tierConfig = effectiveTier === 'trial' ? TRIAL_CONFIG : CONFIG.TIERS[effectiveTier];
  const freeAccess = !isWhitelisted && balance < (CONFIG.TIERS.signal?.min || 10000) && isFreeAccessActive();

  let apiKey = await getKeyForWallet(wallet);
  if (apiKey) {
    const existing = await getKeyData(apiKey);
    if (existing) {
      existing.tier = effectiveTier;
      existing.balance = balance;
      await setKeyData(apiKey, existing);
      return {
        status: 200,
        body: {
          apiKey,
          tier: tierConfig.label,
          balance,
          dailyLimit: tierConfig.dailyLimit,
          models: tierConfig.models.filter(isModelAvailable),
          comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
          isTrial: effectiveTier === 'trial',
          token: buildTokenAccess({ tier: effectiveTier, balance }),
          freeAccess,
          freeAccessEndsAt: freeAccess ? getFreeAccessEndsAt() : undefined,
          message: freeAccess
            ? 'Free access granted for Meterflow gateway routes.'
            : 'Existing key returned. Tier updated.',
          ...opts.extraResponse,
        },
      };
    }
  }

  apiKey = generateApiKey();
  const keyData = { wallet, tier: effectiveTier, balance, createdAt: Date.now() };
  if (opts.source) keyData.source = opts.source;
  await setKeyData(apiKey, keyData);
  await setKeyForWallet(wallet, apiKey);

  if (opts.source) {
    logger.info('Agent registered', { wallet: wallet.slice(0, 8), tier: effectiveTier, source: opts.source });
  }

  return {
    status: 200,
    body: {
      apiKey,
      tier: tierConfig.label,
      balance,
      dailyLimit: tierConfig.dailyLimit,
      models: tierConfig.models.filter(isModelAvailable),
      comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
      isTrial: effectiveTier === 'trial',
      token: buildTokenAccess({ tier: effectiveTier, balance }),
      freeAccess,
      freeAccessEndsAt: freeAccess ? getFreeAccessEndsAt() : undefined,
      message: freeAccess
        ? 'Free access granted for Meterflow gateway routes.'
        : effectiveTier === 'trial'
          ? 'Trial access granted. Use a Meterflow key or paid request flow for full access.'
          : 'API key generated. Keep it safe.',
      ...opts.extraResponse,
    },
  };
}

// GET /auth/challenge?wallet=<solana address>
router.get('/challenge', registerLimiter, async (req, res) => {
  const wallet = String(req.query.wallet || '').trim();
  try {
    bs58.decode(wallet);
  } catch {
    return res.status(400).json({ error: 'invalid_wallet', message: 'wallet must be a base58 Solana public key.' });
  }
  const action = req.query.action === 'agent-register' ? 'agent-register' : 'register';
  const challenge = buildChallengeMessage(wallet, crypto.randomUUID(), action);
  await storeChallenge(wallet, challenge);
  res.json({
    wallet,
    action,
    nonce: challenge.nonce,
    message: challenge.message,
    expiresAt: challenge.expiresAt,
  });
});

// POST /auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { wallet, signature, message } = req.body;
  if (!wallet || !signature || !message) {
    return res.status(400).json({ error: 'missing_fields', message: 'Required: wallet, signature, message' });
  }
  try {
    const result = await registerWallet({ wallet, signature, message });
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error('Registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// GET /auth/status
router.get('/status', authenticateApiKey, (req, res) => {
  const { wallet, tier, balance, tierConfig, usage } = req.meterflow;
  const isGuest = !!req.meterflow.guest || wallet?.startsWith('guest_');
  const freeActive = isFreeAccessActive();
  const isFreeUser = isGuest || (freeActive && balance < (CONFIG.TIERS.signal?.min || 10000) && tier !== 'trial');
  res.json({
    wallet: isGuest ? null : wallet,
    tier: tierConfig.label,
    balance,
    usage: { today: usage.count, limit: tierConfig.dailyLimit, remaining: tierConfig.dailyLimit - usage.count },
    models: tierConfig.models.filter(isModelAvailable),
    comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
    token: buildTokenAccess({ tier, balance }),
    isGuest,
    freeAccess: isFreeUser,
    freeAccessEndsAt: isFreeUser ? getFreeAccessEndsAt() : undefined,
  });
});

// POST /auth/agent-register
router.post('/agent-register', registerLimiter, async (req, res) => {
  const { wallet, signature, message } = req.body;
  if (!wallet || !signature || !message) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Required: wallet (base58 public key), signature (base58 Ed25519 sig), message (signed text with Timestamp)',
      example: {
        wallet: '<solana-public-key>',
        signature: '<base58-signature>',
        message: 'Meterflow Agent Registration\nWallet: <public-key>\nTimestamp: <unix-ms>',
      },
    });
  }
  try {
    const result = await registerWallet(
      { wallet, signature, message },
      { source: 'agent', extraResponse: { tokenMint: CONFIG.TOKEN_MINT, dashboard: 'https://meterflow.fun', product: 'Meterflow' } },
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error('Agent registration error', { err: err.message });
    res.status(500).json({
      error: 'registration_failed',
      message: process.env.NODE_ENV === 'production' ? 'Registration failed. Try again.' : err.message,
    });
  }
});

// POST /auth/guest — temporary key during free access, no wallet required
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many guest requests. Try again later.' },
});

router.post('/guest', guestLimiter, async (req, res) => {
  if (!isFreeAccessActive()) {
    return res.status(403).json({
      error: 'free_access_inactive',
      message: 'Free access is not currently active. Use a Meterflow key or paid request flow for access.',
    });
  }

  try {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const tierConfig = CONFIG.TIERS[FREE_ACCESS_TIER];
    const apiKey = generateApiKey();

    await setKeyData(apiKey, {
      wallet: guestId,
      tier: FREE_ACCESS_TIER,
      balance: 0,
      guest: true,
      createdAt: Date.now(),
    });

    logger.info('Guest key issued', { guestId: guestId.slice(0, 16) });

    res.json({
      apiKey,
      tier: tierConfig.label,
      balance: 0,
      dailyLimit: tierConfig.dailyLimit,
      models: tierConfig.models.filter(isModelAvailable),
      comingSoon: tierConfig.models.filter(m => !isModelAvailable(m)),
      isTrial: false,
      isGuest: true,
      token: buildTokenAccess({ tier: 'trial', balance: 0 }),
      freeAccess: true,
      freeAccessEndsAt: getFreeAccessEndsAt(),
      message: 'Free access granted for Meterflow gateway routes.',
    });
  } catch (err) {
    logger.error('Guest registration error', { err: err.message });
    res.status(500).json({
      error: 'guest_failed',
      message: 'Could not create guest access. Try again.',
    });
  }
});

// GET /auth/tiers
router.get('/tiers', (_req, res) => {
  const tiers = Object.entries(CONFIG.TIERS).map(([key, tier]) => ({
    id: key,
    label: tier.label,
    minTokens: tier.min,
    dailyLimit: tier.dailyLimit,
    models: tier.models.filter(isModelAvailable),
  }));

  res.json({
    tokenMint: CONFIG.TOKEN_MINT,
    tokenSymbol: CONFIG.TOKEN_SYMBOL,
    token: buildTokenAccess(),
    chain: 'solana',
    dashboard: 'https://meterflow.fun',
    tiers: [
      { id: 'trial', label: 'Trial', minTokens: 0, dailyLimit: TRIAL_CONFIG.dailyLimit, models: TRIAL_CONFIG.models },
      ...tiers,
    ],
  });
});

// POST /auth/revoke — also cleans up trading wallet
router.post('/revoke', authenticateApiKey, async (req, res) => {
  const { apiKey, wallet } = req.meterflow;
  await deleteKey(apiKey, wallet);
  await Promise.all([resetUsage(apiKey), deleteWallet(apiKey)]);
  res.json({ message: 'API key revoked. Generate a new one at any time.' });
});

// POST /auth/rotate — also cleans up old trading wallet
router.post('/rotate', authenticateApiKey, async (req, res) => {
  const { apiKey: oldKey, wallet, tier, balance } = req.meterflow;

  await deleteKey(oldKey, wallet);
  await Promise.all([resetUsage(oldKey), deleteWallet(oldKey)]);

  const newKey = generateApiKey();
  await setKeyData(newKey, { wallet, tier, balance, createdAt: Date.now() });
  await setKeyForWallet(wallet, newKey);

  res.json({
    apiKey: newKey,
    tier: CONFIG.TIERS[tier].label,
    message: 'New key issued. Old key is now invalid.'
  });
});

export default router;
