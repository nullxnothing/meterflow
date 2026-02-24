#!/usr/bin/env node

/**
 * Register a Solana wallet with INFINITE Protocol and receive an API key.
 *
 * Requires:
 *   - SOLANA_PRIVATE_KEY (base58-encoded keypair)
 *
 * Usage:
 *   SOLANA_PRIVATE_KEY=<key> node scripts/register.js
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const API_BASE = process.env.INFINITE_API_BASE || 'https://infinite-protocol.onrender.com';

async function register() {
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.error('Error: SOLANA_PRIVATE_KEY env var is required (base58-encoded).');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
  const wallet = keypair.publicKey.toBase58();
  const timestamp = Date.now();
  const message = `INFINITE Protocol Agent Registration\nWallet: ${wallet}\nTimestamp: ${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureB58 = bs58.encode(signature);

  console.log(`Registering wallet: ${wallet}`);

  const response = await fetch(`${API_BASE}/auth/agent-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature: signatureB58, message }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`Registration failed (${response.status}):`, data.message || data.error);
    process.exit(1);
  }

  console.log('\nRegistration successful!');
  console.log(`  API Key:     ${data.apiKey}`);
  console.log(`  Tier:        ${data.tier}`);
  console.log(`  Balance:     ${data.balance.toLocaleString()} $INF`);
  console.log(`  Daily Limit: ${data.dailyLimit.toLocaleString()}`);
  console.log(`  Models:      ${data.models.join(', ')}`);

  if (data.isTrial) {
    console.log('\n  You have trial access (3 calls/day).');
    console.log('  Buy $INF tokens for full access: mint infjrafE4zVaCMLxRTNg9anSZoyGWaKDQPHXmzYLPUf');
  }

  // Output JSON for programmatic consumption
  console.log(`\n${JSON.stringify(data)}`);
}

register().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
