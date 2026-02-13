# Pump Deployer

Deploy new tokens on pump.fun programmatically.

## Environment Variables

- `SOLANA_PRIVATE_KEY` — Agent wallet keypair (Base58)
- `HELIUS_API_KEY` — For transaction submission
- `DEPLOY_COOLDOWN_MINUTES` — Minimum minutes between deploys (default: 30)

## Cost Breakdown

- Token deployment: ~0.02 SOL
- Initial dev buy: ~0.05 SOL
- Transaction fees: ~0.01 SOL
- **Total per launch: ~0.08 SOL**

Ensure wallet balance is at least 0.15 SOL before attempting (0.08 launch + 0.07 buffer).

## Pre-Deploy Checklist

Before every deploy, verify ALL conditions:

1. **Cooldown:** At least `DEPLOY_COOLDOWN_MINUTES` since last deploy. Check `deploy-log.json` for last deploy timestamp.
2. **Balance:** Wallet has >= 0.15 SOL.
3. **Concept ready:** A structured token concept exists with name, ticker, description, and narrative.
4. **Time window:** Not between 02:00-06:00 UTC (low-activity dead zone).

If any condition fails, log the reason and skip.

## Step 1: Prepare Token Metadata

Generate a token concept from the trend-scanner queue. Required fields:

```json
{
  "name": "Neural Net",
  "ticker": "NEURAL",
  "description": "The AI revolution isn't coming — it's here. NEURAL is the token for the neural network era.",
  "image": null
}
```

**Naming rules:**
- Name: 2-20 characters, catchy and memeable
- Ticker: 2-6 characters, uppercase, easy to type
- Description: 1-2 sentences, captures the narrative with urgency

## Step 2: Upload Metadata to IPFS

Upload the token image and metadata via pump.fun's IPFS endpoint.

**Request:**
```
POST https://pump.fun/api/ipfs
Content-Type: multipart/form-data

Fields:
  name: "Neural Net"
  symbol: "NEURAL"
  description: "The AI revolution isn't coming..."
  twitter: ""
  telegram: ""
  website: ""
  showName: "true"
  file: <image binary if available, otherwise omit>
```

**Response:**
```json
{
  "metadataUri": "https://cf-ipfs.com/ipfs/Qm..."
}
```

If no image is available, skip the file field — pump.fun will use a default.

## Step 3: Generate Mint Keypair

Create a new random Solana keypair for the token mint. This is a fresh keypair generated per deploy — it becomes the token's contract address (CA).

## Step 4: Build and Send Deploy Transaction

**Request:**
```json
POST https://pumpportal.fun/api/trade-local
Content-Type: application/json

{
  "publicKey": "${WALLET_PUBLIC_KEY}",
  "action": "create",
  "tokenMetadata": {
    "name": "Neural Net",
    "symbol": "NEURAL",
    "uri": "${METADATA_URI_FROM_STEP_2}"
  },
  "mint": "${MINT_KEYPAIR_PUBLIC_KEY}",
  "denominatedInSol": "true",
  "amount": 0.05,
  "slippage": 10,
  "priorityFee": 0.0005,
  "pool": "pump"
}
```

**Response:** Raw transaction bytes.

Sign the transaction with BOTH the mint keypair AND the agent wallet keypair, then submit via Helius RPC:

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

## Step 5: Confirm and Log

Wait for transaction confirmation (poll `getSignatureStatuses` every 2 seconds, timeout 60 seconds).

On success, log the deployment:

```json
{
  "type": "token_deploy",
  "name": "Neural Net",
  "ticker": "NEURAL",
  "contractAddress": "${MINT_PUBLIC_KEY}",
  "pumpUrl": "https://pump.fun/${MINT_PUBLIC_KEY}",
  "deployTx": "${TX_SIGNATURE}",
  "devBuySol": 0.05,
  "totalCostSol": 0.08,
  "timestamp": "2025-01-15T14:00:00Z",
  "narrative": "AI / neural networks"
}
```

Append to `deploy-log.json` in the workspace directory.

## Post-Deploy

After a successful deploy:
1. Log the contract address prominently
2. Update the cooldown timer
3. Remove the used concept from the trend-scanner queue
4. On the next wallet-monitor cycle, start watching for creator rewards from this token

## Error Handling

- **IPFS upload fails:** Retry once after 10 seconds. If still failing, skip this deploy cycle.
- **Transaction simulation fails:** Log the error details. Common cause: insufficient SOL. Do not retry — wait for next cycle.
- **Transaction not confirmed after 60s:** Log as "pending". Check next cycle. Do NOT attempt a duplicate deploy.
- **pump.fun API down (5xx):** Log and skip. Do not retry aggressively — pump.fun may be under load.
- **Cooldown not met:** Log "Cooldown active. {minutes} minutes remaining." and skip.
