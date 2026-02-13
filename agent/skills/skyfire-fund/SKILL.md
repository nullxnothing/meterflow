# Skyfire Fund

Deposit USDC into the Skyfire wallet for autonomous API credit purchasing.

## Overview

Skyfire is the payment layer that lets the agent autonomously buy LLM API credits. The agent deposits USDC into its Skyfire wallet, then Skyfire handles payments to API providers (Anthropic, Google, etc.) on the agent's behalf.

## Environment Variables

- `SKYFIRE_API_KEY` — Buyer agent API key from app.skyfire.xyz
- `MAX_DAILY_SKYFIRE_DEPOSIT` — Maximum USDC to deposit per day (default: 50)

## Available MCP Tools

The Skyfire MCP server (configured in openclaw.json) provides these tools:

### `get-wallet-balance`

Check the current Skyfire wallet USDC balance.

**Usage:** Call this tool with no parameters.

**Expected response:**
```json
{
  "balance": "12.50",
  "currency": "USDC"
}
```

### `find-sellers`

Discover available API providers in the Skyfire marketplace.

**Usage:** Call with a query to find specific providers.

**Expected response:**
```json
{
  "sellers": [
    {
      "name": "Anthropic Claude API",
      "pricePerUnit": "0.003",
      "unit": "1K input tokens"
    }
  ]
}
```

### `create-kya-payment-token`

Create a payment token for purchasing a service from a seller.

**Usage:** Call with the seller ID and amount.

## Deposit Flow

### Step 1: Check Skyfire Balance

Use the `get-wallet-balance` MCP tool to check current balance.

**Decision logic:**
- If balance >= $10: No deposit needed. Report: "Skyfire balance is ${balance}. Above threshold. No deposit."
- If balance < $10: Proceed to deposit.
- If balance < $2: Flag as CRITICAL in logs.

### Step 2: Check USDC Balance in Agent Wallet

Before depositing, verify the agent has USDC available. Query the USDC token account:

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

Extract USDC balance from `result.value[0].account.data.parsed.info.tokenAmount.uiAmount`.

### Step 3: Calculate Deposit Amount

- Target deposit: enough to bring Skyfire balance to $20
- Deposit amount: `min(20 - skyfireBalance, availableUsdc, MAX_DAILY_SKYFIRE_DEPOSIT)`
- If calculated amount < $1, skip deposit (not worth the tx fee)

### Step 4: Execute Deposit

Use the Skyfire MCP tools to initiate the deposit. The exact mechanism depends on the Skyfire SDK flow — the MCP server handles the deposit transaction construction.

Log the deposit:
```json
{
  "type": "skyfire_deposit",
  "amountUsdc": 15.0,
  "skyfireBalanceBefore": 5.0,
  "skyfireBalanceAfter": 20.0,
  "timestamp": "2025-01-15T12:10:00Z"
}
```

Append to `skyfire-log.json` in the workspace directory.

### Step 5: Track Daily Deposits

Maintain a daily deposit counter. Reset at 00:00 UTC.

```json
{
  "date": "2025-01-15",
  "totalDeposited": 15.0,
  "deposits": [
    { "amount": 15.0, "timestamp": "2025-01-15T12:10:00Z" }
  ]
}
```

If `totalDeposited >= MAX_DAILY_SKYFIRE_DEPOSIT`, refuse further deposits until the next day.

## Error Handling

- **Skyfire MCP unavailable:** Log error. Do not retry more than once. The USDC stays safe in the agent wallet.
- **Insufficient USDC:** Log "No USDC available for Skyfire deposit." The check-revenue cron will handle swapping more SOL.
- **Deposit transaction fails:** Log the error. Do not count the failed amount against the daily limit.
- **Daily limit reached:** Report: "Daily Skyfire deposit limit reached (${MAX_DAILY_SKYFIRE_DEPOSIT}). Resuming tomorrow."
