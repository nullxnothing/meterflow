# Meterflow v2 Provider Policies

Provider policies define how a paid endpoint should behave when a request is paid for but the route fails, times out, or is blocked by policy.

This is the first evaluation layer. It does not yet move funds or issue credits automatically.

## Presets

| Preset | Best for |
| --- | --- |
| `fair_api_default` | Standard APIs where failed provider responses should be compensated with a return or retry credit. |
| `strict_no_refund` | Deterministic low-cost endpoints where every response has value. |
| `high_cost_generation` | Media/model routes where retry credits are safer than automatic returns for timeouts. |
| `enterprise_sla` | Production workflows with stricter provider accountability. |

## API

```http
GET /v1/provider-policies
GET /v1/provider-policies/:id
POST /v1/provider-policies/evaluate
```

Example evaluation:

```json
{
  "preset": "fair_api_default",
  "responseStatus": 500
}
```

Example decision:

```json
{
  "decision": {
    "shouldRefund": true,
    "shouldCreditRetry": false,
    "reason": "server_error",
    "maxRetryCredits": 1
  }
}
```

## SDK

```js
const policies = await meterflow.providerPolicies();
const policy = await meterflow.providerPolicy('fair_api_default');

const decision = await meterflow.evaluateProviderPolicy({
  preset: 'fair_api_default',
  responseStatus: 500,
});
```

## CLI

```bash
meterflow provider-policies
meterflow provider-policy --id fair_api_default
meterflow evaluate-policy --preset fair_api_default --status 500
meterflow evaluate-policy --preset enterprise_sla --timeout
```

## Next step

The next implementation should connect decisions to the receipt ledger, provider dashboard, retry-credit balance, and settlement-aware return flow.
