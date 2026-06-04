import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Local cache of Neero payment method IDs.
 *
 * Before making a cash-in or cash-out call, we check this collection first.
 * If the (phoneNumber, provider) pair exists, we reuse the stored Neero
 * payment method ID instead of calling POST /api/v1/payment-methods again.
 *
 * This eliminates one round-trip per transaction for repeat customers/staff.
 */
const neeroPaymentMethodSchema = new Schema(
  {
    phoneNumber: { type: String, required: true, trim: true },
    provider: { type: String, required: true, lowercase: true, trim: true }, // 'mtn' | 'orange'
    countryIso: { type: String, default: 'CM', uppercase: true },
    neeroPaymentMethodId: { type: String, required: true },
  },
  { timestamps: true }
);

neeroPaymentMethodSchema.index({ phoneNumber: 1, provider: 1 }, { unique: true });

export default mongoose.model('NeeroPaymentMethod', neeroPaymentMethodSchema);
