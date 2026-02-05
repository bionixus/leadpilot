import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(): Buffer {
  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) throw new Error('ENCRYPTION_KEY is not set');
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64 decoded)');
  return key;
}

/**
 * Encrypt a string. Returns base64(iv + authTag + ciphertext).
 * Server-only; never expose to client.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('base64');
}

/**
 * Decrypt a string produced by encrypt().
 * Server-only; never expose to client or log decrypted values.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < IV_LEN + AUTH_TAG_LEN) throw new Error('Invalid ciphertext');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(enc) + decipher.final('utf8');
}
