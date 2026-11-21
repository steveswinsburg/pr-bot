import type { Octokit } from "@octokit/rest";

/** Map GraphQL `updatePullRequestBranch` (REBASE) failures to user-facing text. */
export function rebaseFailureMessage(apiMessage: string): string {
  const lower = apiMessage.toLowerCase();
  if (lower.includes("no new commits on the base branch")) {
    return "This branch is already up to date with the base — nothing to rebase.";
  }
  if (lower.includes("merge conflict between base and head")) {
    return "Could not rebase - merge conflicts with the base. Resolve conflicts locally and push, then try again.";
  }
  if (
    lower.includes("expected head") ||
    lower.includes("head sha didn't match") ||
    lower.includes("head ref")
  ) {
    return "Rebase could not start - the branch changed while I was checking. Try `@prbot rebase` again.";
  }
  if (apiMessage.includes("422") || lower.includes("conflict")) {
    return "Could not rebase - this may be blocked by branch rules. Resolve conflicts locally if the branch is behind.";
  }
  return `Rebase failed: ${apiMessage}`;
}

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
    return "This pull request is not open - nothing to rebase.";
  }

  const mergeState = pull.mergeable_state;

  if (mergeState === "dirty" || pull.mergeable === false) {
    return "This branch has merge conflicts with the base. Resolve conflicts locally and push, then try `@prbot rebase` again.";
  }

  let behindBy = 0;
  try {
    const { data: compare } = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pull.base.ref}...${pull.head.ref}`,
    });
    behindBy = compare.behind_by ?? 0;
  } catch {
    behindBy = 0;
  }

  const needsRebase = behindBy > 0 || mergeState === "behind";

  if (!needsRebase && (mergeState === "clean" || behindBy === 0)) {
    return `PR #${pullNumber} is already up to date with \`${pull.base.ref}\` — nothing to rebase.`;
  }

  const pullRequestId = pull.node_id;
  const expectedHeadOid = pull.head.sha;

  try {
    await octokit.graphql(
      `
      mutation RebasePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
        updatePullRequestBranch(
          input: {
            pullRequestId: $pullRequestId
            expectedHeadOid: $expectedHeadOid
            updateMethod: REBASE
          }
        ) {
          pullRequest {
            number
          }
        }
      }
    `,
      { pullRequestId, expectedHeadOid },
    );
    const behindNote =
      behindBy > 0
        ? ` (${behindBy} commit${behindBy === 1 ? "" : "s"} behind \`${pull.base.ref}\`)`
        : "";
    return `Rebasing PR #${pullNumber} onto \`${pull.base.ref}\`${behindNote}… (this may take a minute).`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unauthorized") || message.includes("403")) {
      return "I don't have permission to update this branch. The app needs **Contents: Read & write** on this repo (and on the head repo for forks).";
    }
    return rebaseFailureMessage(message);
  }
}