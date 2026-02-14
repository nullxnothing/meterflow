import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';

const PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';
const TOKEN_DECIMALS = 6;
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const BONDING_CURVE_DISCRIMINATOR = Buffer.from([0x17, 0xb7, 0xf8, 0x37, 0x60, 0xff, 0x69, 0x4d]);

export async function executePumpTrade(connection, keypair, { mint, action, amount, denominatedInSol = true, slippage = 10, priorityFee = 0.005, pool = 'auto' }) {
  const res = await fetch(PUMPPORTAL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: keypair.publicKey.toBase58(),
      action,
      mint,
      amount,
      denominatedInSol: String(denominatedInSol),
      slippage,
      priorityFee,
      pool,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PumpPortal ${action} failed: ${err}`);
  }

  const txBytes = new Uint8Array(await res.arrayBuffer());
  const { VersionedTransaction } = await import('@solana/web3.js');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(signature, 'confirmed');
  return { signature, action, mint, amount };
}

export async function getBondingCurveState(connection, mintStr) {
  const mint = new PublicKey(mintStr);
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );

  const accountInfo = await connection.getAccountInfo(bondingCurvePda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  if (data.length < 8 + 8 * 5 + 1) return null;

  let offset = 8; // skip discriminator
  const virtualTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
  offset += 8;
  const virtualSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
  offset += 8;
  const realTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
  offset += 8;
  const realSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
  offset += 8;
  const tokenTotalSupply = new BN(data.subarray(offset, offset + 8), 'le');
  offset += 8;
  const complete = data[offset] === 1;

  return { virtualTokenReserves, virtualSolReserves, realTokenReserves, realSolReserves, tokenTotalSupply, complete, bondingCurvePda: bondingCurvePda.toBase58() };
}

export function calculatePrice(state) {
  if (!state || state.virtualTokenReserves.isZero()) return 0;
  const solReserves = state.virtualSolReserves.toNumber() / LAMPORTS_PER_SOL;
  const tokenReserves = state.virtualTokenReserves.toNumber() / (10 ** TOKEN_DECIMALS);
  return solReserves / tokenReserves;
}

export function calculateBuyQuote(state, solAmount, feeBps = 100) {
  if (!state) return null;
  const solLamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
  const fee = solLamports.mul(new BN(feeBps)).div(new BN(10000));
  const netSol = solLamports.sub(fee);

  // constant product: tokensOut = (virtualTokenReserves * netSol) / (virtualSolReserves + netSol)
  const tokensOut = state.virtualTokenReserves.mul(netSol).div(state.virtualSolReserves.add(netSol));
  const tokensOutNum = tokensOut.toNumber() / (10 ** TOKEN_DECIMALS);
  const pricePerToken = solAmount / tokensOutNum;

  const oldPrice = calculatePrice(state);
  const priceImpact = oldPrice > 0 ? ((pricePerToken - oldPrice) / oldPrice) * 100 : 0;

  return { tokensOut: tokensOutNum, solCost: solAmount, fee: fee.toNumber() / LAMPORTS_PER_SOL, pricePerToken, priceImpact };
}

export function calculateSellQuote(state, tokenAmount, feeBps = 100) {
  if (!state) return null;
  const tokenLamports = new BN(Math.floor(tokenAmount * (10 ** TOKEN_DECIMALS)));

  // constant product: solOut = (virtualSolReserves * tokenLamports) / (virtualTokenReserves + tokenLamports)
  const solOut = state.virtualSolReserves.mul(tokenLamports).div(state.virtualTokenReserves.add(tokenLamports));
  const fee = solOut.mul(new BN(feeBps)).div(new BN(10000));
  const netSol = solOut.sub(fee);
  const netSolNum = netSol.toNumber() / LAMPORTS_PER_SOL;

  const oldPrice = calculatePrice(state);
  const newTokenReserves = state.virtualTokenReserves.add(tokenLamports).toNumber() / (10 ** TOKEN_DECIMALS);
  const newSolReserves = state.virtualSolReserves.sub(solOut).toNumber() / LAMPORTS_PER_SOL;
  const newPrice = newSolReserves / newTokenReserves;
  const priceImpact = oldPrice > 0 ? ((oldPrice - newPrice) / oldPrice) * 100 : 0;

  return { solOut: netSolNum, fee: fee.toNumber() / LAMPORTS_PER_SOL, priceImpact, tokenAmount };
}

export function getBondingProgress(state) {
  if (!state) return 0;
  const totalSupply = 1_000_000_000 * (10 ** TOKEN_DECIMALS);
  const bondingSupply = 800_000_000 * (10 ** TOKEN_DECIMALS);
  const sold = bondingSupply - state.realTokenReserves.toNumber();
  return Math.min(1, Math.max(0, sold / bondingSupply));
}

export async function getTokenPriceInfo(connection, mintStr, solPriceUsd = 0) {
  const state = await getBondingCurveState(connection, mintStr);
  if (!state) return null;

  const priceInSol = calculatePrice(state);
  const priceInUsd = priceInSol * solPriceUsd;
  const bondingProgress = getBondingProgress(state);
  const liquiditySol = state.realSolReserves.toNumber() / LAMPORTS_PER_SOL;

  return {
    priceInSol, priceInUsd,
    marketCapSol: priceInSol * 1_000_000_000,
    marketCapUsd: priceInUsd * 1_000_000_000,
    bondingProgress,
    graduated: state.complete,
    liquiditySol,
    tokensRemaining: state.realTokenReserves.toNumber() / (10 ** TOKEN_DECIMALS),
  };
}
