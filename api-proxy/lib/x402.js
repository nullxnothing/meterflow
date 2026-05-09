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
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactSvmScheme as ExactSvmServerScheme } from '@x402/svm/exact/server';
import { ExactSvmScheme as ExactSvmFacilitatorScheme } from '@x402/svm/exact/facilitator';
import { toFacilitatorSvmSigner, SOLANA_MAINNET_CAIP2, USDC_MAINNET_ADDRESS } from '@x402/svm';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { createFacilitatorConfig } from '@payai/facilitator';
import bs58 from 'bs58';
import { CONFIG } from '../config.js';
import { logger } from './logger.js';
import { findMeterForRequest, listBillableMeters } from './control-plane.js';

const PAYWALL_CONFIG = {
  appName: 'Meterflow',
};

export async function buildRouteConfig(payTo) {
  const routes = {};
  const meters = await listBillableMeters();
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

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(SOLANA_MAINNET_CAIP2, serverScheme);

    const routes = await buildRouteConfig(payTo);

    logger.info('x402 middleware initialised', { payTo, routes: Object.keys(routes).length, facilitatorProvider });
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

      originalNext();
    };

    return paymentMw(req, res, wrappedNext);
  };
}
