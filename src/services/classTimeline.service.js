import { PAYMENT_STATUSES, SCHOLARSHIP_TYPES } from '../config/index.js';
import { ClassEnrollment, Scholarship, Payment } from '../models/index.js';
import scholarshipService from './scholarship.service.js';

function parseMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toIsoDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function toIsoDateTime(value) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function scholarshipOverlapsEnrollment(scholarship, joinedAt, leftAt) {
  const joinMs = parseMs(joinedAt);
  if (joinMs === null) return false;
  const endMs = parseMs(leftAt) ?? Date.now();
  const grantMs = parseMs(scholarship.grantedAt);
  if (grantMs !== null && grantMs > endMs) return false;
  const revokeMs = parseMs(scholarship.revokedAt);
  if (revokeMs !== null && revokeMs < joinMs) return false;
  return true;
}

function scholarshipForEnrollment(classFriendlyId, joinedAt, leftAt, scholarships) {
  const candidates = scholarships
    .filter((s) => s.classFriendlyId === classFriendlyId)
    .filter((s) => scholarshipOverlapsEnrollment(s, joinedAt, leftAt))
    .sort((a, b) => (parseMs(b.grantedAt) ?? 0) - (parseMs(a.grantedAt) ?? 0));
  return candidates[0] ?? null;
}

function applyHistoricalScholarship(entry, scholarship) {
  const catalog = scholarship.catalogFeeSnapshot ?? entry.tuitionDue;
  const discount = scholarshipService.computeHistoricalDiscount(catalog, scholarship);
  const net = Math.max(0, catalog - discount);
  const remaining = Math.max(0, net - entry.amountPaid);
  return {
    ...entry,
    tuitionDue: catalog,
    netExpected: net,
    scholarshipDiscount: discount,
    remainingAmount: remaining,
    scholarshipIsFull:
      scholarship.type === SCHOLARSHIP_TYPES.FULL || discount >= catalog,
  };
}

function paymentsForEnrollment(enrollment, payments) {
  const classObjectId = String(enrollment.classId);
  if (enrollment.isActive) {
    return payments.filter((p) => String(p.classId) === classObjectId);
  }
  const joinMs = parseMs(enrollment.joinedAt);
  const leftMs = parseMs(enrollment.leftAt);
  return payments.filter((p) => {
    if (String(p.classId) !== classObjectId) return false;
    const paymentMs = parseMs(p.createdAt);
    if (paymentMs === null || joinMs === null) return false;
    if (paymentMs < joinMs) return false;
    if (leftMs !== null && paymentMs > leftMs) return false;
    return true;
  });
}

function baseEntry(enrollment, index) {
  return {
    enrollmentId: enrollment.classEnrollmentId,
    classId: enrollment.classFriendlyId,
    className: enrollment.classTitle || enrollment.classFriendlyId,
    periodStart: toIsoDate(enrollment.classStartDate),
    periodEnd: toIsoDate(enrollment.classEndDate),
    tuitionDue: Number(enrollment.classFee) || 0,
    enrolledAt: toIsoDateTime(enrollment.joinedAt),
    leftAt: toIsoDateTime(enrollment.leftAt),
    source: index === 0 ? 'initial' : 'promotion',
    isCurrent: enrollment.isActive === true,
    amountPaid: 0,
    paymentCount: 0,
  };
}

/**
 * Parcours de formation enrichi : inscriptions, paiements, bourses (actives + historiques).
 * La classe actuelle utilise Payment.classSummary (source de verite financiere).
 */
export async function buildClassTimeline(user) {
  const [enrollments, scholarships, payments] = await Promise.all([
    ClassEnrollment.find({ userId: user._id }).sort({ joinedAt: 1 }).lean(),
    Scholarship.find({ userId: user._id }).sort({ grantedAt: -1 }).lean(),
    Payment.find({ userId: user._id, status: PAYMENT_STATUSES.SUCCESSFUL })
      .select('classId amount createdAt')
      .lean(),
  ]);

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const currentClassId = user.classId
    ? enrollments.find((e) => e.isActive)?.classFriendlyId
    : undefined;

  const entries = enrollments.map((enrollment, index) => {
    const matching = paymentsForEnrollment(enrollment, payments);
    let entry = {
      ...baseEntry(enrollment, index),
      amountPaid: matching.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      paymentCount: matching.length,
    };

    if (!enrollment.isActive) {
      const sch = scholarshipForEnrollment(
        enrollment.classFriendlyId,
        enrollment.joinedAt,
        enrollment.leftAt,
        scholarships,
      );
      if (sch) entry = applyHistoricalScholarship(entry, sch);
    }

    return entry;
  });

  const activeEnrollment = enrollments.find((e) => e.isActive);
  if (activeEnrollment) {
    const summary = await Payment.classSummary(
      user._id,
      activeEnrollment.classId,
      activeEnrollment.classFee,
      activeEnrollment.classCurrencyCode,
    );
    const idx = entries.findIndex((e) => e.isCurrent);
    if (idx !== -1) {
      entries[idx] = {
        ...entries[idx],
        tuitionDue: summary.catalogExpected || entries[idx].tuitionDue,
        amountPaid: summary.paid,
        paymentCount: summary.paymentsCount,
        netExpected: summary.expected,
        scholarshipDiscount: summary.scholarshipDiscount,
        remainingAmount: summary.remaining,
        scholarshipIsFull:
          summary.scholarship?.isFull === true || summary.expected <= 0,
      };
    }
  }

  return {
    entries: entries.sort(
      (a, b) => new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime(),
    ),
    totalPaid,
    currentClassId,
  };
}

export default { buildClassTimeline };
