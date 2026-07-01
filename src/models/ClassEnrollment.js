import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { generateFriendlyId } from '../utils/idGenerator.js';

const { Schema } = mongoose;

/**
 * Class history for a user — one row per class they've ever been enrolled in.
 *
 *  - `isActive: true`  → the user's current class. At most one active row per user.
 *  - `isActive: false` → a previous class (they were "promoted" out of it).
 *
 * Class metadata (title / fee / dates) is snapshotted so the history stays
 * meaningful even if the underlying Class document is later edited.
 */
const classEnrollmentSchema = new Schema(
  {
    classEnrollmentId: { type: String, unique: true, index: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userFriendlyId: { type: String, index: true },

    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classFriendlyId: { type: String, index: true },

    // Snapshot for historical display
    classTitle: { type: String },
    classFee: { type: Number },
    classCurrencyCode: { type: String, uppercase: true },
    classStartDate: { type: Date },
    classEndDate: { type: Date },

    isActive: { type: Boolean, default: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },

    enrolledByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true }
);

// A user should have at most ONE active enrollment at any time. Partial unique
// index enforces it without blocking multiple inactive rows.
classEnrollmentSchema.index(
  { userId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

classEnrollmentSchema.pre('validate', function preValidate(next) {
  if (!this.classEnrollmentId) this.classEnrollmentId = generateFriendlyId('classEnrollment');
  next();
});

/**
 * Enroll a user in a class:
 *   - Any previous active enrollment (for a different class) is closed
 *     (isActive: false, leftAt: now).
 *   - If the user is already active on the same class, nothing changes.
 *   - Otherwise a fresh enrollment row is created for the new class.
 *
 * Class metadata is snapshotted at enroll time.
 * Idempotent: safe to re-call with the same class.
 * Returns the current active enrollment.
 */
classEnrollmentSchema.statics.enroll = async function enroll({
  user,
  classDoc,
  staffId,
  session,
}) {
  const now = new Date();
  const sessOpt = session ? { session } : {};

  const current = await this.findOne({ userId: user._id, isActive: true }, null, sessOpt);
  if (current && current.classId.equals(classDoc._id)) {
    return current; // already on this class — no-op
  }
  if (current) {
    current.isActive = false;
    current.leftAt = now;
    await current.save(sessOpt);
  }
  const [created] = await this.create(
    [{
      userId: user._id,
      userFriendlyId: user.userId,
      classId: classDoc._id,
      classFriendlyId: classDoc.classId,
      classTitle: classDoc.title,
      classFee: classDoc.fee,
      classCurrencyCode: classDoc.currencyCode,
      classStartDate: classDoc.startDate,
      classEndDate: classDoc.endDate,
      isActive: true,
      joinedAt: now,
      enrolledByStaffId: staffId,
    }],
    session ? { session } : {}
  );
  return created;
};

classEnrollmentSchema.statics.forUser = function forUser(userObjectId) {
  return this.find({ userId: userObjectId }).sort({ isActive: -1, joinedAt: -1 });
};

classEnrollmentSchema.plugin(mongoosePaginate);

export default mongoose.model('ClassEnrollment', classEnrollmentSchema);
