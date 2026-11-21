import type { Octokit } from "@octokit/rest";

const DEFAULT_LIMIT = 20;

type ListCommit = {
  sha: string;
  commit: { message: string };
};

export function formatCommitList(
  commits: ListCommit[],
  limit = DEFAULT_LIMIT,
): string {
  if (commits.length === 0) {
    return "No commits on this pull request.";
  }
  const shown = commits.slice(0, limit);
  const lines = shown.map((c) => {
    const subject = c.commit.message.split("\n")[0]?.trim() || "(empty message)";
    return `- \`${c.sha.slice(0, 7)}\` ${subject}`;
  });
  if (commits.length > limit) {
    lines.push(
      `_Showing ${limit} of ${commits.length} commits — list truncated._`,
    );
  }
  return lines.join("\n");
}

export async function pullRequestCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const commits: ListCommit[] = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });
    commits.push(...data);
    if (data.length < 100) break;
    page += 1;
  }

  const header = `**Commits** on PR #${pullNumber} (${commits.length} total):\n\n`;
  return header + formatCommitList(commits);
}