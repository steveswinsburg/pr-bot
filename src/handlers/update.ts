import type { Octokit } from "@octokit/rest";

export async function updatePullRequest(
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
    return "This pull request is not open - nothing to update.";
  }

  const mergeState = pull.mergeable_state;

  if (mergeState === "dirty" || pull.mergeable === false) {
    return (
      "This branch has merge conflicts with the base. Resolve conflicts locally and push, then try `@prbot update` again."
    );
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

  const needsUpdate = behindBy > 0 || mergeState === "behind";

  if (!needsUpdate && (mergeState === "clean" || behindBy === 0)) {
    return `PR #${pullNumber} is already up to date with \`${pull.base.ref}\`.`;
  }

  const pullRequestId = pull.node_id;
  const expectedHeadOid = pull.head.sha;

  try {
    await octokit.graphql(
      `
      mutation MergeUpdatePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
        updatePullRequestBranch(
          input: {
            pullRequestId: $pullRequestId
            expectedHeadOid: $expectedHeadOid
            updateMethod: MERGE
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
    return `Merging latest \`${pull.base.ref}\` into this branch${behindNote}… (this may take a minute).`;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unauthorized") || message.includes("403")) {
      return "I don't have permission to update this branch. The app needs **Contents: Read & write** on this repo (and on the head repo for forks).";
    }
    if (message.includes("422") || message.toLowerCase().includes("conflict")) {
      return "Could not update the branch - merge conflicts with the base. Resolve conflicts locally and push, then try again.";
    }
    return `Update failed: ${message}`;
  }
}