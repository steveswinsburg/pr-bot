import type { Env } from "./env.js";
import { HELP_TEXT, parseCommand } from "./commands.js";
import { createInstallationOctokit, replyOnIssue } from "./github.js";
import { rebasePullRequest } from "./handlers/rebase.js";
import { rerunPullRequestWorkflows } from "./handlers/rerun.js";
import { markPullRequestReady } from "./handlers/ready.js";
import { pullRequestStatus } from "./handlers/status.js";

export interface IssueCommentPayload {
  action: string;
  installation?: { id: number };
  repository: { name: string; owner: { login: string } };
  issue: {
    number: number;
    pull_request?: { url: string };
  };
  comment: {
    body: string;
    user?: { login?: string; type?: string };
  };
}

function isOwnBotComment(env: Env, login: string | undefined): boolean {
  if (!login) return false;
  const slug = (env.GITHUB_APP_SLUG ?? "pr-bot").toLowerCase();
  const lower = login.toLowerCase();
  return lower === slug || lower === `${slug}[bot]`;
}

export async function handleIssueComment(
  env: Env,
  payload: IssueCommentPayload,
): Promise<void> {
  if (payload.action !== "created") return;
  if (!payload.issue.pull_request) return;
  if (!payload.installation?.id) return;
  if (isOwnBotComment(env, payload.comment.user?.login)) return;

  const command = parseCommand(payload.comment.body);
  if (!command) {
    if (/@prbot\b/i.test(payload.comment.body)) {
      const octokit = createInstallationOctokit(env, payload.installation.id);
      const { owner, name: repo } = payload.repository;
      await replyOnIssue(
        octokit,
        owner.login,
        repo,
        payload.issue.number,
        `Unknown command. ${HELP_TEXT}`,
      );
    }
    return;
  }

  const octokit = createInstallationOctokit(env, payload.installation.id);
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;

  let reply: string;
  switch (command.kind) {
    case "help":
      reply = HELP_TEXT;
      break;
    case "rebase":
      reply = await rebasePullRequest(octokit, owner, repo, issueNumber);
      break;
    case "rerun": {
      const { data: pull } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: issueNumber,
      });
      reply = await rerunPullRequestWorkflows(
        octokit,
        owner,
        repo,
        pull.head.sha,
        command.failedOnly,
      );
      break;
    }
    case "ready":
      reply = await markPullRequestReady(
        octokit,
        owner,
        repo,
        issueNumber,
      );
      break;
    case "status":
      reply = await pullRequestStatus(octokit, owner, repo, issueNumber);
      break;
  }

  await replyOnIssue(octokit, owner, repo, issueNumber, reply);
}
