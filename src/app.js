'use strict';

/**
 * Slack Bolt wiring for the LD move calculator.
 *
 *   /movequote                -> opens the modal
 *   view submission           -> parse -> calculate -> post result back to the user
 *
 * This module only builds and configures the App; starting it (socket vs HTTP)
 * is the entry point's job (see src/index.js).
 */

const { App } = require('@slack/bolt');
const { buildModalView, parseSubmission, CALLBACK_ID } = require('./modal');
const { calculateQuote } = require('./calculator');
const { buildResultBlocks, buildResultText } = require('./format');

function registerHandlers(app) {
  // Slash command: open the modal.
  app.command('/movequote', async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildModalView(),
      });
    } catch (err) {
      logger.error('Failed to open /movequote modal', err);
    }
  });

  // Modal submission: validate + calculate, or surface field errors in-modal.
  app.view(CALLBACK_ID, async ({ ack, body, view, client, logger }) => {
    let input;
    try {
      input = parseSubmission(view);
    } catch (err) {
      await ack({ response_action: 'errors', errors: { location: err.message } });
      return;
    }

    let result;
    try {
      result = calculateQuote(input);
    } catch (err) {
      // Show the engine's validation error against the most relevant field.
      await ack({ response_action: 'errors', errors: { totalMiles: err.message } });
      return;
    }

    await ack();

    const userId = body.user.id;
    try {
      // DM the result back to the submitting user.
      const dm = await client.conversations.open({ users: userId });
      await client.chat.postMessage({
        channel: dm.channel.id,
        text: buildResultText(result),
        blocks: buildResultBlocks(result),
      });
    } catch (err) {
      logger.error('Failed to post quote result', err);
    }
  });
}

function createApp(options = {}) {
  const app = new App({
    token: options.token || process.env.SLACK_BOT_TOKEN,
    signingSecret: options.signingSecret || process.env.SLACK_SIGNING_SECRET,
    socketMode: options.socketMode,
    appToken: options.appToken || process.env.SLACK_APP_TOKEN,
    ...options.appOptions,
  });
  registerHandlers(app);
  return app;
}

module.exports = { createApp, registerHandlers };
