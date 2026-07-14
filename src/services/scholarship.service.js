import { SCHOLARSHIP_TYPES } from '../config/index.js';
import { Scholarship } from '../models/index.js';

export function computeDiscount(catalogFee, scholarship) {
  if (!scholarship || !scholarship.isActive) return 0;
  return computeHistoricalDiscount(catalogFee, scholarship);
}

/** Remise pour affichage historique (bourses revoquees incluses). */
export function computeHistoricalDiscount(catalogFee, scholarship) {
  if (!scholarship) return 0;
  const fee = Number(catalogFee) || 0;
  if (fee <= 0) return 0;

  if (scholarship.type === SCHOLARSHIP_TYPES.FULL) return fee;

  if (scholarship.type === SCHOLARSHIP_TYPES.FIXED) {
    return Math.min(Math.max(Number(scholarship.value) || 0, 0), fee);
  }

  if (scholarship.type === SCHOLARSHIP_TYPES.PERCENTAGE) {
    const pct = Math.min(100, Math.max(Number(scholarship.value) || 0, 0));
    return Math.round((fee * pct) / 100);
  }

  return 0;
}

export function computeExpected(catalogFee, scholarship) {
  const fee = Number(catalogFee) || 0;
  return Math.max(fee - computeDiscount(fee, scholarship), 0);
}

export function toPublicScholarship(scholarship, catalogFee) {
  if (!scholarship || !scholarship.isActive) return null;
  const discount = computeDiscount(catalogFee, scholarship);
  return {
    scholarshipId: scholarship.scholarshipId,
    type: scholarship.type,
    value: scholarship.value,
    discount,
    isFull: scholarship.type === SCHOLARSHIP_TYPES.FULL || discount >= catalogFee,
    reason: scholarship.reason || undefined,
    grantedAt: scholarship.grantedAt,
  };
}

export async function getActiveForUserClass(userObjectId, classObjectId) {
  return Scholarship.findActiveForUserClass(userObjectId, classObjectId);
}

export async function getActiveMapForClass(classObjectId, userObjectIds) {
  return Scholarship.activeMapForClass(classObjectId, userObjectIds);
}

export default {
  computeDiscount,
  computeHistoricalDiscount,
  computeExpected,
  toPublicScholarship,
  getActiveForUserClass,
  getActiveMapForClass,
};
