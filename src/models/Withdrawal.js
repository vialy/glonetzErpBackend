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

    /** Montant total envoyé au gateway (net + frais). */
    amount: { type: Number, required: true, min: 0 },
    /** Montant net utilisable côté manager ERP après déduction des frais. */
    netAmount: { type: Number, min: 0 },
    /** Charge de retrait enregistrée comme dépense manager. */
    feeAmount: { type: Number, min: 0, default: 0 },
    expenseFriendlyId: { type: String, index: true },
    currencyCode: { type: String, default: 'XAF', uppercase: true },
    provider: { type: String, required: true }, // gateway provider used (e.g. neero)

    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUSES),
      default: WITHDRAWAL_STATUSES.PENDING,
      index: true,
    },
    gatewayReference: { type: String, index: true },  // neero transactionIntentId
    gatewayPaymentRef: { type: String },              // user-visible reference from neero
    gatewayType: { type: String },                    // "CASHIN" | "CASHOUT" (sanity check)
    gatewayFees: { type: Schema.Types.Mixed },        // neero `fees` object
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
