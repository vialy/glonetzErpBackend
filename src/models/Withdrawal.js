import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { WITHDRAWAL_STATUSES } from '../config/index.js';

const { Schema } = mongoose;

const withdrawalSchema = new Schema(
  {
    withdrawalId: { type: String, unique: true, index: true },

    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    withdrawalAccountId: { type: Schema.Types.ObjectId, ref: 'WithdrawalAccount', required: true },

    amount: { type: Number, required: true, min: 0 },
    currencyCode: { type: String, default: 'XAF', uppercase: true },
    provider: { type: String, required: true }, // gateway provider used (tranzak | neero)

    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUSES),
      default: WITHDRAWAL_STATUSES.PENDING,
      index: true,
    },
    gatewayReference: { type: String, index: true },
    gatewayPayload: { type: Schema.Types.Mixed },
    gatewayCallback: { type: Schema.Types.Mixed },
    failureReason: { type: String },
    settledAt: { type: Date },
  },
  { timestamps: true }
);

withdrawalSchema.pre('validate', function preValidate(next) {
  if (!this.withdrawalId) this.withdrawalId = generateFriendlyId('withdrawal');
  next();
});

withdrawalSchema.plugin(mongoosePaginate);

export default mongoose.model('Withdrawal', withdrawalSchema);
