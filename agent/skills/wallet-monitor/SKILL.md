# Wallet Monitor

Monitor the agent's Solana wallet for incoming creator reward SOL and track revenue.

## Environment Variables

- `HELIUS_API_KEY` — Helius RPC API key
- `SOLANA_PRIVATE_KEY` — Agent wallet private key (Base58). Derive the public key from this.
- `MIN_WALLET_RESERVE` — Minimum SOL to keep in wallet, never swap below this (default: 0.1)
- `SOL_SWAP_THRESHOLD` — Trigger swap when balance exceeds this (default: 0.5)

## RPC Endpoint

```
https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
```

## Step 1: Check SOL Balance

**Request:**
```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getBalance",
  "params": ["${WALLET_PUBLIC_KEY}"]
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 123456789 },
    "value": 1500000000
  }
}
```

The `value` is in lamports. Divide by 1,000,000,000 to get SOL.

**Example:** `1500000000 lamports = 1.5 SOL`

## Step 2: Check Recent Transactions

Fetch recent signatures to detect incoming creator rewards.

**Request:**
```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getSignaturesForAddress",
  "params": [
    "${WALLET_PUBLIC_KEY}",
    { "limit": 20 }
  ]
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "signature": "5VERv8NMhJk...",
      "slot": 123456789,
      "blockTime": 1700000000,
      "confirmationStatus": "finalized",
      "memo": null
    }
  ]
}
```

For each new signature (not previously logged), fetch the full transaction to determine if it's an incoming SOL transfer (creator reward):

```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getTransaction",
  "params": [
    "${SIGNATURE}",
    { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 0 }
  ]
}
```

Look for SOL transfers where the destination is our wallet. The `postBalances` minus `preBalances` for our wallet's account index shows the net SOL change.

## Step 3: Revenue Tracking

Maintain a JSON log of revenue. Structure:

```json
{
  "totalRevenueSol": 4.25,
  "transactions": [
    {
      "signature": "5VERv8NMhJk...",
      "amountSol": 0.15,
      "timestamp": "2025-01-15T10:30:00Z",
      "source": "creator_reward"
    }
  ],
  "lastChecked": "2025-01-15T12:00:00Z"
}
```

Store this in the workspace directory as `revenue-log.json`.

## Step 4: Threshold Check

After checking balance:

1. If `balance > SOL_SWAP_THRESHOLD`:
   - Calculate swap amount: `balance - MIN_WALLET_RESERVE`
   - Report: "Balance is {balance} SOL. {swapAmount} SOL available for swap to USDC."
   - Trigger the jupiter-swap skill with the swap amount.

2. If `balance <= SOL_SWAP_THRESHOLD`:
   - Report: "Balance is {balance} SOL. Below swap threshold ({SOL_SWAP_THRESHOLD}). No action needed."

## Error Handling

- **RPC timeout:** Retry up to 3 times with 5-second delay between retries.
- **RPC rate limit (429):** Wait 30 seconds and retry once.
- **Invalid response:** Log the error and skip this check cycle. Do not take any swap action on error.
- **Balance is 0:** This is valid (new wallet). Log and continue.
