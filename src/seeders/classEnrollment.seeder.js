import { connect } from '../db/connect.js';
import { User, Class, ClassEnrollment, Payment } from '../models/index.js';
import { PAYMENT_STATUSES } from '../config/index.js';
/**
 * Backfill ClassEnrollment rows for users who already have a classId but no
 * enrollment history (data created before the ClassEnrollment feature).
 *
 * Behaviour:
 *   - Skips users whose active enrollment already matches their classId.
 *   - Skips users whose classId no longer resolves to a Class document.
 *   - Otherwise calls ClassEnrollment.enroll() — same path as promotion /
 *     user creation, so snapshots and isActive semantics stay consistent.
 *
 * This is NOT run at boot time (unlike admin / account seeders). Run manually:
 *   npm run migrate:enrollments
 *
 * @returns {Promise<{created: number, skipped: number}>}
 */
export async function backfillClassEnrollments() {
  const users = await User.find({ classId: { $ne: null } });
  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const classDoc = await Class.findById(user.classId);
    if (!classDoc) {
      skipped += 1;
      continue;
    }

    const active = await ClassEnrollment.findOne({ userId: user._id, isActive: true });
    if (active && active.classId.equals(classDoc._id)) {
      skipped += 1;
      continue;
    }

    await ClassEnrollment.enroll({ user, classDoc, staffId: undefined });
    created += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate:enrollments] created=${created} skipped=${skipped}`);
  return { created, skipped };
}

/**
 * Create missing ClassEnrollment rows for (user, class) pairs that appear in
 * successful payments — fixes session stats after promotions done without history.
 */
export async function repairEnrollmentFromPayments() {
  const pairs = await Payment.aggregate([
    {
      $match: {
        status: PAYMENT_STATUSES.SUCCESSFUL,
        classId: { $ne: null },
        userId: { $ne: null },
      },
    },
    { $group: { _id: { userId: '$userId', classId: '$classId' } } },
  ]);

  let created = 0;
  let skipped = 0;

  for (const { _id } of pairs) {
    const exists = await ClassEnrollment.findOne({
      userId: _id.userId,
      classId: _id.classId,
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    const [user, classDoc] = await Promise.all([
      User.findById(_id.userId),
      Class.findById(_id.classId),
    ]);
    if (!user || !classDoc) {
      skipped += 1;
      continue;
    }

    const isCurrent = Boolean(user.classId && user.classId.equals(classDoc._id));
    const now = new Date();
    await ClassEnrollment.create({
      userId: user._id,
      userFriendlyId: user.userId,
      classId: classDoc._id,
      classFriendlyId: classDoc.classId,
      classTitle: classDoc.title,
      classFee: classDoc.fee,
      classCurrencyCode: classDoc.currencyCode,
      classStartDate: classDoc.startDate,
      classEndDate: classDoc.endDate,
      isActive: isCurrent,
      joinedAt: now,
      ...(isCurrent ? {} : { leftAt: now }),
    });
    created += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate:enrollments:payments] created=${created} skipped=${skipped}`);
  return { created, skipped };
}

// Allow `node src/seeders/classEnrollment.seeder.js` without wiring into boot seeders.
const isDirectRun = process.argv[1]?.includes('classEnrollment.seeder');
if (isDirectRun) {
  connect()
    .then(() => backfillClassEnrollments())
    .then(() => repairEnrollmentFromPayments())    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[migrate:enrollments] failed:', err);
      process.exit(1);
    });
}

export default backfillClassEnrollments;
