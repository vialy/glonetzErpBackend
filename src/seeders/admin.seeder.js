import { Staff } from '../models/index.js';
import { hash } from '../utils/password.js';
import config from '../config/index.js';

/**
 * Seeds the default admin staff account.
 *
 * Behaviour:
 *   - If at least one ADMIN role staff already exists, the oldest one is treated
 *     as the default admin (idempotent — re-running the seeder will not create
 *     duplicates).
 *   - Otherwise, an admin is created using the values from
 *     config.defaults.admin (email / name / password). The password is hashed
 *     with bcrypt and `hsCp` (hasChangedPassword) is set to false so the admin
 *     will be forced to change their password on first login.
 *   - The resulting admin's `_id` and friendly `staffId` are cached on
 *     `config.defaults` so admin-initiated transfers can reference the default
 *     admin without re-querying.
 *
 * @returns {Promise<{admin: import('mongoose').Document, created: boolean}>}
 */
export async function seedDefaultAdmin() {
  let admin = await Staff.findOne({ role: config.STAFF_ROLES.ADMIN }).sort({ createdAt: 1 });
  let created = false;

  if (!admin) {
    const passwordHash = await hash(config.defaults.admin.password);
    admin = await Staff.create({
      name: config.defaults.admin.name,
      email: config.defaults.admin.email,
      role: config.STAFF_ROLES.ADMIN,
      passwordHash,
      hsCp: false,
    });
    created = true;
    // eslint-disable-next-line no-console
    console.log(`[seed:admin] default admin created: ${admin.email} (${admin.staffId})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed:admin] default admin already exists: ${admin.email} (${admin.staffId})`);
  }

  // Cache on config so the rest of the system can find the default admin
  // without re-querying (used for admin-initiated transfers, etc.).
  config.defaults.defaultAdminId = admin._id;
  config.defaults.defaultAdminFriendlyId = admin.staffId;

  return { admin, created };
}

export default seedDefaultAdmin;
