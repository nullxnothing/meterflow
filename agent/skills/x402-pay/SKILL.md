# x402 Pay

Pay for x402-enabled API endpoints using USDC on Solana. The x402 protocol (HTTP 402 Payment Required) enables pay-per-request access without accounts or API keys.

## Environment Variables

- `SOLANA_PRIVATE_KEY` — Agent wallet keypair (Base58) for signing payment transactions
- `HELIUS_API_KEY` — Helius RPC for Solana interactions
- `X402_FACILITATOR_URL` — Facilitator endpoint for payment verification/settlement (default: `https://api.cdp.coinbase.com/platform/v2/x402`)
- `CDP_API_KEY` — Coinbase CDP API key (for the default facilitator, optional if self-hosting)
- `X402_MAX_PER_REQUEST_USD` — Max USDC to pay per single request (default: 0.10)
- `X402_MAX_DAILY_USD` — Max USDC to spend via x402 per day (default: 10.00)

## Dependencies

```
npm install @x402/core @x402/svm @x402/fetch
```

## How x402 Works

```
1. Agent calls API endpoint with normal GET/POST
2. Server returns HTTP 402 + PaymentRequirements JSON
3. Agent reads payment amount and recipient from requirements
4. Agent builds + signs a Solana USDC transfer transaction
5. Agent retries the request with X-Payment header containing the signed tx
6. Server (or facilitator) verifies and submits the tx on-chain
7. Server returns 200 OK with the content
```

The agent never submits the transaction itself — the server/facilitator does. This prevents double-spending.

## Constants

- USDC Mint (Mainnet): `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- USDC Mint (Devnet): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Solana Mainnet Network ID: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
- Solana Devnet Network ID: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`

## Step 1: Make Initial Request

Send a normal HTTP request to the x402-enabled endpoint:

```
GET https://api.example.com/premium-data
```

If the endpoint requires payment, it returns:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "maxAmountRequired": "1000",
      "resource": "https://api.example.com/premium-data",
      "description": "Premium data access",
      "payTo": "RecipientWalletAddress...",
      "extra": {
        "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      }
    }
  ]
}
```

`maxAmountRequired` is in the token's smallest unit. For USDC (6 decimals): `1000 = $0.001`.

## Step 2: Validate Payment Requirements

Before paying, verify:

1. **Amount check:** Convert `maxAmountRequired` to USD. If > `X402_MAX_PER_REQUEST_USD`, refuse and log.
2. **Daily limit check:** If daily x402 spend + this payment > `X402_MAX_DAILY_USD`, refuse and log.
3. **Network check:** Confirm `network` matches Solana mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`).
4. **Token check:** Confirm `extra.token` is USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
5. **Balance check:** Verify agent wallet has enough USDC.

If any check fails, log the reason and skip.

## Step 3: Build Payment Transaction

Build a Solana SPL Token transfer:

1. Get recent blockhash from Helius RPC.
2. Build transfer instruction:
   - Source: Agent wallet's USDC ATA
   - Destination: `payTo` address's USDC ATA
   - Amount: `maxAmountRequired` (already in smallest units)
   - Program: Token Program `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
3. Sign with agent keypair.
4. **Do NOT submit.** Serialize the signed transaction to base64.

## Step 4: Retry with Payment Header

Encode the payment payload:

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payload": {
    "serializedTransaction": "<BASE64_SIGNED_TX>"
  }
}
```

Base64-encode the entire JSON object. Send as the `X-Payment` header:

```
GET https://api.example.com/premium-data
X-Payment: <BASE64_ENCODED_PAYMENT_JSON>
```

The server verifies the payment (via facilitator or locally), submits the transaction on-chain, and returns the content:

```
HTTP/1.1 200 OK
X-Payment-Response: <settlement receipt>

{ "data": "premium content here" }
```

## Step 5: Log Payment

Append to `x402-payments.json`:
```json
{
  "type": "x402_payment",
  "endpoint": "https://api.example.com/premium-data",
  "amountRaw": "1000",
  "amountUsd": 0.001,
  "payTo": "RecipientWalletAddress...",
  "timestamp": "2026-02-23T12:00:00Z"
}
```

Update daily tracker `x402-daily.json`:
```json
{
  "date": "2026-02-23",
  "totalUsd": 0.045,
  "requestCount": 45,
  "endpoints": {
    "https://api.example.com/premium-data": { "count": 30, "totalUsd": 0.030 },
    "https://other-api.com/resource": { "count": 15, "totalUsd": 0.015 }
  }
}
```

Reset daily tracker at 00:00 UTC.

## Using the SDK (Recommended)

The `@x402/fetch` package wraps native `fetch` to handle the entire 402 flow automatically:

```javascript
import { x402Client } from "@x402/core";
import { registerExactSvmScheme } from "@x402/svm";
import { wrapFetchWithPayment } from "@x402/fetch";

// Setup (once at agent startup)
const client = new x402Client();
registerExactSvmScheme(client, {
  signer: agentKeypair,  // from SOLANA_PRIVATE_KEY
  rpcUrl: heliusRpcUrl
});

const payFetch = wrapFetchWithPayment(fetch, client);

// Usage (transparent payment)
const response = await payFetch("https://x402-enabled-api.com/data");
const data = await response.json();
```

The SDK:
- Detects 402 responses automatically
- Builds and signs the Solana transaction
- Retries with the X-Payment header
- Returns the final 200 response

## Registered x402 Endpoints

Maintain a list of known x402-enabled services in `x402-endpoints.json`:

```json
{
  "endpoints": [
    {
      "url": "https://example-api.com/premium",
      "description": "Premium data feed",
      "pricePerRequest": "$0.001",
      "addedAt": "2026-02-23T10:00:00Z"
    }
  ]
}
```

As the x402 ecosystem grows, add new endpoints here. The agent can discover x402-enabled APIs by checking for 402 responses with valid `x402Version` headers.

## Error Handling

- **402 with unsupported network:** Log and skip. Only Solana mainnet is supported.
- **402 with non-USDC token:** Log and skip. Only USDC payments are supported.
- **Payment exceeds per-request limit:** Log and refuse. Do not pay.
- **Daily limit exceeded:** Log and refuse until next day.
- **Insufficient USDC balance:** Log and skip. The jupiter-swap cron will produce more USDC.
- **Payment verification failed (server rejects):** Log the error. The transaction was not submitted, so no funds were lost.
- **Facilitator timeout:** Retry once after 5 seconds. If still failing, skip.
- **Stale blockhash (tx expired):** Build a new transaction with fresh blockhash and retry.
