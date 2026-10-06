'use strict';

/**
 * Entry point: start the Bolt app in socket mode when SLACK_APP_TOKEN is set,
 * otherwise over HTTP on PORT (default 3000).
 */

require('dotenv').config();

const http = require('http');

const { createApp } = require('./app');

/**
 * In socket mode the app opens an outbound websocket and binds NO port, but
 * many cloud hosts fail a deploy with "no open ports detected" unless something
 * is listening. Start a tiny HTTP server that answers 200 "ok" to any request
 * so the host's health check passes. Returns the bound server.
 */
function startHealthServer(port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  server.listen(port);
  return server;
}

async function main() {
  const useSocketMode = Boolean(process.env.SLACK_APP_TOKEN);
  const port = Number(process.env.PORT) || 3000;

  const app = createApp({ socketMode: useSocketMode });

  if (useSocketMode) {
    await app.start();
    startHealthServer(port);
    console.log(`⚡️ Move Quote app running (socket mode); health server on :${port}`);
  } else {
    await app.start(port);
    console.log(`⚡️ LD move calculator is running (HTTP) on port ${port}`);
  }
}

main().catch((err) => {
  console.error('Failed to start app:', err);
  process.exit(1);
});
