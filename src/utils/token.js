import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Tokens carry a visual prefix so a server/log inspection can tell at a glance
 * whether a token belongs to staff or to a regular user.
 *
 *   STF.eyJhbGciOi...   (staff)
 *   USR.eyJhbGciOi...   (user)
 *
 * The two surfaces are signed with DIFFERENT secrets so a staff middleware
 * can never accept a user token (and vice-versa) even if the prefix were
 * stripped.
 */

export function signStaffToken(payload) {
  const token = jwt.sign(payload, config.jwt.staffSecret, {
    expiresIn: config.jwt.staffExpiresIn,
  });
  return `${config.jwt.prefixStaff}.${token}`;
}

export function signUserToken(payload) {
  const token = jwt.sign(payload, config.jwt.userSecret, {
    expiresIn: config.jwt.userExpiresIn,
  });
  return `${config.jwt.prefixUser}.${token}`;
}

export function parseAuthHeader(headerValue) {
  if (!headerValue) return null;
  const parts = headerValue.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

function splitPrefix(prefixed) {
  if (!prefixed) return { prefix: null, raw: null };
  const dot = prefixed.indexOf('.');
  if (dot <= 0) return { prefix: null, raw: prefixed };
  return { prefix: prefixed.slice(0, dot), raw: prefixed.slice(dot + 1) };
}

export function verifyStaffToken(prefixed) {
  const { prefix, raw } = splitPrefix(prefixed);
  if (prefix !== config.jwt.prefixStaff) {
    const err = new Error('invalid_token_prefix');
    err.code = 'invalid_token_prefix';
    throw err;
  }
  return jwt.verify(raw, config.jwt.staffSecret);
}

export function verifyUserToken(prefixed) {
  const { prefix, raw } = splitPrefix(prefixed);
  if (prefix !== config.jwt.prefixUser) {
    const err = new Error('invalid_token_prefix');
    err.code = 'invalid_token_prefix';
    throw err;
  }
  return jwt.verify(raw, config.jwt.userSecret);
}
