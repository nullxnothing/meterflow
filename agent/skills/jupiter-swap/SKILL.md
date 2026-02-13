# Jupiter Swap

Swap SOL to USDC using the Jupiter V6 aggregator API.

## Constants

- SOL Mint: `So11111111111111111111111111111111111111112`
- USDC Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## Environment Variables

- `SOLANA_PRIVATE_KEY` — Agent wallet keypair (Base58)
- `HELIUS_API_KEY` — For submitting transactions via Helius RPC
- `MAX_SOL_PER_SWAP` — Maximum SOL per swap transaction (default: 5)

## Safety Limits

- **Max per swap:** 5 SOL (configurable via `MAX_SOL_PER_SWAP`)
- **Max slippage:** 50 bps (0.5%)
- **Never swap below reserve:** Always keep `MIN_WALLET_RESERVE` SOL in wallet
- If requested swap amount exceeds `MAX_SOL_PER_SWAP`, split into multiple swaps

## Step 1: Get Quote

Convert the SOL amount to lamports (multiply by 1,000,000,000).

**Request:**
```
GET https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${LAMPORTS}&slippageBps=50
```

**Example:** To swap 1.5 SOL → `amount=1500000000`

**Response:**
```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "inAmount": "1500000000",
  "outAmount": "225000000",
  "otherAmountThreshold": "223875000",
  "swapMode": "ExactIn",
  "slippageBps": 50,
  "routePlan": [...]
}
```

The `outAmount` is in USDC smallest units (6 decimals). `225000000 = 225.0 USDC`.

**Validation before proceeding:**
- Confirm `outAmount > 0`
- Confirm the route was found (response is not an error)
- Log: "Quote: {solAmount} SOL → {usdcAmount} USDC via {routePlan.length} hops"

## Step 2: Build Swap Transaction

**Request:**
```json
POST https://quote-api.jup.ag/v6/swap
Content-Type: application/json

{
  "quoteResponse": <entire quote response from Step 1>,
  "userPublicKey": "${WALLET_PUBLIC_KEY}",
  "wrapAndUnwrapSol": true,
  "dynamicComputeUnitLimit": true,
  "prioritizationFeeLamports": "auto"
}
```

**Response:**
```json
{
  "swapTransaction": "<base64 encoded transaction>",
  "lastValidBlockHeight": 123456789
}
```

## Step 3: Sign and Submit Transaction

1. Decode the base64 `swapTransaction` into a `VersionedTransaction`
2. Sign with the agent's keypair derived from `SOLANA_PRIVATE_KEY`
3. Serialize and submit via Helius RPC:

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

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": "5VERv8NMhJk..."
}
```

The `result` is the transaction signature.

## Step 4: Confirm Transaction

Poll for confirmation:

```json
POST https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getSignatureStatuses",
  "params": [["${TX_SIGNATURE}"], { "searchTransactionHistory": false }]
}
```

Wait until `confirmationStatus` is `"confirmed"` or `"finalized"`. Poll every 2 seconds, timeout after 60 seconds.

## Step 5: Log Result

After confirmation, log the swap:

```json
{
  "type": "sol_to_usdc_swap",
  "inputSol": 1.5,
  "outputUsdc": 225.0,
  "signature": "5VERv8NMhJk...",
  "timestamp": "2025-01-15T12:05:00Z",
  "route": "SOL → USDC (2 hops)"
}
```

Append to `swap-log.json` in the workspace directory.

## Error Handling

- **Quote returns no route:** The pair is illiquid or Jupiter is down. Wait 5 minutes and retry once. If still failing, skip this cycle.
- **Transaction simulation fails:** Log the simulation error. Do NOT retry immediately — the slippage or liquidity may have changed. Wait for next cycle.
- **Transaction dropped / not confirmed after 60s:** Log as "unconfirmed". Check balance on next cycle — the swap may have landed.
- **Slippage exceeded:** Jupiter handles this at the protocol level (transaction reverts). No manual action needed. Log and retry with fresh quote.
- **Amount exceeds MAX_SOL_PER_SWAP:** Split into chunks of MAX_SOL_PER_SWAP. Execute sequentially with 10-second gaps.
