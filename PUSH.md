# Update alerts (Web Push)

After a Production deploy that ships a new app version, the server sends one
push notification to the devices that opted in: "Version X is ready. Open the
app to update." Tapping it opens the app, and the existing update prompt takes
over.

How it works:

- A phone types the access code and taps "Notify me about updates" in My
  kitchen. The app posts its push subscription to `/api/push/subscribe` with
  the code in the `x-push-code` header. Without the right code the server
  answers 401 before it reads the body or touches storage.
- All state lives in one private Vercel Blob file, `push/state.json`: the
  subscriptions, the last push, and a daily write counter. No database.
- `.github/workflows/notify-update.yml` runs after each Production deploy. If
  the version in `package.json` has no git tag yet, it waits until `/sw.js` on
  the live site shows that version, calls `/api/push/notify`, then pushes the
  tag `v<version>`. Data only deploys (the weekly scraper) keep the same
  version, so they never notify. GitHub only runs it once the workflow file is
  on the default branch.

## One time setup

Needs the Vercel CLI (`vercel`) and the GitHub CLI (`gh`), both logged in. The
secrets are in `~/.config/mob-recipes/push-secrets.env` as `KEY=value` lines
(`VAPID_PRIVATE_KEY`, `NOTIFY_SECRET`, `SUBSCRIBE_CODE`). The commands below
read them without printing them. Run them in a terminal where `node` is 20 or
newer (the system default may be too old for the Vercel CLI):

```sh
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
```

1. Create a private Blob store in the dashboard: Project, Storage tab, Create
   Database (or Create Store), Blob, choose Private, connect it to this
   project for Production. Connecting injects `BLOB_STORE_ID` (newer stores sign in
   with OIDC) or `BLOB_READ_WRITE_TOKEN` (older stores). Either works. The
   `vercel blob create-store` CLI form needs a newer CLI than 39.x, so use the
   dashboard.

2. Set the three secrets on Vercel Production. Run this from the checkout that
   is linked to the Vercel project (the one with a `.vercel` folder, for
   example `~/Projects/mob-recipes`), not from a fresh worktree:

   ```sh
   cd ~/Projects/mob-recipes
   (
     set -a; . ~/.config/mob-recipes/push-secrets.env; set +a
     printf %s "$VAPID_PRIVATE_KEY" | vercel env add VAPID_PRIVATE_KEY production
     printf %s "$NOTIFY_SECRET" | vercel env add NOTIFY_SECRET production
     printf %s "$SUBSCRIBE_CODE" | vercel env add SUBSCRIBE_CODE production
   )
   ```

   `SUBSCRIBE_CODE` is the access code. Without it anyone could fill the 5
   device slots and spend the Blob allowance, so always set it.

   Environment variables only apply to NEW deployments. The next merge to
   `main` creates one. To apply them without a code change, use the dashboard:
   Deployments, latest production deployment, Redeploy. Do not use
   `vercel --prod` for this, it uploads the local folder instead of git.

   Dashboard alternative: Settings, Environment Variables, Add, paste the
   value, tick Production only. To put one value on the clipboard without
   printing it: `grep '^NOTIFY_SECRET=' ~/.config/mob-recipes/push-secrets.env | cut -d= -f2- | tr -d '\n' | pbcopy`.

3. Give the same notify secret to GitHub Actions:

   ```sh
   ( set -a; . ~/.config/mob-recipes/push-secrets.env; set +a
     printf %s "$NOTIFY_SECRET" | gh secret set NOTIFY_SECRET --repo mihailo1/mob-recipes )
   ```

4. On each phone: open the site in Safari or Chrome, add it to the Home Screen
   (iOS only delivers push to installed web apps), open the installed app, go
   to My kitchen, type the access code once, and tap "Notify me about
   updates". Allow notifications when asked. To see the code on your Mac
   without printing the other secrets:

   ```sh
   grep '^SUBSCRIBE_CODE=' ~/.config/mob-recipes/push-secrets.env
   ```

Until step 3 is done the workflow prints "Update alerts are not set up" and
exits green. Until steps 1 and 2 are done `/api/push/status` reports
`configured: false` and the app cannot subscribe. The status endpoint reads
only env (no Blob access) and answers `{ configured, codeRequired }`.

## Test it

GitHub, Actions, "Notify update", Run workflow. Tick `force` to bypass the 24h
limit and the already-sent check, and to ignore an existing version tag. Then
read the "Send push" step: the JSON line shows `sent` with a delivered count, or
`skipped` with a reason (`already-sent`, `older-version`, `daily-limit`,
`no-devices`).

A red job with HTTP 502 (`failed`) means devices are registered but none
received the push. The version tag is not created, so fix the cause and run
the workflow manually (with `force` if the 24h window matters).

Without `force` a manual run behaves like a deploy: it does nothing if the
current version already has a tag.

## Limits

- 5 devices at most (`MAX_DEVICES`). A 6th device gets HTTP 409 `device-limit`.
- At most one push per 24 hours overall (`PUSH_GAP_MS`). The server decides,
  not the workflow. A second new version within 24 hours is skipped
  (`daily-limit`) and its tag is still created, so it will not be sent later.
  Use `force` to send anyway.
- Never an older version: if the last push was for a higher version, notify
  skips with `older-version` (for example after a rollback). `force` bypasses
  it.
- At most 20 Blob writes per UTC day (`MAX_WRITES_PER_DAY`), counted in the
  state file. Subscribing again with the same subscription writes nothing.
  Past the budget, subscribe and unsubscribe return HTTP 429 `rate-limit`.
  Sending a push is always allowed.
- Vercel Hobby Blob free allowance per month: 2,000 advanced operations (every
  write is one) and 10,000 simple operations (every read is one). If you go
  over, Blob is blocked for 30 days with no charge, and alerts silently stop
  until the block ends. Requests without the access code never reach Blob.
  Each subscribed phone re-posts its subscription at most once a day (one
  read, no write when nothing changed), which heals a wiped list.
- Writes are conditional on the ETag of the read (`ifMatch`). A conflicting
  write is retried once on a fresh read, then the route answers 503.

## Remove devices

- From the phone: turn the toggle off in My kitchen (sends `DELETE
  /api/push/subscribe`).
- Everything at once: delete the `push/state.json` file in the Blob store
  (dashboard, Storage, the store, Browse). The next subscribe creates it again.

## Troubleshooting

- A device that uninstalled the app or revoked permission is answered with
  404 or 410 by its push service. The next notify run removes it from the
  list automatically. That device must turn the toggle on again.
- Other hard errors (no response, 400, 401, 403) count against a device;
  after 3 notify runs in a row it is removed. Any success resets the count.
  429 and 5xx answers are treated as temporary and change nothing.
- The app says "That code isn't right.": `SUBSCRIBE_CODE` on Vercel differs
  from what was typed. Check it with the `grep` above.
- `/api/push/status` returns `configured: false`: check that
  `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`), `VAPID_PRIVATE_KEY` and `NOTIFY_SECRET` exist on
  Vercel Production
  and that the project was redeployed after adding them. The Blob store must
  be private. If the state file is unreadable or malformed the routes answer
  503 and never overwrite it; inspect or delete the file in the Blob browser.
- The workflow fails with 401: `NOTIFY_SECRET` differs between GitHub and
  Vercel. Set both again from the same file.
- The workflow fails at "Wait for the new version": the deploy did not reach
  the production domain within 3 minutes. Re-run it after the deploy is live.
- Push works on Android but not iOS: iOS needs iOS 16.4 or later and the app
  added to the Home Screen.
- Run `node scripts/test-push.mjs` to check the validation and limit logic.
- Local development uses a file `.push-dev-state.json` in the project root
  instead of Blob (git ignored). A local production build uses it only with
  `PUSH_ALLOW_FILE_STORE=1`, and never on Vercel. Delete it to reset.
