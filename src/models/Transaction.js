import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { TRANSACTION_TYPES, TRANSACTION_SOURCES } from '../config/index.js';

const { Schema } = mongoose;

/**
 * Transaction = one perspective of a movement on a SINGLE account.
 *
 * A transfer between two accounts produces TWO transactions:
 *   - the payer's debit
 *   - the beneficiary's credit
 *
 * Both share the same `transferId` so they can be joined.
 *
 * openingBalance and closingBalance snapshot the account state to support the
 * statement view without re-walking the ledger.
 */
const transactionSchema = new Schema(
  {
    transactionId: { type: String, unique: true, index: true },

    // Which account this transaction belongs to (the "perspective")
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    accountFriendlyId: { type: String, index: true },

    // Owner staff of this account (null for the company account)
    userId: { type: Schema.Types.ObjectId, ref: 'Staff', index: true },

    // Counterparty for transfers
    beneficiaryId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    beneficiaryAccountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    beneficiaryAccountFriendlyId: { type: String },

    type: { type: String, enum: Object.values(TRANSACTION_TYPES), required: true },
    source: { type: String, enum: Object.values(TRANSACTION_SOURCES), required: true },

    amount: { type: Number, required: true, min: 0 },
    fee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 }, // amount + fee
    currencyCode: { type: String, default: 'XAF', uppercase: true },

    openingBalance: { type: Number, required: true },
    closingBalance: { type: Number, required: true },

    description: { type: String, trim: true },

    // Cross-links to the higher-level event
    transferId: { type: String, index: true },        // friendly id shared by the two sides
    paymentFriendlyId: { type: String, index: true }, // when source = 'payment'
    withdrawalFriendlyId: { type: String, index: true }, // when source = 'withdrawal'
  },
  { timestamps: true }
);

transactionSchema.pre('validate', function preValidate(next) {
  if (!this.transactionId) this.transactionId = generateFriendlyId('transaction');
  next();
});

transactionSchema.statics.statementForAccount = function statementForAccount(accountObjectId, { from, to } = {}) {
  const q = { accountId: accountObjectId };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }
  return this.find(q).sort('-createdAt');
};

transactionSchema.plugin(mongoosePaginate);

export default mongoose.model('Transaction', transactionSchema);
