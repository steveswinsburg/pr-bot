import type { Octokit } from "@octokit/rest";

export async function rebasePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const { data: pull } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  if (pull.state !== "open") {
    return "This pull request is not open — nothing to rebase.";
  }

  const pullRequestId = pull.node_id;

  try {
    await octokit.graphql(
      `
      mutation RebasePullRequest($pullRequestId: ID!) {
        updatePullRequestBranch(
          input: { pullRequestId: $pullRequestId, updateMethod: REBASE }
        ) {
          pullRequest {
            number
          }
        }
      }
    `,
      { pullRequestId },
    );
    return `Rebasing PR #${pullNumber} onto \`${pull.base.ref}\`… (this may take a minute).`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unauthorized") || message.includes("403")) {
      return "I don't have permission to update this branch. The app needs **Contents: Read & write** on this repo (and on the head repo for forks).";
    }
    if (message.includes("422") || message.toLowerCase().includes("conflict")) {
      return "Could not rebase — the branch may be up to date, blocked by rules, or has conflicts. Resolve conflicts locally if needed.";
    }
    return `Rebase failed: ${message}`;
  }
}
