import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { API_LOG_TTL_DAYS } from '../config/index.js';

const { Schema } = mongoose;

/**
 * Every outbound call to a third-party gateway (Neero, future MoMo, etc.)
 * is captured here so ops can audit what actually left our system and what
 * came back. Bodies are stored as-is (Mixed) — the write is best-effort
 * and never blocks the calling flow.
 *
 * A TTL index on `createdAt` auto-purges rows after 30 days
 * (see API_LOG_TTL_DAYS). Mongo's TTL monitor runs every 60s, so it may
 * take a little while past the exact deadline for a row to disappear.
 */
const apiLogSchema = new Schema(
  {
    apiLogId: { type: String, unique: true, index: true },

    provider: { type: String, required: true, index: true }, // e.g. 'neero'
    method: { type: String, required: true, uppercase: true, index: true },
    url: { type: String, required: true },

    // Request body is only stored for non-GET / non-HEAD requests
    requestBody: { type: Schema.Types.Mixed },
    // Headers we sent, minus obvious secrets (Authorization is stripped)
    requestHeaders: { type: Schema.Types.Mixed },

    responseStatus: { type: Number, index: true },
    responseBody: { type: Schema.Types.Mixed },

    durationMs: { type: Number },
    // On network / axios error: captured message + optional stack
    error: { type: String },
  },
  { timestamps: true }
);

apiLogSchema.pre('validate', function preValidate(next) {
  if (!this.apiLogId) this.apiLogId = generateFriendlyId('apiLog');
  next();
});

// TTL: expire the doc `API_LOG_TTL_DAYS` days after createdAt
apiLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: API_LOG_TTL_DAYS * 24 * 60 * 60 }
);

apiLogSchema.statics.findByFriendlyId = function findByFriendlyId(apiLogId) {
  return this.findOne({ apiLogId });
};

apiLogSchema.plugin(mongoosePaginate);

export default mongoose.model('ApiLog', apiLogSchema);
