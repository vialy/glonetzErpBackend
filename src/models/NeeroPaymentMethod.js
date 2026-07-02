import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Local cache of Neero payment method IDs.
 *
 * Keyed by (phoneNumber, provider). Every withdrawal account ultimately
 * maps to a phone number — for mtn/orange that's the mobile-money wallet,
 * for neero that's the phone tied to the personal Neero account.
 *
 * Before calling cash-in / cash-out, the gateway adapter resolves the
 * destination payment-method id through this cache; on miss it hits Neero's
 * `/api/v1/payment-methods` endpoint (with provider-specific body shape)
 * and persists the response so subsequent payouts skip the round-trip.
 */
const neeroPaymentMethodSchema = new Schema(
  {
    phoneNumber: { type: String, required: true, trim: true },
    provider: { type: String, required: true, lowercase: true, trim: true }, // 'mtn' | 'orange' | 'neero'
    countryIso: { type: String, default: 'CM', uppercase: true },
    neeroPaymentMethodId: { type: String, required: true },
    // Masked display string Neero returns (e.g. "+237 **** 139" or
    // "NM BID *****64e22"). Handy for confirming an account before use.
    shortInfo: { type: String },
  },
  { timestamps: true }
);

neeroPaymentMethodSchema.index({ phoneNumber: 1, provider: 1 }, { unique: true });

export default mongoose.model('NeeroPaymentMethod', neeroPaymentMethodSchema);
