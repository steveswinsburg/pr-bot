# PR Bot — specification (v0.1)

## Objective

A GitHub App named **PR Bot** that reacts to `@prbot <command>` in pull request conversation comments and performs maintainer actions on that PR.

## Boundaries

| In scope (v0.1) | Out of scope (later) |
|---|---|
| `issue_comment` on PRs | Slash commands, CLI, Slack |
| `@prbot rebase` | Auto-merge, label bots |
| `@prbot rerun` (latest Actions run on PR HEAD) | Org-wide policy engine |
| `@prbot help` | Review comment threads (inline) |
| Webhook HMAC verification | Per-repo command ACLs |

## Commands

Mentions are case-insensitive. Extra text on the line is allowed after the command (ignored).

| Command | Behavior |
|---|---|
| `help` | Reply with available commands |
| `rebase` | Rebase the PR branch onto its base via GraphQL `updatePullRequestBranch` (`updateMethod: REBASE`) |
| `rerun` | Re-run the most recent workflow run for the PR’s HEAD commit |
| `rerun failed` | Re-run only failed jobs on that run (if the run failed) |
| `ready` | Mark a draft PR ready for review |
| `draft` | Convert an open PR back to draft |
| `status` | Reply with a markdown table: merge state, draft, checks, reviews, branch (with suggested `@prbot` actions) |

Triggers only when the comment **action** is `created` and the sender is not this app’s bot user.

## GitHub App configuration

**Webhook URL:** `https://<your-worker>/github/webhook`

**Subscribe to events:** Issue comments

**Repository permissions**

- Pull requests: Read & write
- Contents: Read & write (required when the GitHub App must update the head branch)
- Issues: Read & write (PR conversation comments)
- Actions: Read & write (`rerun`)
- Checks: Read (`status`)

**Secrets (Wrangler)**

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM)
- `GITHUB_WEBHOOK_SECRET`

Optional: `GITHUB_APP_SLUG` — bot login to ignore self-comments (defaults to `pr-bot`).

## Success criteria

1. Valid webhook signature required; invalid signature → `401`.
2. `@prbot rebase` on an open PR starts a rebase and posts a short acknowledgment comment.
3. `@prbot rerun` re-runs the latest Actions workflow for the PR HEAD SHA.
4. `@prbot status` summarizes blockers in a table with next-step hints.
5. Unknown commands get a helpful reply without throwing.
