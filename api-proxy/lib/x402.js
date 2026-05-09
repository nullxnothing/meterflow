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
import { ExactSvmScheme as ExactSvmServerScheme } from '@x402/svm/exact/server';
import { ExactSvmScheme as ExactSvmFacilitatorScheme } from '@x402/svm/exact/facilitator';
import { toFacilitatorSvmSigner, SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from '@x402/svm';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import bs58 from 'bs58';
import { CONFIG } from '../config.js';
import { logger } from './logger.js';
import { findMeterForRequest, recordReceipt } from './control-plane.js';

const PAYWALL_CONFIG = {
  appName: 'Meterflow',
};

// Build x402 routes config from DEFAULT_METERS (live routes only).
// key format: "METHOD /path" — wildcard paths use trailing *
const METER_ROUTES = [
  { method: 'POST', path: '/v1/chat',         priceUsd: 0.004, description: 'Single-model chat completion' },
  { method: 'POST', path: '/v1/chat/stream',  priceUsd: 0.004, description: 'Streaming chat completion' },
  { method: 'POST', path: '/v1/multi',        priceUsd: 0.012, description: 'Multi-model parallel chat' },
  { method: 'POST', path: '/v1/multi/stream', priceUsd: 0.012, description: 'Streaming multi-model chat' },
  { method: 'POST', path: '/v1/image',        priceUsd: 0.08,  description: 'AI image generation' },
  { method: 'POST', path: '/v1/video/generate', priceUsd: 0.35, description: 'AI video generation' },
  { method: 'GET',  path: '/v1/alpha/*',      priceUsd: 0.012, description: 'On-chain alpha signals' },
  { method: 'POST', path: '/mcp/token-risk',  priceUsd: 0.006, description: 'Token risk MCP tool call' },
];

function buildRouteConfig(payTo) {
  const routes = {};
  for (const m of METER_ROUTES) {
    routes[`${m.method} ${m.path}`] = {
      accepts: {
        scheme: 'exact',
        price: `$${m.priceUsd}`,
        network: SOLANA_MAINNET_CAIP2,
        payTo,
        extra: { token: USDC_MAINNET_ADDRESS },
      },
      description: m.description,
    };
  }
  return routes;
}

let _middleware = null;

export async function buildX402Middleware() {
  const privateKeyB58 = process.env.X402_FACILITATOR_PRIVATE_KEY || process.env.SETTLEMENT_WALLET_PRIVATE_KEY;
  const payTo = process.env.X402_PAY_TO || CONFIG.TREASURY_WALLET;

  if (!privateKeyB58 || !payTo) {
    logger.warn('x402 middleware disabled: X402_FACILITATOR_PRIVATE_KEY and X402_PAY_TO (or TREASURY_WALLET) required');
    return null;
  }

  try {
    const keypairBytes = bs58.decode(privateKeyB58);
    const kitSigner = await createKeyPairSignerFromBytes(keypairBytes);
    const svmSigner = toFacilitatorSvmSigner(kitSigner, { defaultRpcUrl: CONFIG.HELIUS_RPC_URL });

    // Server scheme — builds payment requirements for 402 challenges
    const serverScheme = new ExactSvmServerScheme();

    // Facilitator scheme — verifies and settles payment proofs
    const facilitatorScheme = new ExactSvmFacilitatorScheme(svmSigner);

    // Inline facilitator client wrapping the SVM scheme — no external service needed
    const inlineFacilitator = {
      verify: (payload, requirements, extensions) =>
        facilitatorScheme.verify(payload, requirements),
      settle: (payload, requirements) =>
        facilitatorScheme.settle(payload, requirements),
      getSupported: () => [{ network: SOLANA_MAINNET_CAIP2, schemes: ['exact'] }],
    };

    const resourceServer = new x402ResourceServer(inlineFacilitator)
      .register(SOLANA_MAINNET_CAIP2, serverScheme);

    const routes = buildRouteConfig(payTo);

    logger.info('x402 middleware initialised', { payTo, routes: Object.keys(routes).length });
    return paymentMiddleware(routes, resourceServer, PAYWALL_CONFIG);
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
export function createX402Gateway(paymentMw) {
  if (!paymentMw) {
    return (_req, _res, next) => next();
  }

  return async (req, res, next) => {
    // Pass through to normal auth if Bearer token present
    if (req.headers.authorization?.startsWith('Bearer ')) return next();

    // Inject meterflow context after successful x402 payment, then continue
    const originalNext = next;
    const wrappedNext = async () => {
      const meter = await findMeterForRequest(req.method, req.originalUrl || req.path).catch(() => null);
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
      };

      // Record the receipt asynchronously — don't block the response
      if (meter) {
        recordReceipt({
          meterId: meter.id,
          route: meter.route,
          method: meter.method,
          status: 'verified',
          amountUsd: meter.priceUsd,
          baseAmountUsd: meter.priceUsd,
          protocolFeeUsd: 0,
          protocolFeeBps: 0,
          asset: 'USDC',
          wallet: req.meterflow.wallet,
          apiKey: 'x402',
          agent: req.meterflow.wallet,
          paymentState: 'verified',
          policyResult: 'x402_verified',
          responseStatus: null,
        }).catch(() => {});
      }

      originalNext();
    };

    return paymentMw(req, res, wrappedNext);
  };
}
