'use strict';

/**
 * Entry point: start the Bolt app in socket mode when SLACK_APP_TOKEN is set,
 * otherwise over HTTP on PORT (default 3000).
 */

require('dotenv').config();

const { createApp } = require('./app');

async function main() {
  const useSocketMode = Boolean(process.env.SLACK_APP_TOKEN);
  const port = Number(process.env.PORT) || 3000;

  const app = createApp({ socketMode: useSocketMode });

  if (useSocketMode) {
    await app.start();
    console.log('⚡️ LD move calculator is running (socket mode)');
  } else {
    await app.start(port);
    console.log(`⚡️ LD move calculator is running (HTTP) on port ${port}`);
  }
}

main().catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
