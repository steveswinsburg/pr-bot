<p align="center">
  <img src="./assets/bender.png" alt="PR Bot" width="160" />
</p>

# PR Bot

[![CI](https://github.com/steveswinsburg/pr-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/steveswinsburg/pr-bot/actions/workflows/ci.yml)
[![Workers Builds](https://img.shields.io/github/check-runs/steveswinsburg/pr-bot/master?label=Workers%20Builds&logo=cloudflare&color=F38020)](https://github.com/steveswinsburg/pr-bot/actions)
[![Pages](https://github.com/steveswinsburg/pr-bot/actions/workflows/pages/pages-build-deployment/badge.svg)](https://steveswinsburg.github.io/pr-bot/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://github.com/steveswinsburg/pr-bot/blob/master/tsconfig.json)

GitHub App that listens for PR comments like `@prbot rebase` and `@prbot rerun`. It runs on a [Cloudflare Worker](https://developers.cloudflare.com/workers/) and verifies GitHub webhooks with HMAC.

See [SPEC.md](./SPEC.md) for behavior and permissions.

**Landing page:** [steveswinsburg.github.io/pr-bot/](https://steveswinsburg.github.io/pr-bot/) (source in [`docs/`](./docs/)).

## Commands

| Comment | Action |
|---------|--------|
| `@prbot help` | List commands |
| `@prbot rebase` | Rebase the PR branch onto its base |
| `@prbot rerun` | Re-run the latest Actions workflow for the PR HEAD commit |
| `@prbot rerun failed` | Re-run only failed jobs on that latest run |
| `@prbot ready` | Mark a draft PR ready for review |
| `@prbot draft` | Convert an open PR back to draft |
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

## CI

GitHub Actions run on every pull request and push to `master`: `npm ci`, typecheck, tests, and `wrangler deploy --dry-run` (bundle check).

Production deploys are handled in **Cloudflare** (Workers Builds / your Cloudflare pipeline), not GitHub Actions.

## Deploy on Cloudflare

Use **Workers Builds** to deploy this repo on push to your default branch:

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) go to **Workers & Pages** → **Create** → **Create Worker** (or use an existing Worker).
2. Open the Worker → **Settings** → **Builds** → **Connect** your GitHub account and select **this repository**.
3. Set **Production branch** to `master` (or your default). **Root directory** `/`. **Build command:**

   ```bash
   npm ci && npx wrangler deploy
   ```

4. Under **Settings → Variables and secrets**, add the [production secrets](#develop-and-deploy) (`GITHUB_APP_ID`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY` as **PKCS#8** PEM, optional `GITHUB_APP_SLUG`). Secrets are not in git; set them in the dashboard or with `npx wrangler secret put`.
5. Run a build (push to the production branch or **Retry deployment**). Your URL is on the Worker overview, e.g. `https://pr-bot.<your-subdomain>.workers.dev`.
6. In the [GitHub App](https://github.com/settings/apps), set **Webhook URL** to `https://<that-host>/github/webhook`.

`wrangler.jsonc` names the Worker (`pr-bot` by default) and includes a `previews` block for branch preview deploys on pull requests. For preview secrets, use **Previews Base** in the Worker settings or `wrangler preview base-config secret put`.

**CLI only:** `npm install`, configure `.dev.vars`, then `npm run deploy` after `npx wrangler login`.

### Private repositories

You can connect a **private** fork or copy of this repo to Workers Builds. When installing the [Cloudflare Workers & Pages](https://github.com/apps/cloudflare-workers-and-pages) GitHub App, choose **Only select repositories** and grant access only to repos that should deploy. Your source stays private; Cloudflare clones it to build. The Worker itself is still served on a public `https://<name>.<subdomain>.workers.dev` URL so GitHub can deliver webhooks (unless you add separate access controls in front of the Worker).

### Multiple deployments

Each live bot is **one Cloudflare Worker + one GitHub App**:

| Piece | Per deployment |
|--------|----------------|
| Worker | Separate project in Cloudflare (its own hostname) |
| `wrangler.jsonc` `name` | Matches that Worker’s name in the dashboard |
| Secrets | `GITHUB_*` for **that** app, on **that** Worker |
| GitHub App | Own App ID, webhook URL → `https://<that-host>/github/webhook` |
| Repos to `@prbot` | Install **that** app only on orgs/repos you intend |

Repeat the [Deploy on Cloudflare](#deploy-on-cloudflare) steps for each instance (e.g. your team’s Worker and a customer’s). You can use this public repo as upstream and maintain a private repo per customer connected to its own Worker.

### Worker name per deployment

The `name` in `wrangler.jsonc` is the Worker’s identity in Cloudflare (`pr-bot` by default). For Workers Builds, the Worker you create in the dashboard should use the **same name** (Builds can override via CI when connected).

**Separate Workers from one repo** - use [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/) and point each Cloudflare “connect repo” project at the right deploy command:

```jsonc
{
  "name": "pr-bot",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-07",
  "previews": {},
  "env": {
    "acme": {
      "name": "pr-bot-acme"
    }
  }
}
```

- Default production: `npm ci && npx wrangler deploy` → Worker **`pr-bot`**
- Acme instance: create Worker **`pr-bot-acme`**, set deploy command to `npm ci && npx wrangler deploy --env acme` → Worker **`pr-bot-acme`** (`https://pr-bot-acme.<subdomain>.workers.dev`)

CLI: `npx wrangler deploy --name pr-bot-acme` overrides the config name for one-off deploys.

Branch **previews** (`npx wrangler preview`, `previews` in config) reuse the **same** Worker project with per-branch URLs; they do not create a new top-level Worker name.

### Cloudflare comments on pull requests

Two different comment sources:

| Bot | When |
|-----|------|
| **cloudflare-workers-and-pages** | Workers Builds runs (especially **preview builds** on PRs): posts deploy status and preview URLs on the PR |
| **Your GitHub App** | Someone comments `@prbot …` on a PR where the app is installed and the webhook hits your Worker |

On a **private** repo, Cloudflare’s build comments are visible only to people who can access that repo; they do not publish your code. There is currently **no** dashboard option to keep preview deploys but disable only those Cloudflare PR comments ([tracked request](https://github.com/cloudflare/developer-platform/issues/126)). To avoid them, turn off **Preview builds** under Worker **Settings → Build → Branch control** (preview URLs stop too). Production builds on your default branch are unaffected.

Set optional secret **`GITHUB_APP_SLUG`** to your app’s slug so the bot recognizes `@<slug>[bot]` mentions and ignores its own comments correctly.

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

- [smee.io](https://smee.io/) - forward events to `http://127.0.0.1:8787/github/webhook`
- `cloudflared tunnel` - temporary public URL to your `wrangler dev` port

## Adding commands

1. Extend `parseCommand` in `src/commands.ts`.
2. Add a handler under `src/handlers/`.
3. Wire it in `src/issue-comment.ts`.
4. Update `HELP_TEXT` and `SPEC.md`.
