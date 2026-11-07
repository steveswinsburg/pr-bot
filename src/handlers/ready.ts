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

  await octokit.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    draft: false,
  });

  return `PR #${pullNumber} is **ready for review**.`;
}
