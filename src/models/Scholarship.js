import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';
import { SCHOLARSHIP_TYPES } from '../config/index.js';

const { Schema } = mongoose;

const scholarshipSchema = new Schema(
  {
    scholarshipId: { type: String, unique: true, index: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userFriendlyId: { type: String, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classFriendlyId: { type: String, index: true },

    type: {
      type: String,
      enum: Object.values(SCHOLARSHIP_TYPES),
      required: true,
    },
    value: { type: Number, min: 0, default: 0 },
    catalogFeeSnapshot: { type: Number, min: 0 },

    reason: { type: String, trim: true },
    note: { type: String, trim: true },

    grantedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    grantedAt: { type: Date, default: Date.now },

    isActive: { type: Boolean, default: true, index: true },
    revokedAt: { type: Date },
    revokedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

scholarshipSchema.index(
  { userId: 1, classId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

scholarshipSchema.pre('validate', function preValidate(next) {
  if (!this.scholarshipId) this.scholarshipId = generateFriendlyId('scholarship');
  next();
});

scholarshipSchema.statics.findByFriendlyId = function findByFriendlyId(scholarshipId) {
  return this.findOne({ scholarshipId });
};

scholarshipSchema.statics.findActiveForUserClass = function findActiveForUserClass(userObjectId, classObjectId) {
  return this.findOne({ userId: userObjectId, classId: classObjectId, isActive: true });
};

scholarshipSchema.statics.activeMapForClass = async function activeMapForClass(classObjectId, userObjectIds) {
  if (!userObjectIds.length) return new Map();
  const rows = await this.find({
    classId: classObjectId,
    userId: { $in: userObjectIds },
    isActive: true,
  });
  const map = new Map();
  for (const row of rows) map.set(String(row.userId), row);
  return map;
};

scholarshipSchema.plugin(mongoosePaginate);

export default mongoose.model('Scholarship', scholarshipSchema);
