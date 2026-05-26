import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { WITHDRAWAL_ACCOUNT_PROVIDERS } from '../config/index.js';

const { Schema } = mongoose;

const OTP_TTL_MINUTES = 10;

const withdrawalAccountSchema = new Schema(
  {
    withdrawalAccountId: { type: String, unique: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },

    provider: {
      type: String,
      enum: Object.values(WITHDRAWAL_ACCOUNT_PROVIDERS),
      required: true,
    },
    phoneNumber: { type: String, required: true, trim: true },
    holderName: { type: String, trim: true },
    countryIso: { type: String, default: 'CM', uppercase: true },

    isVerified: { type: Boolean, default: false, index: true },
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

withdrawalAccountSchema.pre('validate', function preValidate(next) {
  if (!this.withdrawalAccountId) {
    this.withdrawalAccountId = generateFriendlyId('withdrawalAccount');
  }
  next();
});

withdrawalAccountSchema.statics.findForStaff = function findForStaff(staffObjectId) {
  return this.find({ staffId: staffObjectId, isActive: true }).sort('-createdAt');
};

withdrawalAccountSchema.statics.OTP_TTL_MINUTES = OTP_TTL_MINUTES;

withdrawalAccountSchema.plugin(mongoosePaginate);

export default mongoose.model('WithdrawalAccount', withdrawalAccountSchema);
