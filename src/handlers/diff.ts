import type { Octokit } from "@octokit/rest";

type CompareFile = {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
};

export function formatDiffSummary(
  files: CompareFile[],
  baseRef: string,
  headRef: string,
): string {
  if (files.length === 0) {
    return `No file changes between \`${headRef}\` and \`${baseRef}\`.`;
  }

  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }

  const ranked = [...files].sort(
    (a, b) =>
      b.additions + b.deletions - (a.additions + a.deletions) ||
      a.filename.localeCompare(b.filename),
  );
  const top = ranked.slice(0, 10);
  const paths = top
    .map((f) => `- \`${f.filename}\` (+${f.additions}/-${f.deletions})`)
    .join("\n");
  const more =
    files.length > 10
      ? `\n_…and ${files.length - 10} more file(s)._`
      : "";

  return `**Diff** vs \`${baseRef}\`: **${files.length}** file${files.length === 1 ? "" : "s"}, **+${additions}** / **-${deletions}** lines.

${paths}${more}`;
}

export async function pullRequestDiff(
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

  try {
    const { data: compare } = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pull.base.ref}...${pull.head.ref}`,
    });
    return formatDiffSummary(
      (compare.files ?? []) as CompareFile[],
      pull.base.ref,
      pull.head.ref,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Could not compute diff: ${message}`;
  }
}