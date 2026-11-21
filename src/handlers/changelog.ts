import type { Octokit } from "@octokit/rest";

type CompareCommit = {
  commit: { message: string };
};

export function formatChangelog(commits: CompareCommit[]): string {
  if (commits.length === 0) {
    return "No commits on this branch beyond the merge base.";
  }
  return commits
    .map((c) => {
      const line = c.commit.message.split("\n")[0]?.trim() || "(empty message)";
      return `- ${line}`;
    })
    .join("\n");
}

export async function pullRequestChangelog(
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

  let compare;
  try {
    const res = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pull.base.ref}...${pull.head.ref}`,
    });
    compare = res.data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Could not compare branches: ${message}`;
  }

  const header = `**Changelog** (\`${pull.head.ref}\` vs \`${pull.base.ref}\`, ${compare.commits?.length ?? 0} commit${compare.commits?.length === 1 ? "" : "s"}):\n\n`;
  return header + formatChangelog(compare.commits ?? []);
}