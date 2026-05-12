#!/usr/bin/env node

/**
 * Register a Solana wallet with Meterflow and receive a metered API key.
 *
 * Requires:
 *   SOLANA_PRIVATE_KEY (base58-encoded keypair)
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const API_BASE = process.env.METERFLOW_API_BASE || 'https://meterflow.fun/proxy';

async function register() {
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.error('Error: SOLANA_PRIVATE_KEY env var is required (base58-encoded).');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));
  const wallet = keypair.publicKey.toBase58();
  const challengeResponse = await fetch(`${API_BASE}/auth/challenge?wallet=${encodeURIComponent(wallet)}&action=agent-register`);
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok) {
    console.error(`Challenge failed (${challengeResponse.status}):`, challenge.message || challenge.error);
    process.exit(1);
  }
  const message = challenge.message;
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

  console.log('\nRegistration successful.');
  console.log(`  API Key:     ${data.apiKey}`);
  console.log(`  Tier:        ${data.tier}`);
  console.log(`  Daily Limit: ${data.dailyLimit?.toLocaleString?.() || data.dailyLimit}`);
  console.log(`  Models:      ${(data.models || []).join(', ')}`);
  console.log(`\n${JSON.stringify(data)}`);
}

register().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
