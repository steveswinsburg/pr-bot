import type { Octokit } from "@octokit/rest";

export async function markPullRequestReady(
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
    return "This pull request is not open.";
  }

  if (!pull.draft) {
    return `PR #${pullNumber} was already open for review (not a draft).`;
  }

  try {
    await octokit.graphql(
      `
      mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            number
            isDraft
          }
        }
      }
    `,
      { pullRequestId: pull.node_id },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unauthorized") || message.includes("403")) {
      return "I don't have permission to mark this pull request ready for review.";
    }
    return `Could not mark ready for review: ${message}`;
  }

  return `PR #${pullNumber} is **ready for review**.`;
}