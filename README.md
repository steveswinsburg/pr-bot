# PR Bot

GitHub App that listens for PR comments like `@prbot rebase` and `@prbot rerun`. It runs on a [Cloudflare Worker](https://developers.cloudflare.com/workers/) and verifies GitHub webhooks with HMAC.

See [SPEC.md](./SPEC.md) for behavior and permissions.

## Commands

| Comment | Action |
|---------|--------|
| `@prbot help` | List commands |
| `@prbot rebase` | Rebase the PR branch onto its base |
| `@prbot rerun` | Re-run the latest Actions workflow for the PR HEAD commit |
| `@prbot rerun failed` | Re-run only failed jobs on that latest run |
| `@prbot ready` | Mark a draft PR ready for review |
| `@prbot status` | Table of merge state, checks, reviews, branch (with hints) |

## Create the GitHub App

1. [Register a new GitHub App](https://github.com/settings/apps/new) (name e.g. **PR Bot**).
2. **Webhook URL:** `https://<your-worker-host>/github/webhook` (set after first deploy, or use a tunnel while developing).
3. **Webhook secret:** generate one and save it for Wrangler (`GITHUB_WEBHOOK_SECRET`).
4. **Repository permissions:**
   - Pull requests: Read & write
   - Contents: Read & write
   - Issues: Read & write
   - Actions: Read & write
   - Checks: Read
5. **Subscribe to events:** **Issue comments** only (for v0.1).
6. Create and download a **private key**; note the **App ID**.

Install the app on the org/repos where you want `@prbot` to work.

## CI/CD

GitHub Actions run on every pull request and push to `master`:

- **CI** — `npm ci`, typecheck, tests, `wrangler deploy --dry-run` (bundle check).

After merge to `master`, **Deploy** runs the same checks and `wrangler deploy`. Add repository secrets:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | [API token](https://dash.cloudflare.com/profile/api-tokens) with **Workers Scripts: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from the Cloudflare dashboard |

Worker runtime secrets (`GITHUB_APP_*`) are still set with `wrangler secret put`, not via Actions.

## Develop and deploy

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in secrets
npm run dev                      # local worker (use smee.io or cloudflared for webhooks)
npm test
npm run deploy
```

Set production secrets:

```bash
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
# optional:
npx wrangler secret put GITHUB_APP_SLUG
```

Point the GitHub App webhook URL at your deployed worker and send a test delivery.

## Local webhook testing

GitHub cannot reach `localhost`. Options:

- [smee.io](https://smee.io/) — forward events to `http://127.0.0.1:8787/github/webhook`
- `cloudflared tunnel` — temporary public URL to your `wrangler dev` port

## Adding commands

1. Extend `parseCommand` in `src/commands.ts`.
2. Add a handler under `src/handlers/`.
3. Wire it in `src/issue-comment.ts`.
4. Update `HELP_TEXT` and `SPEC.md`.
