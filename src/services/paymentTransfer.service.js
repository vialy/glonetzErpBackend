import { Payment, Scholarship } from '../models/index.js';
import { PAYMENT_STATUSES, SCHOLARSHIP_TYPES } from '../config/index.js';

/**
 * Move successful/pending tuition payments (and active scholarship) from a class
 * the learner is leaving via profile correction to their new class.
 */
export async function transferPaymentsAndScholarship({
  user,
  fromClassObjectId,
  toClassDoc,
  staffId,
}) {
  if (!fromClassObjectId || fromClassObjectId.equals(toClassDoc._id)) {
    return { paymentsMoved: 0, totalAmount: 0, scholarshipMoved: false };
  }

  const payments = await Payment.find({
    userId: user._id,
    classId: fromClassObjectId,
    status: { $in: [PAYMENT_STATUSES.SUCCESSFUL, PAYMENT_STATUSES.PENDING] },
  });

  let totalAmount = 0;
  for (const payment of payments) {
    totalAmount += Number(payment.amount) || 0;
    const oldClassFriendly = payment.classFriendlyId;
    payment.classId = toClassDoc._id;
    payment.classFriendlyId = toClassDoc.classId;
    payment.classStartDate = toClassDoc.startDate;
    payment.classEndDate = toClassDoc.endDate;
    const note = `[Transfert correction] ${oldClassFriendly} → ${toClassDoc.classId}`;
    payment.manualNote = payment.manualNote ? `${payment.manualNote} | ${note}` : note;
    await payment.save();
  }

  let scholarshipMoved = false;
  const scholarship = await Scholarship.findActiveForUserClass(user._id, fromClassObjectId);
  if (scholarship) {
    scholarship.isActive = false;
    scholarship.revokedAt = new Date();
    scholarship.revokedByStaffId = staffId;
    const revokeNote = `Transféré vers ${toClassDoc.classId} (correction classe)`;
    scholarship.note = scholarship.note ? `${scholarship.note} | ${revokeNote}` : revokeNote;
    await scholarship.save();

    const existingOnTarget = await Scholarship.findActiveForUserClass(user._id, toClassDoc._id);
    if (!existingOnTarget) {
      await Scholarship.create({
        userId: user._id,
        userFriendlyId: user.userId,
        classId: toClassDoc._id,
        classFriendlyId: toClassDoc.classId,
        type: scholarship.type,
        value: scholarship.type === SCHOLARSHIP_TYPES.FULL ? toClassDoc.fee : scholarship.value,
        catalogFeeSnapshot: toClassDoc.fee,
        reason: scholarship.reason,
        note: `Reprise bourse après correction depuis ${scholarship.classFriendlyId}`,
        grantedByStaffId: staffId,
        grantedAt: new Date(),
        isActive: true,
      });
      scholarshipMoved = true;
    }
  }

  return {
    paymentsMoved: payments.length,
    totalAmount,
    scholarshipMoved,
  };
}

export default { transferPaymentsAndScholarship };
