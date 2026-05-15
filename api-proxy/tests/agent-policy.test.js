/**
 * Agent spend-control policy tests.
 * Run: node --test tests/agent-policy.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBudget,
  createMeter,
  evaluateAgentSpendPolicy,
  recommendPaymentPath,
} from '../lib/control-plane.js';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe('Agent spend control', () => {
  it('allows an approved x402 route and hashes private metadata', async () => {
    const apiKey = unique('mf_test_policy');
    const agentId = unique('agent');
    const meter = await createMeter({
      route: `/gateway/${unique('approved')}/*`,
      method: 'GET',
      unit: 'lookup',
      priceUsd: 0.01,
      status: 'live',
    }, 'wallet_policy_owner');

    const budget = await createBudget({
      agentId,
      dailyCapUsd: 1,
      perCallCapUsd: 0.05,
      allowedMeterIds: [meter.id],
      allowedRoutes: [meter.route],
      allowedRails: ['x402'],
      piiGuard: true,
    }, apiKey, 'wallet_policy_owner');

    const decision = await evaluateAgentSpendPolicy({
      route: meter.route.replace('*', 'market-data'),
      method: 'GET',
      agentId,
      paymentProtocol: 'x402',
      metadata: { email: 'operator@example.com', reason: 'research' },
    }, { apiKey, wallet: 'wallet_policy_owner' });

    assert.equal(decision.allowed, true);
    assert.equal(decision.policyResult, 'allowed');
    assert.equal(decision.budget.id, budget.id);
    assert.equal(decision.recommendation.rail, 'x402');
    assert.equal(decision.recommendation.settlementAsset, 'USDC');
    assert.ok(decision.metadata.hash);
    assert.equal(decision.metadata.email, undefined);
  });

  it('blocks rails, per-call caps, and denied providers in enforce mode', async () => {
    const apiKey = unique('mf_test_policy');
    const agentId = unique('agent');
    const meter = await createMeter({
      route: `/gateway/${unique('blocked')}/*`,
      method: 'POST',
      unit: 'run',
      priceUsd: 0.04,
      providerName: 'blocked-provider',
      status: 'live',
    }, 'wallet_policy_owner');

    await createBudget({
      agentId,
      dailyCapUsd: 1,
      perCallCapUsd: 0.05,
      allowedMeterIds: [meter.id],
      allowedRoutes: [meter.route],
      allowedRails: ['x402'],
      deniedProviderIds: ['blocked-provider'],
    }, apiKey, 'wallet_policy_owner');

    const railDenied = await evaluateAgentSpendPolicy({
      route: meter.route.replace('*', 'job'),
      method: 'POST',
      agentId,
      paymentProtocol: 'mpp',
    }, { apiKey, wallet: 'wallet_policy_owner' });
    assert.equal(railDenied.allowed, false);
    assert.equal(railDenied.error, 'rail_not_allowed');

    const providerDenied = await evaluateAgentSpendPolicy({
      route: meter.route.replace('*', 'job'),
      method: 'POST',
      agentId,
      paymentProtocol: 'x402',
    }, { apiKey, wallet: 'wallet_policy_owner' });
    assert.equal(providerDenied.allowed, false);
    assert.equal(providerDenied.error, 'provider_denied');
  });

  it('supports monitor mode and MPP session recommendations', async () => {
    const apiKey = unique('mf_test_policy');
    const agentId = unique('agent');
    const meter = await createMeter({
      route: `/gateway/${unique('monitor')}/*`,
      method: 'GET',
      unit: 'stream',
      priceUsd: 0.08,
      status: 'live',
    }, 'wallet_policy_owner');

    await createBudget({
      agentId,
      dailyCapUsd: 1,
      perCallCapUsd: 0.01,
      allowedMeterIds: [meter.id],
      mode: 'monitor',
    }, apiKey, 'wallet_policy_owner');

    const decision = await evaluateAgentSpendPolicy({
      route: meter.route.replace('*', 'stream'),
      method: 'GET',
      agentId,
      intent: 'session',
    }, { apiKey, wallet: 'wallet_policy_owner' });

    assert.equal(decision.allowed, true);
    assert.equal(decision.enforcement, 'monitor');
    assert.equal(decision.policyResult, 'monitor_per_call_cap_exceeded');
    assert.equal(recommendPaymentPath({ intent: 'session' }).rail, 'mpp');
  });
});
