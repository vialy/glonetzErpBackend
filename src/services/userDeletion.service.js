import {
  User,
  Payment,
  ClassEnrollment,
  Scholarship,
  Certificate,
  Claim,
} from '../models/index.js';
import { PAYMENT_STATUSES } from '../config/index.js';

export async function countSuccessfulPaymentsForUser(userObjectId) {
  return Payment.countDocuments({
    userId: userObjectId,
    status: PAYMENT_STATUSES.SUCCESSFUL,
  });
}

/**
 * Hard-delete a learner when they have no successful payment.
 * Pending/failed rows are removed with the user; financial history is preserved
 * only when at least one payment succeeded.
 */
export async function deleteUserIfNoPayments(user) {
  const successfulCount = await countSuccessfulPaymentsForUser(user._id);
  if (successfulCount > 0) {
    return { ok: false, paymentCount: successfulCount };
  }

  await Promise.all([
    Payment.deleteMany({ userId: user._id }),
    ClassEnrollment.deleteMany({ userId: user._id }),
    Scholarship.deleteMany({ userId: user._id }),
    Certificate.deleteMany({ userId: user._id }),
    Claim.deleteMany({ userId: user._id }),
  ]);

  await User.deleteOne({ _id: user._id });
  return { ok: true, paymentCount: 0 };
}

export default { countSuccessfulPaymentsForUser, deleteUserIfNoPayments };
