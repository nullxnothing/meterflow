/**
 * MPP payment middleware for Meterflow.
 *
 * MPP is mounted as an additive rail beside x402. Existing x402 callers keep
 * their default challenge path, while MPP callers can opt in with
 * Authorization: Payment, Accept-Payment, X-Meterflow-Payment-Protocol: mpp,
 * or METERFLOW_DEFAULT_PAYMENT_PROTOCOL=mpp.
 */

import { Receipt as MppReceipt, Store as MppStore } from 'mppx';
import { Mppx, solana } from 'solana-mpp/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { USDC_MAINNET_ADDRESS } from '@x402/svm';
import { CONFIG } from '../config.js';
import { getRedis } from './redis.js';
import { logger } from './logger.js';
import { DEFAULT_METERS, listBillableMeters, recordReceipt } from './control-plane.js';

const METER_REFRESH_TTL_MS = 20_000;
const USDC_DECIMALS = 6;
const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';

function normalizeRequestPath(path = '') {
  return path.split('?')[0].replace(/^\/proxy/, '').replace(/\/$/, '') || '/';
}

function findMeterInList(meters, method, requestPath) {
  const normalized = normalizeRequestPath(requestPath);
  return meters.find(meter => {
    if (meter.status === 'paused') return false;
    if ((meter.method || 'GET').toUpperCase() !== method.toUpperCase()) return false;
    if (meter.route.endsWith('*')) return normalized.startsWith(meter.route.slice(0, -1));
    return normalizeRequestPath(meter.route) === normalized;
  }) || null;
}

async function loadBillableMeters() {
  try {
    return await listBillableMeters({ allowFallback: true, quiet: true });
  } catch (err) {
    logger.warn('MPP meter registry unavailable; using default meters', { err: err.message });
    return DEFAULT_METERS.filter(meter =>
      ['live', 'test', 'example'].includes(meter.status)
      && Number(meter.priceUsd) > 0
      && (meter.asset || 'USDC').toUpperCase() === 'USDC'
    );
  }
}

function createMppStore() {
  const redis = getRedis();
  if (!redis) return MppStore.memory();

  return MppStore.redis({
    get: key => redis.get(`meterflow:mpp:${key}`),
    set: (key, value) => redis.set(`meterflow:mpp:${key}`, value, 'EX', 60 * 60 * 24 * 7),
    del: key => redis.del(`meterflow:mpp:${key}`),
  });
}

function mppAmount(priceUsd) {
  const amount = Number(priceUsd || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return amount.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '');
}

function headerValue(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(', ');
  return value ? String(value) : '';
}

function shouldUseMpp(req) {
  const auth = headerValue(req, 'authorization').toLowerCase();
  if (auth.startsWith('bearer ')) return false;
  if (auth.startsWith('payment ')) return true;

  if (headerValue(req, 'x-payment')) return false;
  if (headerValue(req, 'x-payment-signature')) return false;
  if (headerValue(req, 'payment-signature')) return false;

  const selectedProtocol = headerValue(req, 'x-meterflow-payment-protocol').toLowerCase();
  if (selectedProtocol === 'mpp') return true;

  const acceptPayment = headerValue(req, 'accept-payment').toLowerCase();
  if (acceptPayment.includes('mpp') || acceptPayment.includes('payment')) return true;

  const query = String(req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(query);
  const queryProtocol = (
    params.get('paymentProtocol')
    || params.get('payment_protocol')
    || params.get('paymentRail')
    || params.get('protocol')
    || ''
  ).toLowerCase();
  if (queryProtocol === 'mpp') return true;

  return String(process.env.METERFLOW_DEFAULT_PAYMENT_PROTOCOL || 'x402').toLowerCase() === 'mpp';
}

function requestUrl(req) {
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host') || 'meterflow.fun';
  const proto = headerValue(req, 'x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${host}${req.originalUrl || req.url || '/'}`;
}

function requestHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, String(value));
  }
  return headers;
}

function paymentNetwork(network) {
  return network === 'mainnet-beta' ? 'solana-mainnet-beta' : `solana-${network}`;
}

function copyHeaders(fromResponse, res) {
  for (const [key, value] of fromResponse.headers) {
    res.setHeader(key, value);
  }
}

async function recordMppFailure({ req, meter, status = 'payment_verification_failed', error }) {
  return recordReceipt({
    meterId: meter.id,
    route: meter.route,
    method: meter.method,
    status,
    amountUsd: 0,
    baseAmountUsd: Number(meter.priceUsd || 0),
    protocolFeeUsd: 0,
    protocolFeeBps: 0,
    asset: meter.asset || 'USDC',
    wallet: null,
    apiKey: 'mpp',
    agent: 'mpp_payer',
    quoteId: headerValue(req, 'x-request-id') || null,
    paymentState: 'verification_failed',
    paymentProtocol: 'mpp',
    paymentIntent: 'charge',
    paymentMethod: 'solana',
    paymentNetwork: paymentNetwork(process.env.MPP_SOLANA_NETWORK || DEFAULT_SOLANA_NETWORK),
    paymentMint: USDC_MAINNET_ADDRESS,
    payTo: process.env.MPP_PAY_TO || process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET,
    payerWallet: headerValue(req, 'x-payment-wallet') || null,
    txSignature: null,
    paymentReference: null,
    policyResult: 'mpp_verification_failed',
    responseStatus: 402,
    error,
  });
}

export async function buildMppMiddleware() {
  const secretKey = process.env.MPP_SECRET_KEY;
  const payTo = process.env.MPP_PAY_TO || process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET;
  const network = process.env.MPP_SOLANA_NETWORK || DEFAULT_SOLANA_NETWORK;
  const rpcUrl = process.env.MPP_SOLANA_RPC_URL || CONFIG.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!secretKey) {
    logger.warn('MPP middleware disabled: MPP_SECRET_KEY required');
    return null;
  }
  if (!payTo) {
    logger.warn('MPP middleware disabled: MPP_PAY_TO, X402_PAY_TO, or SETTLEMENT_WALLET required');
    return null;
  }

  try {
    const meters = await loadBillableMeters();
    const mppx = Mppx.create({
      methods: [
        solana.charge({
          recipient: new PublicKey(payTo),
          mint: new PublicKey(USDC_MAINNET_ADDRESS),
          decimals: USDC_DECIMALS,
          network,
          connection: new Connection(rpcUrl, 'confirmed'),
          store: createMppStore(),
          verifyTimeout: Number(process.env.MPP_VERIFY_TIMEOUT_MS || 60_000),
        }),
      ],
      realm: process.env.MPP_REALM || 'meterflow.fun',
      secretKey,
    });

    logger.info('MPP middleware initialised', { payTo, network, routes: meters.length });
    return {
      mppx,
      meters,
      network,
      payTo,
      refreshedAt: Date.now(),
      refresh: buildMppMiddleware,
    };
  } catch (err) {
    logger.error('MPP middleware init failed', { err: err.message });
    return null;
  }
}

export function createMppGateway(mpp) {
  if (!mpp?.mppx) return (_req, _res, next) => next();

  let state = mpp;
  let meters = Array.isArray(state.meters) ? state.meters : DEFAULT_METERS;
  let refreshedAt = state.refreshedAt || Date.now();
  let refreshPromise = null;

  async function refreshGateway(force = false) {
    if (!force && Date.now() - refreshedAt < METER_REFRESH_TTL_MS) return;
    if (!state?.refresh) return;
    refreshPromise ||= state.refresh()
      .then(next => {
        if (next?.mppx) {
          state = next;
          meters = Array.isArray(next.meters) ? next.meters : meters;
          refreshedAt = next.refreshedAt || Date.now();
        }
      })
      .catch(err => {
        logger.warn('MPP meter refresh failed', { err: err.message });
      })
      .finally(() => {
        refreshPromise = null;
      });
    await refreshPromise;
  }

  return async (req, res, next) => {
    if (!shouldUseMpp(req)) return next();

    const requestPath = req.path || req.originalUrl || req.url;
    await refreshGateway(false);
    let meter = findMeterInList(meters, req.method, requestPath);
    if (!meter) {
      await refreshGateway(true);
      meter = findMeterInList(meters, req.method, requestPath);
    }
    if (!meter) return next();

    const amount = mppAmount(meter.priceUsd);
    const payment = await state.mppx.charge({
      amount,
      description: `${meter.unit || 'request'} via Meterflow`,
      scope: `${(meter.method || 'GET').toUpperCase()} ${meter.route}`,
      meta: {
        meterId: meter.id,
        route: meter.route,
        provider: meter.providerName || meter.ownerWallet || 'meterflow',
      },
    })(new Request(requestUrl(req), {
      method: req.method,
      headers: requestHeaders(req),
    }));

    if (payment.status === 402) {
      if (headerValue(req, 'authorization').toLowerCase().startsWith('payment ')) {
        await recordMppFailure({
          req,
          meter,
          error: 'MPP payment verification failed.',
        });
      }
      res.status(payment.challenge.status);
      copyHeaders(payment.challenge, res);
      res.setHeader('X-Meterflow-Payment-Protocol', 'mpp');
      res.setHeader('X-Meterflow-Meter', meter.id);
      return res.send(await payment.challenge.text());
    }

    const receiptResponse = payment.withReceipt(new Response(null, { status: 204 }));
    const paymentReceipt = receiptResponse.headers.get('Payment-Receipt');
    const receipt = paymentReceipt ? MppReceipt.deserialize(paymentReceipt) : null;
    if (paymentReceipt) res.setHeader('Payment-Receipt', paymentReceipt);
    res.setHeader('X-Meterflow-Payment-Protocol', 'mpp');
    res.setHeader('X-Meterflow-Meter', meter.id);
    if (receipt?.reference) res.setHeader('X-Payment-Transaction', receipt.reference);

    req.meterflow = {
      apiKey: 'mpp',
      wallet: headerValue(req, 'x-payment-wallet') || 'mpp_payer',
      tier: 'operator',
      tierConfig: CONFIG.TIERS.operator,
      isTrial: false,
      paymentVerified: true,
      usage: { count: 0, tokens: 0 },
    };
    req.meterflowControl = {
      allowed: true,
      meter,
      budget: null,
      policyResult: 'mpp_verified',
      paymentState: 'verified',
      economics: {
        baseAmountUsd: Number(meter.priceUsd || 0),
        protocolFeeBps: 0,
        protocolFeeUsd: 0,
        totalAmountUsd: Number(meter.priceUsd || 0),
      },
      paymentProtocol: 'mpp',
      paymentIntent: 'charge',
      paymentMethod: receipt?.method || 'solana',
      paymentReference: receipt?.reference || null,
      paymentNetwork: paymentNetwork(state.network),
      paymentMint: USDC_MAINNET_ADDRESS,
      payTo: state.payTo,
      payerWallet: headerValue(req, 'x-payment-wallet') || null,
      txSignature: receipt?.reference || null,
      quoteId: headerValue(req, 'x-request-id') || null,
    };

    return next();
  };
}
