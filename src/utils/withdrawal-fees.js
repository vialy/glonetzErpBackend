/**
 * Grille des charges de retrait Mobile Money — Cameroun / XAF.
 * Miroir de `lib/withdrawal-fees.ts` côté frontend.
 */
const WITHDRAWAL_FEE_GRID = [
  { min: 1, max: 4999, kind: 'percent', rate: 0.015, minFee: 54 },
  { min: 5000, max: 333332, kind: 'percent', rate: 0.01 },
  { min: 333333, max: 500000, kind: 'flat', flat: 4004 },
  { min: 500001, max: Number.POSITIVE_INFINITY, kind: 'percent', rate: 0.01 },
];

/**
 * @param {number} amount Montant net (XAF)
 * @returns {number} Charge estimée arrondie
 */
export function computeWithdrawalFee(amount, grid = WITHDRAWAL_FEE_GRID) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const bracket = grid.find((b) => amount >= b.min && amount <= b.max);
  if (!bracket) return 0;
  if (bracket.kind === 'flat') return bracket.flat;
  const fee = Math.round(amount * bracket.rate);
  return bracket.minFee ? Math.max(fee, bracket.minFee) : fee;
}

export default { computeWithdrawalFee, WITHDRAWAL_FEE_GRID };
