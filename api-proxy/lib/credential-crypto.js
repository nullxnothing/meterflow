// AES-256-GCM encryption for agent connection credentials
// Reuses the same cryptographic approach as trading/wallet.js
import crypto from 'crypto';
import { CONFIG } from '../config.js';

const SCRYPT_KEY_LEN = 32;
const IV_LEN = 16;
const SALT_LEN = 32;
const AUTH_TAG_LEN = 16;

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, SCRYPT_KEY_LEN, { N: 16384, r: 8, p: 1 });
}

function getEncryptionSecret(agentId) {
  return `${CONFIG.WALLET_ENCRYPTION_SECRET}:agent:${agentId}`;
}

export function encryptValue(plaintext, agentId) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  const secret = getEncryptionSecret(agentId);
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
}

export function decryptValue(ciphertext, agentId) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (!ciphertext.startsWith('enc:')) return ciphertext; // plaintext fallback for older saved credentials
  const secret = getEncryptionSecret(agentId);
  const buf = Buffer.from(ciphertext.slice(4), 'base64');
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const SENSITIVE_FIELDS = new Set([
  'apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret',
  'botToken', 'privateKey', 'bearerToken',
]);

export function encryptConnections(connections, agentId) {
  if (!connections || typeof connections !== 'object') return connections;
  const encrypted = {};
  for (const [platform, config] of Object.entries(connections)) {
    if (!config || typeof config !== 'object') { encrypted[platform] = config; continue; }
    encrypted[platform] = {};
    for (const [field, value] of Object.entries(config)) {
      encrypted[platform][field] = SENSITIVE_FIELDS.has(field)
        ? encryptValue(value, agentId)
        : value;
    }
  }
  return encrypted;
}

export function decryptConnections(connections, agentId) {
  if (!connections || typeof connections !== 'object') return connections;
  const decrypted = {};
  for (const [platform, config] of Object.entries(connections)) {
    if (!config || typeof config !== 'object') { decrypted[platform] = config; continue; }
    decrypted[platform] = {};
    for (const [field, value] of Object.entries(config)) {
      decrypted[platform][field] = SENSITIVE_FIELDS.has(field)
        ? decryptValue(value, agentId)
        : value;
    }
  }
  return decrypted;
}
