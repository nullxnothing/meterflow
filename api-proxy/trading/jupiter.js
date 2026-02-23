import { VersionedTransaction } from '@solana/web3.js';
import { CONFIG } from '../config.js';

const JUPITER_API = 'https://lite-api.jup.ag/swap/v1';
const JUPITER_PRICE_API = 'https://api.jup.ag/price/v3';

function jupiterHeaders() {
  const h = {};
  if (CONFIG.JUPITER_API_KEY) h['x-api-key'] = CONFIG.JUPITER_API_KEY;
  return h;
}

export async function getQuote({ inputMint, outputMint, amount, slippageBps = 300, onlyDirectRoutes = false }) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: String(slippageBps),
  });
  if (onlyDirectRoutes) params.set('onlyDirectRoutes', 'true');

  const res = await fetch(`${JUPITER_API}/quote?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jupiter quote failed: ${err}`);
  }
  return res.json();
}

export async function executeSwap(connection, keypair, quoteResponse, { priorityFeeLamports = 50000 } = {}) {
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: priorityFeeLamports,
      dynamicComputeUnitLimit: true,
    }),
  });

  if (!swapRes.ok) {
    const err = await swapRes.text();
    throw new Error(`Jupiter swap failed: ${err}`);
  }

  const { swapTransaction } = await swapRes.json();
  const txBytes = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(signature, 'confirmed');
  return { signature, inputAmount: quoteResponse.inAmount, outputAmount: quoteResponse.outAmount };
}

export async function getPrice(mintAddress) {
  const res = await fetch(`${JUPITER_PRICE_API}?ids=${mintAddress}`, { headers: jupiterHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const entry = data[mintAddress] || data.data?.[mintAddress];
  return entry ? parseFloat(entry.usdPrice ?? entry.price ?? 0) || null : null;
}

export async function getPrices(mintAddresses) {
  if (!mintAddresses.length) return {};
  const res = await fetch(`${JUPITER_PRICE_API}?ids=${mintAddresses.join(',')}`, { headers: jupiterHeaders() });
  if (!res.ok) return {};
  const data = await res.json();
  const result = {};
  for (const mint of mintAddresses) {
    const entry = data[mint] || data.data?.[mint];
    result[mint] = entry ? parseFloat(entry.usdPrice ?? entry.price ?? 0) || null : null;
  }
  return result;
}

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
