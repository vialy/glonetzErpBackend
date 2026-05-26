import { connect } from './db/connect.js';
import buildApp from './app.js';
import { seedDefaults } from './services/seed.service.js';
import config from './config/index.js';

async function start() {
  await connect();
  await seedDefaults();

  const app = buildApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[${config.appName}] listening on :${config.port} (env=${config.env})`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] failed to start:', err);
  process.exit(1);
});
