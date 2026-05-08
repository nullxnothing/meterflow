#!/usr/bin/env bash
set -euo pipefail

# acquire.sh — register a Solana wallet with Meterflow and receive a metered API key.
#
# Requires:
#   SOLANA_PRIVATE_KEY — base58-encoded Solana keypair
#
# Optional:
#   METERFLOW_API_BASE — API base URL (default: https://meterflow.fun/proxy)

if [ -z "${SOLANA_PRIVATE_KEY:-}" ]; then
  echo "Error: SOLANA_PRIVATE_KEY is required."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Meterflow API Key Registration ==="

if command -v bun &>/dev/null; then
  bun "$SCRIPT_DIR/register.js"
elif command -v node &>/dev/null; then
  node "$SCRIPT_DIR/register.js"
else
  echo "Error: node or bun is required to run the registration script."
  exit 1
fi

echo ""
echo "Docs: https://meterflow.fun/docs"
