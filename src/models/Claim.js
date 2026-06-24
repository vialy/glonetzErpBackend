import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { CLAIM_STATUSES } from '../config/index.js';

const { Schema } = mongoose;

const claimSchema = new Schema(
  {
    claimId: { type: String, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userFriendlyId: { type: String, index: true },

    // The non-successful payment this claim refers to. Required at creation —
    // a claim cannot exist without a matching pending/failed/cancelled payment.
    paymentObjectId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    paymentId: { type: String, required: true, index: true }, // friendly id snapshot

    amount: { type: Number, required: true, min: 0 },
    currencyCode: { type: String, default: 'XAF', uppercase: true },
    description: { type: String, trim: true },
    paymentDate: { type: Date, required: true },
    proofUrl: { type: String, required: true },

    status: {
      type: String,
      enum: Object.values(CLAIM_STATUSES),
      default: CLAIM_STATUSES.PENDING,
      index: true,
    },

    // When resolved, the staff member ties the claim to an existing Payment record
    resolvedPaymentId: { type: String, index: true }, // friendly payment id
    resolvedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true },
  },
  { timestamps: true }
);

claimSchema.pre('validate', function preValidate(next) {
  if (!this.claimId) this.claimId = generateFriendlyId('claim');
  next();
});

claimSchema.statics.findByFriendlyId = function findByFriendlyId(claimId) {
  return this.findOne({ claimId });
};

claimSchema.statics.forUser = function forUser(userObjectId) {
  return this.find({ userId: userObjectId }).sort('-createdAt');
};

claimSchema.plugin(mongoosePaginate);

export default mongoose.model('Claim', claimSchema);
