import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import config, {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  NETWORK_OPERATORS,
} from '../config/index.js';

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    paymentId: { type: String, unique: true, index: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userFriendlyId: { type: String, index: true },

    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classFriendlyId: { type: String, index: true },

    // Snapshot of class fields at the time of payment
    amount: { type: Number, required: true, min: 0 },
    currencyCode: { type: String, default: config.currency.default, uppercase: true },
    classStartDate: { type: Date, required: true },
    classEndDate: { type: Date, required: true },

    method: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      required: true,
      default: PAYMENT_METHODS.ONLINE,
    },
    provider: {
      type: String,
      enum: Object.values(PAYMENT_PROVIDERS),
      required: true,
      default: PAYMENT_PROVIDERS.NONE,
    },
    network_provider: {
      type: String,
      default: NETWORK_OPERATORS.NONE,
      enum: Object.values(NETWORK_OPERATORS),
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.PENDING,
      index: true,
    },

    // Gateway artefacts
    gatewayReference: { type: String, index: true },  // neero transactionIntentId
    gatewayPaymentRef: { type: String },              // user-visible reference from neero
    gatewayType: { type: String },                    // "CASHIN" | "CASHOUT" (sanity check)
    gatewayFees: { type: Schema.Types.Mixed },        // neero `fees` object — used for reconciliation
    gatewayPayload: { type: Schema.Types.Mixed },     // raw initiate / verify response
    gatewayCallback: { type: Schema.Types.Mixed },    // most recent webhook payload
    paymentUrl: { type: String },                     // user-redirectable url, if any

    // For manual payments
    recordedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    manualNote: { type: String, trim: true },

    settledAt: { type: Date },
    failureReason: { type: String },
  },
  { timestamps: true }
);

paymentSchema.pre('validate', function preValidate(next) {
  if (!this.paymentId) this.paymentId = generateFriendlyId('payment');
  next();
});

// ---- Statics ----
paymentSchema.statics.findByFriendlyId = function findByFriendlyId(paymentId) {
  return this.findOne({ paymentId });
};

paymentSchema.statics.pendingForUser = function pendingForUser(userObjectId) {
  return this.find({ userId: userObjectId, status: PAYMENT_STATUSES.PENDING }).sort('-createdAt');
};

paymentSchema.statics.allForUser = function allForUser(userObjectId) {
  return this.find({ userId: userObjectId }).sort('-createdAt');
};

/**
 * Summarize a user's payment status against a given class. Used to support
 * partial payments — a user can pay any subset of the class fee, across
 * multiple Payment records, until the class fee is fully covered.
 *
 * Returns:
 *   {
 *     expected,      // class.fee
 *     paid,          // sum of SUCCESSFUL payments
 *     pending,       // sum of PENDING payments
 *     remaining,     // max(expected - paid - pending, 0)
 *     fullyPaid,     // boolean (paid alone >= expected)
 *     currencyCode,
 *     paymentsCount, // total payments on record (any status)
 *   }
 *
 * Pending payments are subtracted from `remaining` so a user can't accidentally
 * over-pay by stacking pending intents.
 */
paymentSchema.statics.classSummary = async function classSummary(userObjectId, classObjectId, classFee, currencyCode) {
  const agg = await this.aggregate([
    { $match: { userId: userObjectId, classId: classObjectId } },
    {
      $group: {
        _id: '$status',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let paid = 0;
  let pending = 0;
  let paymentsCount = 0;
  for (const row of agg) {
    paymentsCount += row.count;
    if (row._id === PAYMENT_STATUSES.SUCCESSFUL) paid = row.total;
    else if (row._id === PAYMENT_STATUSES.PENDING) pending = row.total;
  }

  const expected = Number(classFee) || 0;
  const remaining = Math.max(expected - paid - pending, 0);

  return {
    expected,
    paid,
    pending,
    remaining,
    fullyPaid: paid >= expected && expected > 0,
    currencyCode,
    paymentsCount,
  };
};

/**
 * Class-wide payment rollup used by the class-details endpoint.
 *
 * Aggregates only the SUCCESSFUL payments by student, then clamps each
 * student's total to the class fee so a stray over-payment can't inflate the
 * class-wide total.
 *
 * Inputs:
 *   - studentObjectIds: ObjectId[] of users currently assigned to the class
 *   - classObjectId:    ObjectId of the class
 *   - classFee:         numeric class fee
 *
 * Returns:
 *   {
 *     studentCount,        // students currently assigned (input length)
 *     fullyPaidCount,      // students whose successful total >= fee
 *     totalExpected,       // studentCount * fee
 *     totalPaid,           // sum across students of min(paid, fee)
 *     totalRemaining,      // totalExpected - totalPaid (>= 0)
 *     paidByStudent,       // Map<userIdString, paid> (only students with payments)
 *   }
 */
paymentSchema.statics.classRollup = async function classRollup(studentObjectIds, classObjectId, classFee) {
  const fee = Number(classFee) || 0;
  const studentCount = studentObjectIds.length;
  const totalExpected = studentCount * fee;

  if (studentCount === 0) {
    return {
      studentCount: 0,
      fullyPaidCount: 0,
      totalExpected: 0,
      totalPaid: 0,
      totalRemaining: 0,
      paidByStudent: new Map(),
    };
  }

  const agg = await this.aggregate([
    {
      $match: {
        classId: classObjectId,
        status: PAYMENT_STATUSES.SUCCESSFUL,
        userId: { $in: studentObjectIds },
      },
    },
    { $group: { _id: '$userId', paid: { $sum: '$amount' } } },
  ]);

  const paidByStudent = new Map();
  let totalPaid = 0;
  let fullyPaidCount = 0;
  for (const row of agg) {
    const paid = row.paid || 0;
    paidByStudent.set(String(row._id), paid);
    totalPaid += Math.min(paid, fee);
    if (paid >= fee && fee > 0) fullyPaidCount += 1;
  }

  return {
    studentCount,
    fullyPaidCount,
    totalExpected,
    totalPaid,
    totalRemaining: Math.max(totalExpected - totalPaid, 0),
    paidByStudent,
  };
};

/**
 * Sum of all SUCCESSFUL payments for a classId — every learner, including
 * those who were promoted to another class (payments stay on the original class).
 *
 * @returns {Promise<number>}
 */
paymentSchema.statics.classTotalPaid = async function classTotalPaid(classObjectId) {
  const [row] = await this.aggregate([
    {
      $match: {
        classId: classObjectId,
        status: PAYMENT_STATUSES.SUCCESSFUL,
      },
    },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
  ]);
  return row?.totalPaid ?? 0;
};

paymentSchema.statics.markSettled = async function markSettled(paymentId, payload = {}) {
  return this.findOneAndUpdate(
    { paymentId, status: PAYMENT_STATUSES.PENDING },
    {
      $set: {
        status: PAYMENT_STATUSES.SUCCESSFUL,
        settledAt: new Date(),
        ...(payload.gatewayCallback ? { gatewayCallback: payload.gatewayCallback } : {}),
      },
    },
    { new: true }
  );
};

paymentSchema.statics.markFailed = async function markFailed(paymentId, reason, payload = {}) {
  return this.findOneAndUpdate(
    { paymentId, status: PAYMENT_STATUSES.PENDING },
    {
      $set: {
        status: PAYMENT_STATUSES.FAILED,
        failureReason: reason,
        ...(payload.gatewayCallback ? { gatewayCallback: payload.gatewayCallback } : {}),
      },
    },
    { new: true }
  );
};

paymentSchema.plugin(mongoosePaginate);

export default mongoose.model('Payment', paymentSchema);
