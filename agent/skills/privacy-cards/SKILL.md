# Privacy Cards

Manage merchant-locked virtual cards via Privacy.com API for paying fiat API vendors (Anthropic, OpenAI, Google, Railway, Helius, etc.).

## Environment Variables

- `PRIVACY_API_KEY` — Privacy.com API key (from privacy.com/account#api-key)
- `PRIVACY_SANDBOX` — Set to `true` to use sandbox (default: `false`)

## API Base URL

```
Production: https://api.privacy.com/v1
Sandbox:    https://sandbox.privacy.com/v1
```

## Auth Header

All requests require:
```
Authorization: api-key ${PRIVACY_API_KEY}
Content-Type: application/json
```

## Card Registry

Maintain a `card-registry.json` in the workspace directory mapping vendors to card tokens:

```json
{
  "cards": [
    {
      "vendor": "anthropic",
      "cardToken": "7ef7d65c-9023-4da3-b113-3b8583fd7951",
      "lastFour": "4142",
      "spendLimit": 50000,
      "spendLimitDuration": "MONTHLY",
      "state": "OPEN",
      "createdAt": "2026-02-23T10:00:00Z"
    }
  ],
  "lastUpdated": "2026-02-23T12:00:00Z"
}
```

## Vendor Configuration

Each vendor gets one MERCHANT_LOCKED card. The card auto-locks to the first merchant that charges it.

| Vendor | Expected Merchant | Monthly Limit |
|--------|-------------------|---------------|
| anthropic | Anthropic PBC | $500 |
| openai | OpenAI LLC | $500 |
| google | Google Cloud | $200 |
| helius | Helius Labs | $100 |
| railway | Railway Corp | $50 |
| render | Render Services | $50 |
| upstash | Upstash Inc | $50 |

## Step 1: List Existing Cards

Before creating new cards, check what already exists.

**Request:**
```
GET ${BASE_URL}/cards?page=1&page_size=50
Authorization: api-key ${PRIVACY_API_KEY}
```

**Response:**
```json
{
  "data": [
    {
      "token": "7ef7d65c-9023-4da3-b113-3b8583fd7951",
      "memo": "Meterflow-anthropic",
      "type": "MERCHANT_LOCKED",
      "last_four": "4142",
      "spend_limit": 50000,
      "spend_limit_duration": "MONTHLY",
      "state": "OPEN"
    }
  ],
  "page": 1,
  "total_entries": 1,
  "total_pages": 1
}
```

`spend_limit` is in **cents**. `50000 = $500.00`.

Match cards by `memo` prefix `Meterflow-{vendor}` to find existing cards for each vendor.

## Step 2: Create a Card for a Vendor

Only create if no card exists for that vendor (checked via memo match in Step 1).

**Request:**
```json
POST ${BASE_URL}/cards
Authorization: api-key ${PRIVACY_API_KEY}
Content-Type: application/json

{
  "type": "MERCHANT_LOCKED",
  "memo": "Meterflow-anthropic",
  "spend_limit": 50000,
  "spend_limit_duration": "MONTHLY",
  "state": "OPEN"
}
```

**Response:**
```json
{
  "created": "2026-02-23T10:00:00Z",
  "token": "7ef7d65c-9023-4da3-b113-3b8583fd7951",
  "last_four": "4142",
  "memo": "Meterflow-anthropic",
  "type": "MERCHANT_LOCKED",
  "spend_limit": 50000,
  "spend_limit_duration": "MONTHLY",
  "state": "OPEN",
  "pan": "4111111289144142",
  "cvv": "776",
  "exp_month": "06",
  "exp_year": "2028"
}
```

**CRITICAL:** The `pan`, `cvv`, `exp_month`, `exp_year` are the card details needed to add to each vendor's billing page. Store these securely. They are only returned once at creation time.

Save the full card details (including PAN/CVV) to `card-secrets.json` (encrypted or restricted access):

```json
{
  "anthropic": {
    "cardToken": "7ef7d65c-...",
    "pan": "4111111289144142",
    "cvv": "776",
    "expMonth": "06",
    "expYear": "2028"
  }
}
```

After creating, update `card-registry.json`.

## Step 3: Update Card Spending Limits

When treasury health changes, adjust card limits proportionally.

**Request:**
```json
PATCH ${BASE_URL}/cards/${CARD_TOKEN}
Authorization: api-key ${PRIVACY_API_KEY}
Content-Type: application/json

{
  "spend_limit": 25000,
  "spend_limit_duration": "MONTHLY"
}
```

**Limit adjustment rules:**
- `surplus` health: Use default limits from vendor config
- `healthy` health: Use default limits
- `cautious` health: Reduce all limits to 70% of default
- `critical` health: Reduce all limits to 30% of default, pause non-essential cards

## Step 4: Pause/Resume Cards

**Pause a card** (blocks all transactions, reversible):
```json
PATCH ${BASE_URL}/cards/${CARD_TOKEN}

{ "state": "PAUSED" }
```

**Resume a card:**
```json
PATCH ${BASE_URL}/cards/${CARD_TOKEN}

{ "state": "OPEN" }
```

**Close a card** (permanent, irreversible):
```json
PATCH ${BASE_URL}/cards/${CARD_TOKEN}

{ "state": "CLOSED" }
```

**When to pause:**
- Treasury health is `critical` and the vendor is non-essential
- Essential vendors (Anthropic, Helius) should never be paused unless runway < 1 day

**Vendor priority (never pause these first):**
1. Helius (RPC — if this dies, everything dies)
2. Anthropic (primary LLM — most user traffic)
3. Google (secondary LLM)
4. OpenAI (tertiary LLM)
5. Railway (hosting — can survive brief outage)
6. Everything else

## Step 5: Monitor Transactions

Track spending per card to update the treasury agent's cost tracking.

**Request:**
```
GET ${BASE_URL}/transactions?card_token=${CARD_TOKEN}&result=APPROVED&begin=2026-02-01&end=2026-02-28&page=1&page_size=50
Authorization: api-key ${PRIVACY_API_KEY}
```

**Response:**
```json
{
  "data": [
    {
      "token": "txn-uuid-here",
      "card_token": "7ef7d65c-...",
      "amount": 4523,
      "status": "SETTLED",
      "result": "APPROVED",
      "merchant": {
        "descriptor": "ANTHROPIC PBC",
        "city": "SAN FRANCISCO",
        "state": "CA",
        "country": "USA"
      },
      "created": "2026-02-15T08:00:00Z"
    }
  ]
}
```

`amount` is in **cents**. `4523 = $45.23`.

Aggregate monthly spend per vendor and report in the treasury health check.

## Step 6: Funding Source Verification

Cards are funded from a linked bank account. Verify the funding source exists:

```
GET ${BASE_URL}/funding_sources
Authorization: api-key ${PRIVACY_API_KEY}
```

If no funding source is linked, report: "No funding source linked to Privacy.com account. Add a bank account at privacy.com/account before cards can be charged."

**NOTE:** Funding sources cannot be created via API — they must be added through the Privacy.com dashboard.

## Reconciliation

Run monthly: sum all APPROVED transactions across all cards, compare to the treasury agent's `totalApiSpendUsd`. Report any discrepancy > $1.

```json
{
  "month": "2026-02",
  "cardSpendTotal": 245.67,
  "trackedSpendTotal": 243.20,
  "discrepancy": 2.47,
  "byVendor": {
    "anthropic": 120.30,
    "openai": 85.50,
    "google": 22.87,
    "helius": 12.00,
    "railway": 5.00
  }
}
```

Append to `payment-reconciliation.json` in the workspace directory.

## Error Handling

- **401 Unauthorized:** API key is invalid or expired. Flag as CRITICAL. Pause all operations.
- **429 Rate Limited:** Wait 60 seconds and retry once.
- **Card declined:** Log the decline reason. If `MERCHANT_LOCKED` card is used at wrong merchant, a new charge will fail. This is expected.
- **Funding source insufficient:** The charge will be declined. Log and flag for manual top-up of the Privacy.com funding source.
- **API timeout:** Retry up to 3 times with 5-second delay.
