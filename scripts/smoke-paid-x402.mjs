import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { toClientSvmSigner, USDC_MAINNET_ADDRESS } from '@x402/svm';

const DEFAULT_BASE_URL = 'https://www.meterflow.fun';
const DEFAULT_ROUTE = '/proxy/mcp/token-risk';
const DEFAULT_TOKEN = 'So11111111111111111111111111111111111111112';
const MIN_SOL_FOR_ACCOUNT_CHECK = 0;

function loadLocalEnv() {
  for (const file of ['.env.paid-test.local', '.env.local', '.env.production.local']) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function decodeSecretKey(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (raw.startsWith('[')) return Uint8Array.from(JSON.parse(raw));
  return bs58.decode(raw);
}

function loadPayerSecretKey() {
  const envKey = process.env.METERFLOW_PAYER_PRIVATE_KEY
    || process.env.X402_PAYER_PRIVATE_KEY
    || process.env.SVM_PRIVATE_KEY;
  if (envKey) return decodeSecretKey(envKey);

  const cliKeypair = process.env.SOLANA_KEYPAIR_PATH
    || resolve(homedir(), '.config', 'solana', 'id.json');
  if (existsSync(cliKeypair)) {
    return Uint8Array.from(JSON.parse(readFileSync(cliKeypair, 'utf8')));
  }
  return null;
}

function getHeader(headers, name) {
  return headers.get(name) || headers.get(name.toLowerCase()) || headers.get(name.toUpperCase());
}

async function getPayerBalances(connection, payerAddress, mintAddress) {
  const owner = new PublicKey(payerAddress);
  const mint = new PublicKey(mintAddress);
  const [solLamports, tokenAccounts] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, { mint }),
  ]);
  const usdc = tokenAccounts.value.reduce((sum, row) => {
    return sum + Number(row.account.data.parsed.info.tokenAmount.uiAmount || 0);
  }, 0);
  return { sol: solLamports / 1_000_000_000, usdc };
}

function assertEnoughFunds(payer, { sol, usdc }, amountAtomic, mintDecimals = 6) {
  const requiredUsdc = Number(amountAtomic) / (10 ** mintDecimals);
  if (usdc < requiredUsdc) {
    throw new Error(
      `Payer ${payer} has ${usdc} USDC, but the route requires ${requiredUsdc} USDC. ` +
      'Fund the payer wallet and rerun `npm run smoke:paid`.',
    );
  }
  if (sol < MIN_SOL_FOR_ACCOUNT_CHECK) {
    throw new Error(`Payer ${payer} has no SOL. Add a small SOL fee buffer and rerun \`npm run smoke:paid\`.`);
  }
}

async function main() {
  loadLocalEnv();

  const baseUrl = (process.env.METERFLOW_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const route = process.env.METERFLOW_PAID_ROUTE || DEFAULT_ROUTE;
  const token = process.env.METERFLOW_PAID_TOKEN || DEFAULT_TOKEN;
  const rpcUrl = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const payerSecretKey = loadPayerSecretKey();

  if (!payerSecretKey) {
    throw new Error(
      'No payer keypair found. Set METERFLOW_PAYER_PRIVATE_KEY to a base58 or JSON-array Solana secret key, ' +
      'or set SOLANA_KEYPAIR_PATH to a funded keypair file.',
    );
  }

  const signer = await createKeyPairSignerFromBytes(payerSecretKey);
  const payer = String(signer.address);
  const connection = new Connection(rpcUrl, 'confirmed');
  const client = new x402Client();
  registerExactSvmScheme(client, { signer: toClientSvmSigner(signer) });
  const httpClient = new x402HTTPClient(client);

  const requestBody = JSON.stringify({ address: token });
  const unpaid = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
  });

  if (unpaid.status !== 402) {
    throw new Error(`Expected unpaid request to return 402, got ${unpaid.status}`);
  }

  const unpaidBodyText = await unpaid.text();
  let unpaidBody = {};
  try { unpaidBody = unpaidBodyText ? JSON.parse(unpaidBodyText) : {}; } catch {}

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => getHeader(unpaid.headers, name),
    unpaidBody,
  );
  const selected = paymentRequired.accepts?.[0];
  if (!selected) throw new Error('Payment requirement did not include any accepted payment option.');
  if (selected.asset !== USDC_MAINNET_ADDRESS) {
    throw new Error(`Expected mainnet USDC asset ${USDC_MAINNET_ADDRESS}, got ${selected.asset}`);
  }

  const balances = await getPayerBalances(connection, payer, selected.asset);
  assertEnoughFunds(payer, balances, selected.amount);

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paid = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Wallet': payer,
      ...paymentHeaders,
    },
    body: requestBody,
  });

  const paidText = await paid.text();
  let paidBody = {};
  try { paidBody = paidText ? JSON.parse(paidText) : {}; } catch {}

  if (!paid.ok) {
    throw new Error(`Paid request failed ${paid.status}: ${JSON.stringify(paidBody || paidText)}`);
  }

  const settlement = httpClient.getPaymentSettleResponse((name) => getHeader(paid.headers, name));
  const txSignature = settlement?.transaction || getHeader(paid.headers, 'X-Payment-Transaction');
  if (!txSignature) throw new Error('Paid request succeeded but no settlement transaction signature was returned.');

  console.log(JSON.stringify({
    ok: true,
    payer,
    route,
    amountAtomic: selected.amount,
    asset: selected.asset,
    payTo: selected.payTo,
    txSignature,
    receiptHint: paidBody.receiptHint || null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
