import { Keypair, Connection, VersionedTransaction, TransactionMessage, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import crypto from 'crypto';

const SCRYPT_KEY_LEN = 32;
const IV_LEN = 16;
const SALT_LEN = 32;
const AUTH_TAG_LEN = 16;

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, SCRYPT_KEY_LEN, { N: 16384, r: 8, p: 1 });
}

export function encryptKeypair(keypairBytes, encryptionSecret) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(encryptionSecret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(keypairBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
}

export function decryptKeypair(encryptedB64, encryptionSecret) {
  const buf = Buffer.from(encryptedB64, 'base64');
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const key = deriveKey(encryptionSecret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function generateWallet(encryptionSecret) {
  const keypair = Keypair.generate();
  const encryptedKeypair = encryptKeypair(Buffer.from(keypair.secretKey), encryptionSecret);
  return { publicKey: keypair.publicKey.toBase58(), encryptedKeypair, createdAt: Date.now() };
}

export function importWallet(privateKeyStr, encryptionSecret) {
  let secretKey;
  try {
    const parsed = JSON.parse(privateKeyStr);
    secretKey = Uint8Array.from(parsed);
  } catch {
    const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const isBase58 = [...privateKeyStr].every(c => bs58Chars.includes(c));
    if (isBase58) {
      const keypair = Keypair.fromSecretKey(decodeBase58(privateKeyStr));
      secretKey = keypair.secretKey;
    } else {
      secretKey = Buffer.from(privateKeyStr, 'base64');
    }
  }
  const keypair = Keypair.fromSecretKey(secretKey);
  const encryptedKeypair = encryptKeypair(Buffer.from(keypair.secretKey), encryptionSecret);
  return { publicKey: keypair.publicKey.toBase58(), encryptedKeypair, createdAt: Date.now() };
}

function decodeBase58(str) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const ALPHABET_MAP = {};
  for (let i = 0; i < ALPHABET.length; i++) ALPHABET_MAP[ALPHABET[i]] = BigInt(i);
  let num = 0n;
  for (const c of str) num = num * 58n + ALPHABET_MAP[c];
  const hex = num.toString(16).padStart(128, '0');
  return Uint8Array.from(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}

export function loadKeypair(encryptedKeypair, encryptionSecret) {
  const secretKey = decryptKeypair(encryptedKeypair, encryptionSecret);
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export function getEncryptionKey(baseSecret, apiKey) {
  return `${baseSecret}:${apiKey}`;
}

export async function getSolBalance(connection, publicKeyStr) {
  const balance = await connection.getBalance(new PublicKey(publicKeyStr));
  return balance / LAMPORTS_PER_SOL;
}

export async function getTokenBalance(connection, ownerStr, mintStr) {
  try {
    const owner = new PublicKey(ownerStr);
    const mint = new PublicKey(mintStr);
    const ata = await getAssociatedTokenAddress(mint, owner);
    const account = await getAccount(connection, ata);
    return Number(account.amount);
  } catch {
    return 0;
  }
}

export async function signAndSend(connection, keypair, txBytes) {
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}
