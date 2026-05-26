import { Setting } from '../models/index.js';
import config from '../config/index.js';

import { seedDefaultAdmin } from './admin.seeder.js';
import { seedDefaultAccount } from './account.seeder.js';

/**
 * Runs all boot-time seeders in order.
 *
 * Order matters:
 *   1. Default admin staff   — needed so admin-initiated transfers can resolve
 *                              `defaultAdminId`.
 *   2. Default company account — credited on every successful payment,
 *                                debited by admins moving funds out.
 *   3. Singleton settings doc — holds the active payment gateway selection.
 *
 * Each seeder is idempotent: re-running on a populated DB is a no-op.
 */
export async function runSeeders() {
  await seedDefaultAdmin();
  await seedDefaultAccount();

  // Singleton settings doc — initialises the active gateway selection.
  const settings = await Setting.getSingleton();
  if (!settings.activeGateway || settings.activeGateway === '') {
    settings.activeGateway = config.gateways.activeDefault;
    await settings.save();
    // eslint-disable-next-line no-console
    console.log(`[seed:settings] active gateway initialised to "${settings.activeGateway}"`);
  }
}

export { seedDefaultAdmin, seedDefaultAccount };
export default runSeeders;
