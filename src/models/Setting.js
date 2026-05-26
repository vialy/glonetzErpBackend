import mongoose from 'mongoose';

import { PAYMENT_PROVIDERS } from '../config/index.js';

const { Schema } = mongoose;

/**
 * Singleton system settings document.
 *
 *   activeGateway:           which gateway processes online payments / withdrawals.
 *                            One of: 'tranzak' | 'neero' | 'none'.
 *   notificationEmails:      list of staff emails who get notified for the events
 *                            in NOTIFICATION_EVENTS. Editable only by the admin.
 *
 * Always access via Setting.getSingleton() — never query directly.
 */
const settingSchema = new Schema(
  {
    activeGateway: {
      type: String,
      enum: Object.values(PAYMENT_PROVIDERS),
      default: PAYMENT_PROVIDERS.NONE,
    },
    notificationEmails: { type: [String], default: [] },
  },
  { timestamps: true }
);

settingSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

export default mongoose.model('Setting', settingSchema);
