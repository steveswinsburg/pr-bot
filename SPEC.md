# PR Bot - specification (v0.1)

## Objective

A GitHub App named **PR Bot** that reacts to `@prbot <command>` in pull request conversation comments and performs maintainer actions on that PR.

## Boundaries

| In scope (v0.1) | Out of scope (later) |
|---|---|
| `issue_comment` on PRs | Slash commands, CLI, Slack |
| `@prbot rebase` | Label bots, merge queues |
| `@prbot rerun` (latest Actions run on PR HEAD) | Org-wide policy engine |
| `@prbot help` | Review comment threads (inline) |
| Webhook HMAC verification | Per-repo command ACLs |

## Commands

Mentions are case-insensitive. Extra text on the line is allowed after the command (ignored).

| Command | Behavior |
|---|---|
| `help` | Reply with available commands |
| `rebase` | Rebase the PR branch onto its base via GraphQL `updatePullRequestBranch` (`updateMethod: REBASE`) |
| `resolve` | Merge the latest base into the PR branch via GraphQL `updatePullRequestBranch` (`updateMethod: MERGE`, same as GitHub “Update branch”); on merge conflict, attempt automatic resolution keeping the PR branch on overlapping files. Otherwise suggests `resolve ours` / `resolve theirs`. |
| `resolve ours` | Merge base into head via Git Data API; on files changed on both sides since the merge-base, keep the head (PR branch) version. |
| `resolve theirs` | Same as `resolve ours`, but keep the base version on overlapping files. |
| `rerun` | Re-run the most recent workflow run for the PR’s HEAD commit |
| `rerun failed` | Re-run only failed jobs on that run (if the run failed) |
| `ready` | Mark a draft PR ready for review |
| `draft` | Convert an open PR back to draft |
| `status` | Reply with a markdown table: merge state, draft, checks, reviews, branch (with suggested `@prbot` actions) |
| `commits` | Compact list: 7-char sha and first line of each commit on the PR (up to 20, with truncation note) |
| `changelog` | Markdown bullet list of first-line commit messages on the PR branch since the merge base (compare API) |
| `diff` | Short compare summary vs base: file count, total +/- lines, top 10 changed paths |
| `lock` | Lock the pull request conversation (`issues.lock`) |
| `unlock` | Unlock the pull request conversation (`issues.unlock`) |
| `update` | If the PR branch is behind its base, merge the base into the head via GraphQL `updatePullRequestBranch` (`updateMethod: MERGE`); if clean/up-to-date, say so; if dirty/conflicted, suggest resolving locally |
| `merge` | Merge the open PR via REST `pulls.merge` when repository rules are satisfied; optional third token: `merge`, `squash`, or `rebase` (repo default if omitted) |
| `merge now` | Same merge, but REST `pulls/merge-async` with `bypass_rules: true` and `merge_action: direct_merge` so the **GitHub App** may bypass rules it is allowed to bypass (not the comment author’s personal admin bypass) |
| `force-merge` | Alias for `merge now` |

Triggers only when the comment **action** is `created` and the sender is not this app’s bot user.

### Merge and rules bypass

Merges run with the installation token (the app identity). A maintainer checking **Merge without waiting for requirements to be met** on github.com uses their user account; `@prbot merge now` only works when this **GitHub App** is on the target branch ruleset bypass list (`Integration` actor, `bypass_mode: pull_request` recommended) or legacy branch protection bypass apps. OAuth on behalf of the commenter is out of scope for v0.1.

Successful merges append a short note to the merge commit body: who triggered `@prbot` and whether bypass was requested. Bypass merges reply with a visible warning.

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

Optional: `GITHUB_APP_SLUG` - bot login to ignore self-comments (defaults to `pr-bot`).

## Success criteria

1. Valid webhook signature required; invalid signature → `401`.
2. `@prbot rebase` on an open PR starts a rebase and posts a short acknowledgment comment.
3. `@prbot rerun` re-runs the latest Actions workflow for the PR HEAD SHA.
4. `@prbot status` summarizes blockers in a table with next-step hints.
5. Unknown commands get a helpful reply without throwing.
