import type { Octokit } from "@octokit/rest";

export async function setPullRequestLocked(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  locked: boolean,
): Promise<string> {
  if (locked) {
    await octokit.issues.lock({ owner, repo, issue_number: issueNumber });
    return `Locked conversation on PR #${issueNumber}.`;
  }
  await octokit.issues.unlock({ owner, repo, issue_number: issueNumber });
  return `Unlocked conversation on PR #${issueNumber}.`;
}