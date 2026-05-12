/**
 * x402 payment middleware for Meterflow.
 *
 * Enables HTTP 402 / pay-per-request access as a parallel auth path to API keys.
 * MFLOW token-holders continue to use their mf_xxxxx keys for free/discounted access.
 * Agents and external callers can pay per-request in USDC on Solana without a key.
 *
 * Flow:
 *   1. Request arrives with no Bearer token
 *   2. Middleware returns 402 + payment requirements (amount, payTo, network)
 *   3. Client (pay CLI / @x402/fetch) builds + signs Solana USDC transfer
 *   4. Client retries with X-Payment header
 *   5. Facilitator verifies proof, settles on-chain
 *   6. req.meterflow is populated with paymentVerified=true → proceeds to route handler
 */

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactSvmScheme as ExactSvmServerScheme } from '@x402/svm/exact/server';
import { ExactSvmScheme as ExactSvmFacilitatorScheme } from '@x402/svm/exact/facilitator';
import { toFacilitatorSvmSigner, SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from '@x402/svm';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { createFacilitatorConfig } from '@payai/facilitator';
import bs58 from 'bs58';
import { CONFIG } from '../config.js';
import { logger } from './logger.js';
import { DEFAULT_METERS, listBillableMeters, recordReceipt, updateReceipt } from './control-plane.js';

const PAYWALL_CONFIG = {
  appName: 'Meterflow',
};
const METER_REFRESH_TTL_MS = 20_000;

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

function requestFromTransport(transportContext) {
  return transportContext?.request?.adapter?.req || null;
}

function errorMessage(error) {
  if (!error) return null;
  return error.message || error.errorMessage || error.errorReason || String(error);
}

async function recordX402Failure({ req, meters, requirements, status, paymentState, policyResult, error, payerWallet, responseStatus = 402 }) {
  if (!req) return null;

  const meter = req.meterflowControl?.meter || findMeterInList(meters, req.method, req.path || req.originalUrl || req.url);
  if (!meter) return null;

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
    wallet: req.headers['x-payment-wallet'] || payerWallet || null,
    apiKey: 'x402',
    agent: req.headers['x-payment-wallet'] || payerWallet || 'x402_payer',
    quoteId: req.headers['x-payment-id'] || req.headers['x-request-id'] || null,
    paymentState,
    paymentNetwork: requirements?.network || SOLANA_MAINNET_CAIP2,
    paymentMint: requirements?.asset || USDC_MAINNET_ADDRESS,
    payTo: requirements?.payTo || req.meterflowControl?.payTo || null,
    payerWallet: payerWallet || req.headers['x-payment-wallet'] || null,
    txSignature: req.headers['x-payment-transaction'] || req.headers['x-transaction-signature'] || null,
    policyResult,
    responseStatus,
    error: errorMessage(error),
  });
}

async function loadBillableMeters() {
  try {
    return await listBillableMeters({ allowFallback: true, quiet: true });
  } catch (err) {
    logger.warn('x402 meter registry unavailable; using default meters', { err: err.message });
    return DEFAULT_METERS.filter(meter =>
      ['live', 'test', 'example'].includes(meter.status)
      && Number(meter.priceUsd) >= 0
      && (meter.asset || 'USDC').toUpperCase() === 'USDC'
    );
  }
}

export async function buildRouteConfig(payTo, billableMeters = null) {
  const routes = {};
  const meters = billableMeters || await loadBillableMeters();

  for (const meter of meters) {
    routes[`${(meter.method || 'GET').toUpperCase()} ${meter.route}`] = {
      accepts: {
        scheme: 'exact',
        price: `$${Number(meter.priceUsd || 0)}`,
        network: SOLANA_MAINNET_CAIP2,
        payTo,
        extra: { token: USDC_MAINNET_ADDRESS },
      },
      description: `${meter.unit || 'request'} via Meterflow`,
    };
  }
  return routes;
}

export async function buildX402Middleware() {
  const privateKeyB58 = process.env.X402_FACILITATOR_PRIVATE_KEY || process.env.SETTLEMENT_WALLET_PRIVATE_KEY;
  const payTo = process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET;

  if (!payTo) {
    logger.warn('x402 middleware disabled: X402_PAY_TO or SETTLEMENT_WALLET required');
    return null;
  }

  try {
    const serverScheme = new ExactSvmServerScheme();
    let facilitatorClient;
    let facilitatorProvider = 'payai';

    if (privateKeyB58) {
      const keypairBytes = bs58.decode(privateKeyB58);
      const kitSigner = await createKeyPairSignerFromBytes(keypairBytes);
      const svmSigner = toFacilitatorSvmSigner(kitSigner, { defaultRpcUrl: CONFIG.HELIUS_RPC_URL });
      const facilitatorScheme = new ExactSvmFacilitatorScheme(svmSigner);

      facilitatorClient = {
        verify: (payload, requirements) =>
          facilitatorScheme.verify(payload, requirements),
        settle: (payload, requirements) =>
          facilitatorScheme.settle(payload, requirements),
        getSupported: () => [{ network: SOLANA_MAINNET_CAIP2, schemes: ['exact'] }],
      };
      facilitatorProvider = 'inline';
    } else {
      facilitatorClient = new HTTPFacilitatorClient(
        createFacilitatorConfig(process.env.PAYAI_API_KEY_ID, process.env.PAYAI_API_KEY_SECRET)
      );
    }

    const meters = await loadBillableMeters();
    const routes = await buildRouteConfig(payTo, meters);
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(SOLANA_MAINNET_CAIP2, serverScheme);

    // Eagerly initialize so any facilitator network failures are caught here
    // rather than propagating during the first request.
    await resourceServer.initialize();

    resourceServer.onAfterVerify(async ({ result, requirements, transportContext }) => {
      if (result?.isValid) return;

      await recordX402Failure({
        req: requestFromTransport(transportContext),
        meters,
        requirements,
        status: 'payment_verification_failed',
        paymentState: 'verification_failed',
        policyResult: 'payment_verification_failed',
        error: result?.invalidMessage || result?.invalidReason || 'payment verification failed',
        payerWallet: result?.payer,
      });
    });
    resourceServer.onAfterSettle(async ({ result, transportContext }) => {
      const req = requestFromTransport(transportContext);
      const receiptId = req?.meterflowControl?.receiptId;
      const txSignature = result?.transaction || null;
      if (!receiptId || !txSignature) return;

      await updateReceipt(receiptId, {
        status: 'verified',
        paymentState: 'verified',
        payerWallet: result.payer || req.meterflowControl.payerWallet,
        txSignature,
      });
    });
    resourceServer.onSettleFailure(async ({ error, requirements, transportContext }) => {
      const req = requestFromTransport(transportContext);
      const receiptId = req?.meterflowControl?.receiptId;
      const patch = {
        status: 'settlement_failed',
        paymentState: 'settlement_failed',
        policyResult: 'settlement_failed',
        responseStatus: 402,
        amountUsd: 0,
        error: errorMessage(error) || 'payment settlement failed',
      };

      if (receiptId) {
        await updateReceipt(receiptId, patch);
        return;
      }

      await recordX402Failure({
        req,
        meters,
        requirements,
        ...patch,
      });
    });

    logger.info('x402 middleware initialised', { payTo, routes: Object.keys(routes).length, facilitatorProvider });
    return {
      // We initialize resourceServer above so startup failures are handled here.
      // Disable @x402/express' second eager initializer; it creates an
      // unawaited promise during middleware construction and can surface as an
      // unhandled rejection on Vercel cold starts.
      middleware: paymentMiddleware(routes, resourceServer, PAYWALL_CONFIG, undefined, false),
      meters,
      payTo,
      refreshedAt: Date.now(),
      refresh: buildX402Middleware,
    };
  } catch (err) {
    logger.error('x402 middleware init failed', { err: err.message });
    return null;
  }
}

/**
 * Express middleware that runs BEFORE authenticateApiKey.
 * If the request already has a Bearer token, skip (let normal auth handle it).
 * If the request has no Bearer, check if x402 proof is present and delegate to paymentMiddleware.
 * After successful x402 payment, populate req.meterflow and continue.
 */
export function createX402Gateway(x402) {
  let paymentMw = typeof x402 === 'function' ? x402 : x402?.middleware;
  if (!paymentMw) {
    return (_req, _res, next) => next();
  }

  let meters = Array.isArray(x402?.meters) ? x402.meters : DEFAULT_METERS;
  let configuredPayTo = x402?.payTo || '';
  let refreshedAt = x402?.refreshedAt || Date.now();
  let refreshPromise = null;

  async function refreshGateway(force = false) {
    if (!force && Date.now() - refreshedAt < METER_REFRESH_TTL_MS) return;
    if (!x402?.refresh) return;
    refreshPromise ||= x402.refresh()
      .then(next => {
        if (next?.middleware) {
          x402 = next;
          paymentMw = next.middleware;
          meters = Array.isArray(next.meters) ? next.meters : meters;
          configuredPayTo = next.payTo || configuredPayTo;
          refreshedAt = next.refreshedAt || Date.now();
        }
      })
      .catch(err => {
        logger.warn('x402 meter refresh failed', { err: err.message });
      })
      .finally(() => {
        refreshPromise = null;
      });
    await refreshPromise;
  }

  return async (req, res, next) => {
    // Pass through to normal auth if Bearer token present
    if (req.headers.authorization?.startsWith('Bearer ')) return next();

    const requestPath = req.path || req.originalUrl || req.url;
    await refreshGateway(false);
    let meter = findMeterInList(meters, req.method, requestPath);
    if (!meter) {
      await refreshGateway(true);
      meter = findMeterInList(meters, req.method, requestPath);
    }
    if (!meter) return next();

    const payTo = configuredPayTo || process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET;

    // Inject meterflow context after successful x402 payment, then continue
    const originalNext = next;
    const wrappedNext = async () => {
      req.meterflow = {
        apiKey: 'x402',
        wallet: req.headers['x-payment-wallet'] || 'x402_payer',
        tier: 'operator',
        tierConfig: CONFIG.TIERS['operator'],
        isTrial: false,
        paymentVerified: true,
        usage: { count: 0, tokens: 0 },
      };
      req.meterflowControl = {
        allowed: true,
        meter,
        budget: null,
        policyResult: 'x402_verified',
        paymentState: 'verified',
        economics: meter ? {
          baseAmountUsd: Number(meter.priceUsd || 0),
          protocolFeeBps: 0,
          protocolFeeUsd: 0,
          totalAmountUsd: Number(meter.priceUsd || 0),
        } : undefined,
        paymentNetwork: SOLANA_MAINNET_CAIP2,
        paymentMint: USDC_MAINNET_ADDRESS,
        payTo,
        payerWallet: req.headers['x-payment-wallet'] || 'x402_payer',
        txSignature: req.headers['x-payment-transaction'] || req.headers['x-payment-signature'] || null,
        quoteId: req.headers['x-payment-id'] || req.headers['x-request-id'] || null,
      };

      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = (name, value) => {
        if (String(name).toLowerCase() === 'payment-response') {
          try {
            const settlement = decodePaymentResponseHeader(String(value));
            const txSignature = settlement.transaction || null;
            const payerWallet = settlement.payer || req.meterflowControl.payerWallet;

            if (txSignature) {
              req.meterflowControl.txSignature = txSignature;
              originalSetHeader('X-Payment-Transaction', txSignature);
            }
            if (payerWallet) {
              req.meterflowControl.payerWallet = payerWallet;
            }

            if (req.meterflowControl.receiptId && txSignature) {
              req.meterflowControl.settlementRecorded = true;
            }
          } catch (err) {
            logger.warn('x402 payment response decode failed', { err: err.message });
          }
        }
        return originalSetHeader(name, value);
      };

      originalNext();
    };

    return paymentMw(req, res, wrappedNext);
  };
}
