import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import {
  WITHDRAWAL_ACCOUNT_PROVIDERS,
  WITHDRAWAL_PROVIDERS_REQUIRING_OTP,
} from '../config/index.js';

const { Schema } = mongoose;

const OTP_TTL_MINUTES = 10;

/**
 * A withdrawal target a staff member can pay out to.
 *
 * Every provider is keyed by phone number:
 *  - MTN / Orange : mobile-money wallet → SMS-OTP verification required.
 *  - Neero        : personal Neero account → trusted on creation (Neero has
 *                   already KYC'd the underlying phone number).
 *
 * The provider-specific body shape sent to Neero when caching the payment
 * method id lives in the Neero adapter.
 */
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
    displayLabel: { type: String, trim: true },
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

withdrawalAccountSchema.virtual('requiresOtp').get(function requiresOtp() {
  return WITHDRAWAL_PROVIDERS_REQUIRING_OTP.includes(this.provider);
});

withdrawalAccountSchema.statics.findForStaff = function findForStaff(staffObjectId) {
  return this.find({ staffId: staffObjectId, isActive: true }).sort('-createdAt');
};

withdrawalAccountSchema.statics.OTP_TTL_MINUTES = OTP_TTL_MINUTES;

withdrawalAccountSchema.plugin(mongoosePaginate);

export default mongoose.model('WithdrawalAccount', withdrawalAccountSchema);
