# Update alerts (Web Push)

After a Production deploy that ships a new app version, the server sends one
push notification to the devices that opted in: "Version X is ready. Open the
app to update." Tapping it opens the app, and the existing update prompt takes
over.

How it works:

- A phone taps "Notify me about updates" in My kitchen. The app posts its push
  subscription to `/api/push/subscribe`.
- All state lives in one private Vercel Blob file, `push/state.json`: the
  subscriptions, the last push, and a daily write counter. No database.
- `.github/workflows/notify-update.yml` runs after each Production deploy. If
  the version in `package.json` has no git tag yet, it waits until `/sw.js` on
  the live site shows that version, calls `/api/push/notify`, then pushes the
  tag `v<version>`. Data only deploys (the weekly scraper) keep the same
  version, so they never notify.

## One time setup

Needs the Vercel CLI (`vercel`) and the GitHub CLI (`gh`), both logged in. The
secrets are in `~/.config/mob-recipes/push-secrets.env` as `KEY=value` lines
(`VAPID_PRIVATE_KEY`, `NOTIFY_SECRET`). The commands below read them without
printing them.

1. Create a private Blob store and connect it to the project. Either use the
   dashboard (Project, Storage tab, Create Database, Blob, choose Private,
   connect to this project, all environments), or run:

   ```sh
   vercel blob create-store mob-recipes-push --access private
   ```

   and then connect the store to the project in the dashboard (Storage tab).
   Connecting injects `BLOB_READ_WRITE_TOKEN` into the project.

2. Set the two secrets on Vercel Production, then redeploy:

   ```sh
   (
     set -a; . ~/.config/mob-recipes/push-secrets.env; set +a
     printf %s "$VAPID_PRIVATE_KEY" | vercel env add VAPID_PRIVATE_KEY production
     printf %s "$NOTIFY_SECRET" | vercel env add NOTIFY_SECRET production
   )
   vercel --prod
   ```

   (Or redeploy from the Vercel dashboard: Deployments, latest, Redeploy.)

3. Give the same notify secret to GitHub Actions:

   ```sh
   ( set -a; . ~/.config/mob-recipes/push-secrets.env; set +a
     printf %s "$NOTIFY_SECRET" | gh secret set NOTIFY_SECRET --repo mihailo1/mob-recipes )
   ```

4. On each phone: open the site in Safari or Chrome, add it to the Home Screen
   (iOS only delivers push to installed web apps), open the installed app, go
   to My kitchen, and tap "Notify me about updates". Allow notifications when
   asked.

Until step 3 is done the workflow prints "Update alerts are not set up" and
exits green. Until steps 1 and 2 are done `/api/push/status` reports
`configured: false` and the app cannot subscribe.

## Test it

GitHub, Actions, "Notify update", Run workflow. Tick `force` to bypass the 24h
limit and the already-sent check, and to ignore an existing version tag. Then
read the "Send push" step: the JSON line shows `sent` with a delivered count, or
`skipped` with a reason (`daily-limit`, `already-sent`, `no-devices`).

Without `force` a manual run behaves like a deploy: it does nothing if the
current version already has a tag.

## Limits

- 5 devices at most (`MAX_DEVICES`). A 6th device gets HTTP 409 `device-limit`
  (`/api/push/status` reports `full: true`).
- At most one push per 24 hours overall (`PUSH_GAP_MS`). The server decides,
  not the workflow. A second new version within 24 hours is skipped
  (`daily-limit`) and its tag is still created, so it will not be sent later.
  Use `force` to send anyway.
- At most 20 Blob writes per UTC day (`MAX_WRITES_PER_DAY`), counted in the
  state file. Subscribing again with the same subscription writes nothing.
  Past the budget, subscribe and unsubscribe return HTTP 429 `rate-limit`.
  Sending a push is always allowed.
- Vercel Hobby Blob free allowance per month: 2,000 advanced operations (every
  write is one) and 10,000 simple operations (every read is one). If you go
  over, Blob is blocked for 30 days with no charge. Push alerts then report as
  not configured until the block ends.

## Remove devices

- From the phone: turn the toggle off in My kitchen (sends `DELETE
  /api/push/subscribe`).
- Everything at once: delete the `push/state.json` file in the Blob store
  (dashboard, Storage, the store, Browse). The next subscribe creates it again.

## Troubleshooting

- A device that uninstalled the app or revoked permission is answered with
  404 or 410 by its push service. The next notify run removes it from the
  list automatically. That device must turn the toggle on again.
- `/api/push/status` returns `configured: false`: check that
  `BLOB_READ_WRITE_TOKEN` and `VAPID_PRIVATE_KEY` exist on Vercel Production
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
  instead of Blob (not in production, git ignored). Delete it to reset.
