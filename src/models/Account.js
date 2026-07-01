import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import config from '../config/index.js';

const { Schema } = mongoose;

const accountSchema = new Schema(
  {
    accountId: { type: String, unique: true, index: true },

    // Type: 'company' = the default account shared by all admins.
    //       'staff'   = a personal account tied to a single non-admin staff.
    //       'virtual' = a book-keeping account (bank, wallet, cash box, ...)
    //                   created and maintained by admin. Purely internal —
    //                   no external funding flow, adjustments are recorded
    //                   via POST /staff/accounts/:accountId/adjust.
    type: {
      type: String,
      enum: ['company', 'staff', 'virtual'],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    logoUrl: { type: String, trim: true }, // virtual accounts only
    currencyCode: { type: String, default: config.currency.default, uppercase: true },
    balance: { type: Number, default: 0, min: 0 },

    ownerStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', index: true }, // null for company / virtual
    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

accountSchema.pre('validate', function preValidate(next) {
  if (!this.accountId) this.accountId = generateFriendlyId('account');
  next();
});

// ---- Statics ----
accountSchema.statics.findDefaultCompany = function findDefaultCompany() {
  return this.findOne({ type: 'company', isDefault: true });
};

accountSchema.statics.findByStaff = function findByStaff(staffObjectId) {
  return this.findOne({ type: 'staff', ownerStaffId: staffObjectId });
};

accountSchema.statics.findByFriendlyId = function findByFriendlyId(accountId) {
  return this.findOne({ accountId });
};

/**
 * Atomically credit / debit an account.
 * If `session` is supplied, the operation participates in the calling transaction.
 *
 * Throws on insufficient funds (debit) — caller is responsible for aborting.
 */
accountSchema.statics.applyDelta = async function applyDelta(accountObjectId, delta, session) {
  const opts = session ? { new: true, session } : { new: true };
  const filter = { _id: accountObjectId };
  if (delta < 0) {
    filter.balance = { $gte: Math.abs(delta) };
  }
  const updated = await this.findOneAndUpdate(filter, { $inc: { balance: delta } }, opts);
  if (!updated) {
    const err = new Error('insufficient_funds');
    err.code = 'insufficient_funds';
    throw err;
  }
  return updated;
};

accountSchema.plugin(mongoosePaginate);

export default mongoose.model('Account', accountSchema);
