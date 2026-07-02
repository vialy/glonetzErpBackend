import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const BCRYPT_ROUNDS = 12;

export async function hash(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function compare(plain, hashed) {
  if (!hashed) return false;
  return bcrypt.compare(plain, hashed);
}

/**
 * Strong, readable random password.
 * 8 chars from a pool excluding ambiguous characters — matches the length
 * users are required to enter when changing their password.
 */
export function generateRandomPassword(length = 8) {
  const pool = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += pool[bytes[i] % pool.length];
  }
  return out;
}

export function generateNumericOtp(length = 6) {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}
