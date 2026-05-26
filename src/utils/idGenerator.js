import { customAlphabet } from 'nanoid';
import { ID_PREFIXES } from '../config/index.js';

// Avoids visually ambiguous chars (0/O, 1/I/L)
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const nano = customAlphabet(ALPHABET, 8);

/**
 * Generate a user-friendly id for a given record type.
 *   generateFriendlyId('user')    -> 'USR-XK9Q42AB'
 *   generateFriendlyId('payment') -> 'PAY-Q9TR23ZN'
 */
export function generateFriendlyId(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) {
    throw new Error(`Unknown id kind: ${kind}`);
  }
  return `${prefix}-${nano()}`;
}
