import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';

const { Schema } = mongoose;

/**
 * An expense recorded by a staff member against their own account. The
 * matching debit Transaction (source: 'expense') is what actually shows up
 * on the account statement — this collection exists so the team can browse
 * spending separately with description / category metadata if needed.
 */
const expenseSchema = new Schema(
  {
    expenseId: { type: String, unique: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    accountFriendlyId: { type: String, index: true },

    amount: { type: Number, required: true, min: 1 },
    currencyCode: { type: String, default: 'XAF', uppercase: true },
    description: { type: String, required: true, trim: true },

    /** Date the spend actually occurred (may differ from createdAt). */
    spentAt: { type: Date, required: true, index: true },
    categoryId: { type: String, trim: true },
    categoryLabel: { type: String, trim: true },
    comment: { type: String, trim: true },

    /** Optional receipt / proof image (same upload pipeline as claims). */
    proofUrl: { type: String },
    proofFileName: { type: String, trim: true },

    // Link back to the ledger transaction created for this expense
    transactionFriendlyId: { type: String, index: true },
    /** When the charge mirrors an admin payout (company → manager). */
    withdrawalFriendlyId: { type: String, index: true },
    transferId: { type: String, index: true },
  },
  { timestamps: true }
);

expenseSchema.pre('validate', function preValidate(next) {
  if (!this.expenseId) this.expenseId = generateFriendlyId('expense');
  next();
});

expenseSchema.statics.findByFriendlyId = function findByFriendlyId(expenseId) {
  return this.findOne({ expenseId });
};

expenseSchema.plugin(mongoosePaginate);

export default mongoose.model('Expense', expenseSchema);
