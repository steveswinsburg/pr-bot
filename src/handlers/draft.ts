import type { Octokit } from "@octokit/rest";

export async function markPullRequestDraft(
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

  if (pull.draft) {
    return `PR #${pullNumber} is already a **draft**.`;
  }

  try {
    await octokit.graphql(
      `
      mutation ConvertPullRequestToDraft($pullRequestId: ID!) {
        convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
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
      return "I don't have permission to convert this pull request to draft.";
    }
    return `Could not mark as draft: ${message}`;
  }

  return `PR #${pullNumber} is now a **draft**.`;
}