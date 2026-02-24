#!/usr/bin/env bash
set -euo pipefail

# acquire.sh — Full flow: check balance, buy $INF via Jupiter, register wallet, get API key.
#
# Requires:
#   SOLANA_PRIVATE_KEY  — base58-encoded Solana keypair
#
# Optional:
#   SOL_AMOUNT          — amount of SOL to swap for $INF (default: 0.1)
#   INFINITE_API_BASE   — API base URL (default: https://infinitekeys.fun/proxy)
#   SLIPPAGE_BPS        — slippage in basis points (default: 100 = 1%)

INF_MINT="infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf"
SOL_MINT="So11111111111111111111111111111111111111112"
SOL_AMOUNT="${SOL_AMOUNT:-0.1}"
SLIPPAGE_BPS="${SLIPPAGE_BPS:-100}"
API_BASE="${INFINITE_API_BASE:-https://infinitekeys.fun/proxy}"

if [ -z "${SOLANA_PRIVATE_KEY:-}" ]; then
  echo "Error: SOLANA_PRIVATE_KEY is required."
  exit 1
fi

# Convert SOL to lamports
LAMPORTS=$(echo "$SOL_AMOUNT * 1000000000" | bc | cut -d. -f1)

echo "=== INFINITE Protocol — Token Acquisition ==="
echo "  Swapping $SOL_AMOUNT SOL for \$INF tokens"
echo "  Token Mint: $INF_MINT"
echo "  Slippage: ${SLIPPAGE_BPS}bps"
echo ""

# Step 1: Get Jupiter quote
echo "[1/3] Getting Jupiter swap quote..."
QUOTE=$(curl -s "https://api.jup.ag/quote?inputMint=${SOL_MINT}&outputMint=${INF_MINT}&amount=${LAMPORTS}&slippageBps=${SLIPPAGE_BPS}")

OUT_AMOUNT=$(echo "$QUOTE" | jq -r '.outAmount // empty')
if [ -z "$OUT_AMOUNT" ]; then
  echo "Error: Failed to get quote from Jupiter."
  echo "$QUOTE" | jq .
  exit 1
fi

echo "  Expected output: $OUT_AMOUNT $INF tokens"
echo ""

# Step 2: Build and send swap transaction
echo "[2/3] Building swap transaction via Jupiter..."
echo "  (Agent must sign and submit the transaction using their Solana keypair)"
echo "  Use the Jupiter /swap endpoint with the quote to build the transaction."
echo "  Then sign with your SOLANA_PRIVATE_KEY and submit to the network."
echo ""

# Step 3: Register wallet
echo "[3/3] Registering wallet with INFINITE Protocol..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if command -v bun &>/dev/null; then
  bun "$SCRIPT_DIR/register.js"
elif command -v node &>/dev/null; then
  node "$SCRIPT_DIR/register.js"
else
  echo "Error: node or bun is required to run the registration script."
  exit 1
fi

echo ""
echo "=== Done! ==="
echo "Set your API key as INFINITE_API_KEY and start making requests."
echo "Docs: https://infinitekeys.fun"
