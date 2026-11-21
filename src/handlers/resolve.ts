import type { Octokit } from "@octokit/rest";

export type ResolveStrategy = "merge" | "ours" | "theirs";

type RepoRef = { owner: string; repo: string };

const PERMISSION_ERROR =
  "I don't have permission to update this branch. The app needs **Contents: Read & write** on this repo (and on the head repo for forks).";

function isPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("unauthorized") ||
    lower.includes("403") ||
    lower.includes("permission")
  );
}

function headCompareRef(pull: { head: { repo: { full_name?: string; owner: { login: string } }; sha: string }; base: { repo: { full_name?: string } } }): string {
  const headRepo = pull.head.repo.full_name;
  const baseRepo = pull.base.repo.full_name;
  if (headRepo && baseRepo && headRepo !== baseRepo) {
    return `${pull.head.repo.owner.login}:${pull.head.sha}`;
  }
  return pull.head.sha;
}

/** Decide whether automatic resolve has nothing to merge. */
export function shouldSkipResolve(
  behindBy: number,
  baseChangeCount: number,
  conflictPathCount: number,
): boolean {
  return behindBy === 0 && baseChangeCount === 0 && conflictPathCount === 0;
}

/** Tip of the base branch (live), not pull.base.sha from pulls.get (can be stale). */
async function getLiveBaseSha(
  octokit: Octokit,
  pull: {
    base: {
      ref: string;
      repo: { owner: { login: string }; name: string };
    };
  },
): Promise<string> {
  const { data } = await octokit.repos.getBranch({
    owner: pull.base.repo.owner.login,
    repo: pull.base.repo.name,
    branch: pull.base.ref,
  });
  return data.commit.sha;
}

async function getOpenPull(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const { data: pull } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  if (pull.state !== "open") {
    return { error: "This pull request is not open." as const };
  }
  return { pull };
}

async function mergeUpdateBranch(
  octokit: Octokit,
  pullRequestId: string,
  expectedHeadOid: string,
): Promise<{ ok: true } | { ok: false; conflict: boolean; message: string }> {
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
      { pullRequestId, expectedHeadOid: expectedHeadOid },
    );
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isPermissionError(message)) {
      return { ok: false, conflict: false, message: PERMISSION_ERROR };
    }
    const conflict =
      message.toLowerCase().includes("conflict") || message.includes("422");
    return { ok: false, conflict, message };
  }
}

function compareFilePath(file: {
  filename: string;
  previous_filename?: string;
  status: string;
}): string {
  if (file.status === "renamed" && file.previous_filename) {
    return file.filename;
  }
  return file.filename;
}

async function listCompareFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
) {
  const files: { path: string; status: string; previous?: string }[] = [];
  let page = 1;
  for (;;) {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
      per_page: 100,
      page,
    });
    for (const file of data.files ?? []) {
      files.push({
        path: compareFilePath(file),
        status: file.status,
        previous:
          file.status === "renamed" ? file.previous_filename : undefined,
      });
    }
    if ((data.files?.length ?? 0) < 100) break;
    page += 1;
  }
  return files;
}

async function blobShaAtRef(
  octokit: Octokit,
  ref: RepoRef,
  path: string,
  sha: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path,
      ref: sha,
    });
    if (Array.isArray(data)) return null;
    if (data.type !== "file") return null;
    return data.sha;
  } catch {
    return null;
  }
}

async function resolveWithStrategy(
  octokit: Octokit,
  pullRepo: RepoRef,
  pull: Awaited<ReturnType<typeof getOpenPull>>["pull"] & object,
  strategy: "ours" | "theirs",
): Promise<string> {
  if (!pull.head.repo) {
    return "The head repository is unavailable (fork deleted?) - cannot update the branch.";
  }

  const head: RepoRef & { ref: string; sha: string } = {
    owner: pull.head.repo.owner.login,
    repo: pull.head.repo.name,
    ref: pull.head.ref,
    sha: pull.head.sha,
  };
  const baseSha = await getLiveBaseSha(octokit, pull);
  const headRef = headCompareRef(pull);

  const { data: compareRange } = await octokit.repos.compareCommits({
    owner: pullRepo.owner,
    repo: pullRepo.repo,
    base: baseSha,
    head: headRef,
  });
  const mergeBaseSha = compareRange.merge_base_commit.sha;
  const behindBy = compareRange.behind_by ?? 0;

  const baseChanges = await listCompareFiles(
    octokit,
    pullRepo.owner,
    pullRepo.repo,
    mergeBaseSha,
    baseSha,
  );
  const headChanges = await listCompareFiles(
    octokit,
    pullRepo.owner,
    pullRepo.repo,
    mergeBaseSha,
    headRef,
  );

  const headTouched = new Set(headChanges.map((f) => f.path));
  const baseTouched = new Set(baseChanges.map((f) => f.path));
  const conflictPaths = new Set(
    [...headTouched].filter((path) => baseTouched.has(path)),
  );

  if (shouldSkipResolve(behindBy, baseChanges.length, conflictPaths.size)) {
    return "The base branch has no new changes to merge in - nothing to resolve.";
  }

  const { data: headCommit } = await octokit.git.getCommit({
    owner: head.owner,
    repo: head.repo,
    commit_sha: head.sha,
  });

  const treeUpdates: {
    path: string;
    mode: "100644";
    type: "blob";
    sha: string | null;
  }[] = [];

  const pickRef: RepoRef & { sha: string } =
    strategy === "ours"
      ? { owner: head.owner, repo: head.repo, sha: head.sha }
      : {
          owner: pull.base.repo.owner.login,
          repo: pull.base.repo.name,
          sha: baseSha,
        };

  for (const file of baseChanges) {
    const inConflict = conflictPaths.has(file.path);

    if (file.status === "removed" && !inConflict) {
      treeUpdates.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: null,
      });
      continue;
    }

    if (file.status === "removed" && inConflict) {
      if (strategy === "ours") {
        const blob = await blobShaAtRef(octokit, head, file.path, head.sha);
        if (!blob) {
          treeUpdates.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: null,
          });
        } else {
          treeUpdates.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob,
          });
        }
      } else {
        treeUpdates.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
      }
      continue;
    }

    const path = file.path;
    if (inConflict || !headTouched.has(path)) {
      const blob = await blobShaAtRef(octokit, pickRef, path, pickRef.sha);
      if (!blob) {
        return `Could not read \`${path}\` while merging - resolve conflicts manually.`;
      }
      treeUpdates.push({ path, mode: "100644", type: "blob", sha: blob });
    }

    if (file.previous) {
      treeUpdates.push({
        path: file.previous,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }
  }

  if (treeUpdates.length === 0) {
    return "No automatic merge changes to apply. Try `@prbot rebase` or resolve conflicts locally.";
  }

  const { data: newTree } = await octokit.git.createTree({
    owner: head.owner,
    repo: head.repo,
    base_tree: headCommit.tree.sha,
    tree: treeUpdates,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: head.owner,
    repo: head.repo,
    message: `Merge ${pull.base.ref} into ${head.ref} (@prbot resolve ${strategy})`,
    tree: newTree.sha,
    parents: [head.sha, baseSha],
  });

  await octokit.git.updateRef({
    owner: head.owner,
    repo: head.repo,
    ref: `refs/heads/${head.ref}`,
    sha: newCommit.sha,
  });

  const winner =
    strategy === "ours" ? "PR branch (head)" : "base branch";
  const conflictNote =
    conflictPaths.size > 0
      ? ` Resolved ${conflictPaths.size} overlapping file(s) using **${strategy}** (${winner} wins on conflicts).`
      : "";
  return `Merged \`${pull.base.ref}\` into \`${head.ref}\` and updated the branch.${conflictNote}`;
}

export async function resolvePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  strategy: ResolveStrategy,
): Promise<string> {
  const result = await getOpenPull(octokit, owner, repo, pullNumber);
  if ("error" in result) return result.error ?? "This pull request is not open.";
  const { pull } = result;
  if (!pull.node_id) {
    return "Could not read this pull request from GitHub.";
  }

  if (strategy === "ours" || strategy === "theirs") {
    try {
      return await resolveWithStrategy(octokit, { owner, repo }, pull, strategy);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isPermissionError(message)) return PERMISSION_ERROR;
      return `Could not resolve automatically: ${message}`;
    }
  }

  // GraphQL updatePullRequestBranch expects the current head OID only (not pull.base.sha).
  const merge = await mergeUpdateBranch(
    octokit,
    pull.node_id,
    pull.head.sha,
  );
  if (merge.ok) {
    return `Merged latest \`${pull.base.ref}\` into this branch (same as **Update branch** on GitHub).`;
  }

  if (merge.conflict) {
    try {
      const refreshed = await getOpenPull(octokit, owner, repo, pullNumber);
      if ("error" in refreshed) {
        return refreshed.error ?? "This pull request is not open.";
      }
      return await resolveWithStrategy(
        octokit,
        { owner, repo },
        refreshed.pull,
        "ours",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isPermissionError(message)) return PERMISSION_ERROR;
      return `Could not resolve conflicts automatically: ${message} Try \`@prbot resolve theirs\` or fix conflicts locally.`;
    }
  }

  if (merge.message === PERMISSION_ERROR) return PERMISSION_ERROR;
  return `Could not update branch: ${merge.message}`;
}