import { connect } from '../db/connect.js';
import { User, Class, ClassEnrollment } from '../models/index.js';

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

// Allow `node src/seeders/classEnrollment.seeder.js` without wiring into boot seeders.
const isDirectRun = process.argv[1]?.includes('classEnrollment.seeder');
if (isDirectRun) {
  connect()
    .then(() => backfillClassEnrollments())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[migrate:enrollments] failed:', err);
      process.exit(1);
    });
}

export default backfillClassEnrollments;
