import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import config, {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
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
