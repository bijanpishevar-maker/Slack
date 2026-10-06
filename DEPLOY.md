# Deploying the Move Quote Slack app

This guide walks you through putting the `/movequote` Slack app online so it
runs around the clock. No coding needed — just clicking through a web dashboard
and pasting in three values.

**A quick, honest note on cost.** Keeping a Slack app connected 24/7 needs an
"always-on" host. Free tiers go to sleep when idle, which drops the Slack
connection and makes `/movequote` stop responding. So plan on a small monthly
cost — on Render that's the **Starter** instance, a few dollars a month. That
keeps the app awake and your slash command working at all hours.

You will need the three Slack secrets from your Slack app setup (see the main
[README](README.md) for how to get them):

- `SLACK_BOT_TOKEN` — starts with `xoxb-`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN` — starts with `xapp-` (this is what runs the app in Socket
  Mode, so no public URL is needed)

> You never put these secrets in the code or the GitHub repo. You paste them
> into the host's dashboard, where they're stored privately.

---

## Recommended host: Render

1. Go to <https://render.com> and **create an account** (you can sign up with
   your GitHub login — easiest).
2. In the Render dashboard, click **New** (top right) and choose **Blueprint**.
3. **Connect your GitHub repository.** If prompted, authorize Render to access
   GitHub, then pick the repository **`bijanpishevar-maker/slack`**.
4. Render automatically reads the **`render.yaml`** file in the repo and sets up
   a web service called **move-quote** for you — you don't configure anything by
   hand.
5. Render will **prompt you for three environment variables**:
   `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_APP_TOKEN`.
   **Paste each value** into its box. (These are secret and stay in Render — they
   are never saved to GitHub.)
6. Click **Apply** (or **Create / Deploy**). Render installs everything and
   starts the app.
7. Wait a minute or two until the service status shows **"Live"**.
8. Open the **Logs** tab and look for a line like
   `⚡️ Move Quote app running (socket mode); health server on :10000`.
   When you see that, the app is connected to Slack.
9. In Slack, type **`/movequote`** in any channel to confirm it works.

That's it — the app is now running 24/7.

---

## Alternative host: Railway

Railway works much the same way if you prefer it.

1. Go to <https://railway.app> and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo** and pick
   **`bijanpishevar-maker/slack`**.
3. Open the project's **Variables** tab and add the three variables:
   `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN` (paste each
   value).
4. Railway deploys automatically. Watch the deploy logs for the
   "app running" line, then try `/movequote` in Slack.

(Railway reads the repo's `Procfile` to know how to start the app.)

---

## How to update the app later

Any time new code is pushed to the **`main`** branch on GitHub, your host
(Render or Railway) **automatically redeploys** the latest version. You don't
have to do anything in the dashboard.

---

## Troubleshooting

- **"invalid_auth" or token errors in the logs.** One of the three secrets is
  wrong or has an extra space. Re-copy it from the Slack app settings and update
  it in the host's dashboard (Render: the service's **Environment** tab;
  Railway: the **Variables** tab), then redeploy.
- **How to see what's happening.** Open the **Logs** tab in Render (or the
  deploy/service logs in Railway). The startup line confirms the app connected;
  errors show up here too.
- **`/movequote` still not responding.** Make sure the service shows **"Live"**
  and that you saw the "app running" line in the logs. Once the app is Live and
  connected, `/movequote` should work in Slack right away. If it doesn't, double
  check the Slack app has Socket Mode enabled and the slash command installed
  (see the [README](README.md)).
