export const PROVIDER_POLICY_PRESETS = Object.freeze({
  strict_no_refund: {
    id: 'strict_no_refund',
    name: 'Strict no-refund',
    description: 'Charges every verified call. Best for deterministic low-cost endpoints where all responses are valuable.',
    refundOn5xx: false,
    refundOnTimeout: false,
    refundOnPolicyDeny: true,
    retryCreditOnFailure: false,
    timeoutMs: 30_000,
    maxRetryCredits: 0,
  },
  fair_api_default: {
    id: 'fair_api_default',
    name: 'Fair API default',
    description: 'Refund or credit failed provider responses while still charging successful calls.',
    refundOn5xx: true,
    refundOnTimeout: true,
    refundOnPolicyDeny: true,
    retryCreditOnFailure: true,
    timeoutMs: 30_000,
    maxRetryCredits: 1,
  },
  high_cost_generation: {
    id: 'high_cost_generation',
    name: 'High-cost generation',
    description: 'Protects expensive media/model routes with timeout credits instead of automatic refunds.',
    refundOn5xx: true,
    refundOnTimeout: false,
    refundOnPolicyDeny: true,
    retryCreditOnFailure: true,
    timeoutMs: 120_000,
    maxRetryCredits: 1,
  },
  enterprise_sla: {
    id: 'enterprise_sla',
    name: 'Enterprise SLA',
    description: 'Strict provider accountability for teams and production agents.',
    refundOn5xx: true,
    refundOnTimeout: true,
    refundOnPolicyDeny: true,
    retryCreditOnFailure: true,
    timeoutMs: 20_000,
    maxRetryCredits: 3,
  },
});

export function listProviderPolicyPresets() {
  return Object.values(PROVIDER_POLICY_PRESETS).map(preset => ({ ...preset }));
}

export function getProviderPolicyPreset(presetId) {
  const preset = PROVIDER_POLICY_PRESETS[presetId];
  return preset ? { ...preset } : null;
}

export function buildProviderPolicy(input = {}) {
  const preset = input.presetId || input.preset || 'fair_api_default';
  const base = getProviderPolicyPreset(preset);
  if (!base) return null;

  return {
    id: base.id,
    name: input.name || base.name,
    description: input.description || base.description,
    refundOn5xx: Boolean(input.refundOn5xx ?? base.refundOn5xx),
    refundOnTimeout: Boolean(input.refundOnTimeout ?? base.refundOnTimeout),
    refundOnPolicyDeny: Boolean(input.refundOnPolicyDeny ?? base.refundOnPolicyDeny),
    retryCreditOnFailure: Boolean(input.retryCreditOnFailure ?? base.retryCreditOnFailure),
    timeoutMs: Number(input.timeoutMs ?? base.timeoutMs),
    maxRetryCredits: Number(input.maxRetryCredits ?? base.maxRetryCredits),
    notes: input.notes || null,
    updatedAt: new Date().toISOString(),
  };
}

export function evaluateProviderPolicy(policy = {}, event = {}) {
  const status = Number(event.responseStatus || 0);
  const timedOut = Boolean(event.timedOut);
  const policyDenied = event.policyResult === 'policy_denied' || event.policyResult === 'budget_exhausted';

  const shouldRefund = Boolean(
    (policyDenied && policy.refundOnPolicyDeny)
    || (timedOut && policy.refundOnTimeout)
    || (status >= 500 && policy.refundOn5xx)
  );

  const shouldCreditRetry = Boolean(!shouldRefund && policy.retryCreditOnFailure && (timedOut || status >= 500));

  return {
    shouldRefund,
    shouldCreditRetry,
    reason: shouldRefund
      ? (policyDenied ? 'policy_denied' : timedOut ? 'timeout' : 'server_error')
      : shouldCreditRetry
        ? (timedOut ? 'timeout_retry_credit' : 'server_error_retry_credit')
        : 'charge_stands',
    maxRetryCredits: Number(policy.maxRetryCredits || 0),
  };
}
