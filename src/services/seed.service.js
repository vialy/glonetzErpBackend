import { runSeeders } from '../seeders/index.js';

/**
 * Boot-time seeding entry point.
 *
 * The individual seeders live in `src/seeders/`. This service simply delegates
 * to them, preserving the existing `seedDefaults` import path used by
 * `src/index.js`.
 */
export async function seedDefaults() {
  await runSeeders();
}

export default { seedDefaults };
