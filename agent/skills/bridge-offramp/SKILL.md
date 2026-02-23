# Bridge Off-Ramp

Convert USDC (Solana) to USD via Bridge.xyz liquidation addresses. The USD lands in a linked bank account that funds the Privacy.com cards.

## Environment Variables

- `BRIDGE_API_KEY` — Bridge.xyz API key (from dashboard.bridge.xyz)
- `BRIDGE_CUSTOMER_ID` — Pre-created customer ID (after KYC completion)
- `BRIDGE_EXTERNAL_ACCOUNT_ID` — Pre-registered bank account ID
- `BRIDGE_LIQUIDATION_ADDRESS` — Pre-created Solana USDC liquidation address
- `BRIDGE_SANDBOX` — Set to `true` to use sandbox (default: `false`)
- `MAX_DAILY_OFFRAMP_USD` — Maximum USD to off-ramp per day (default: 200)
- `MIN_OFFRAMP_AMOUNT` — Minimum USDC to trigger off-ramp (default: 10)

## API Base URL

```
Production: https://api.bridge.xyz/v0
Sandbox:    https://api.sandbox.bridge.xyz/v0
```

## Auth Header

```
Api-Key: ${BRIDGE_API_KEY}
Content-Type: application/json
```

## Pre-Setup (One-Time, Manual)

These steps require manual completion before the agent can operate:

### 1. Create Customer (done once)

```json
POST ${BASE_URL}/customers
Api-Key: ${BRIDGE_API_KEY}
Content-Type: application/json

{
  "type": "individual",
  "first_name": "Your",
  "last_name": "Name",
  "email": "your@email.com"
}
```

Save the returned `id` as `BRIDGE_CUSTOMER_ID`.

### 2. Complete KYC (done once)

```json
POST ${BASE_URL}/customers/${BRIDGE_CUSTOMER_ID}/kyc_links
Api-Key: ${BRIDGE_API_KEY}
```

Returns a hosted URL. Complete identity verification at that URL. Status transitions: `incomplete` -> `under_review` -> `approved`.

### 3. Register Bank Account (done once)

```json
POST ${BASE_URL}/customers/${BRIDGE_CUSTOMER_ID}/external_accounts
Api-Key: ${BRIDGE_API_KEY}
Idempotency-Key: setup-bank-001
Content-Type: application/json

{
  "currency": "usd",
  "account_type": "us",
  "bank_name": "Your Bank",
  "account_name": "Your Checking",
  "first_name": "Your",
  "last_name": "Name",
  "account_owner_type": "individual",
  "account": {
    "routing_number": "YOUR_ROUTING",
    "account_number": "YOUR_ACCOUNT",
    "checking_or_savings": "checking"
  },
  "address": {
    "street": "123 Main St",
    "city": "Your City",
    "state": "CA",
    "postal_code": "90001",
    "country": "US"
  }
}
```

Save the returned `id` as `BRIDGE_EXTERNAL_ACCOUNT_ID`.

### 4. Create Liquidation Address (done once)

```json
POST ${BASE_URL}/customers/${BRIDGE_CUSTOMER_ID}/liquidation_addresses
Api-Key: ${BRIDGE_API_KEY}
Idempotency-Key: setup-liq-001
Content-Type: application/json

{
  "currency": "usdc",
  "chain": "solana",
  "external_account_id": "${BRIDGE_EXTERNAL_ACCOUNT_ID}",
  "destination_payment_rail": "ach",
  "destination_currency": "usd"
}
```

Response:
```json
{
  "id": "liq_addr_uuid",
  "chain": "solana",
  "address": "BridgeSolanaAddress123...",
  "currency": "usdc",
  "external_account_id": "ext_acct_uuid",
  "destination_payment_rail": "ach",
  "destination_currency": "usd"
}
```

Save `address` as `BRIDGE_LIQUIDATION_ADDRESS` and `id` for drain monitoring.

**How it works:** Any USDC sent to this Solana address is automatically converted to USD and deposited into the linked bank account via ACH.

## Automated Flow (Agent Operations)

### Step 1: Check USDC Balance

Query the agent wallet's USDC token account:

```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getTokenAccountsByOwner",
  "params": [
    "${WALLET_PUBLIC_KEY}",
    { "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { "encoding": "jsonParsed" }
  ]
}
```

Extract balance from `result.value[0].account.data.parsed.info.tokenAmount.uiAmount`.

### Step 2: Determine Off-Ramp Amount

**Decision logic:**

1. Check daily off-ramp tracker (`offramp-daily.json`). If `totalToday >= MAX_DAILY_OFFRAMP_USD`, skip.
2. Check USDC balance. If below `MIN_OFFRAMP_AMOUNT`, skip.
3. Reserve USDC for Skyfire if its balance is low (check via `get-wallet-balance` MCP tool).
4. Calculate: `offrampAmount = min(availableUsdc - skyfireReserve, MAX_DAILY_OFFRAMP_USD - totalToday)`
5. If `offrampAmount < MIN_OFFRAMP_AMOUNT`, skip.

**USDC allocation priority:**
1. Skyfire (keeps the proxy running right now)
2. Bridge off-ramp (funds Privacy.com cards for next billing cycle)
3. Reserve (keep $5 USDC as buffer)

### Step 3: Send USDC to Liquidation Address

Build and send a standard SPL Token transfer to the Bridge liquidation address.

**Transaction construction:**

1. Get recent blockhash:
```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getLatestBlockhash",
  "params": [{ "commitment": "finalized" }]
}
```

2. Build the SPL transfer instruction:
   - Source: Agent wallet's USDC Associated Token Account (ATA)
   - Destination: Bridge liquidation address's USDC ATA (create if needed)
   - Amount: `offrampAmount * 1_000_000` (USDC has 6 decimals)
   - Program: Token Program `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

3. Sign with agent keypair from `SOLANA_PRIVATE_KEY`.

4. Submit via Helius RPC:
```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sendTransaction",
  "params": [
    "<base64 signed transaction>",
    {
      "encoding": "base64",
      "skipPreflight": false,
      "preflightCommitment": "confirmed",
      "maxRetries": 3
    }
  ]
}
```

5. Confirm transaction (poll `getSignatureStatuses` every 2s, timeout 60s).

### Step 4: Monitor Drain Status

After sending USDC, monitor the Bridge drain (conversion process):

```
GET ${BASE_URL}/customers/${BRIDGE_CUSTOMER_ID}/liquidation_addresses/${LIQ_ADDR_ID}/drains?page=1&page_size=10
Api-Key: ${BRIDGE_API_KEY}
```

**Response:**
```json
{
  "data": [
    {
      "id": "drain_uuid",
      "state": "payment_submitted",
      "amount": "50.00",
      "currency": "usd",
      "created_at": "2026-02-23T12:00:00Z",
      "updated_at": "2026-02-23T12:05:00Z"
    }
  ]
}
```

**Drain states:**
- `funds_received` — Bridge received the USDC
- `payment_submitted` — ACH/wire initiated to bank
- `payment_processed` — USD arrived in bank account (success)
- `undeliverable` — Bank rejected (bad routing/account number)
- `returned` — ACH return (insufficient info, closed account)
- `error` — Bridge internal error

### Step 5: Log Off-Ramp

Append to `offramp-log.json`:
```json
{
  "type": "usdc_to_usd_offramp",
  "amountUsdc": 50.0,
  "expectedUsd": 50.0,
  "txSignature": "SolanaSignature...",
  "drainId": "drain_uuid",
  "drainState": "payment_submitted",
  "timestamp": "2026-02-23T12:00:00Z"
}
```

Update daily tracker `offramp-daily.json`:
```json
{
  "date": "2026-02-23",
  "totalToday": 50.0,
  "transactions": [
    { "amount": 50.0, "timestamp": "2026-02-23T12:00:00Z", "txSig": "..." }
  ]
}
```

Reset daily tracker at 00:00 UTC.

## ACH Timing

- ACH payouts are **batched daily at 1:00 PM EST** by Bridge
- Funds typically arrive in bank account within 1-2 business days
- Wire transfers are near-instant but may incur higher fees
- Plan off-ramps 3-5 days before card billing cycles

## Error Handling

- **Bridge API 401:** API key invalid. Flag CRITICAL.
- **Bridge API 429:** Rate limited. Wait 60s, retry once.
- **Insufficient USDC:** Log and skip. The jupiter-swap cron will produce more USDC.
- **Drain state `undeliverable` or `returned`:** Flag CRITICAL. Bank account details may be wrong. Require manual intervention.
- **Drain state `error`:** Log and monitor. May auto-resolve. If persists > 24h, flag CRITICAL.
- **Solana tx fails:** Log error. USDC stays in agent wallet. Retry on next cycle.
- **Daily limit reached:** Log and skip until next day.
