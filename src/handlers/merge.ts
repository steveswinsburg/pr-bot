import type { Octokit } from "@octokit/rest";

export type PullMergeMethod = "merge" | "squash" | "rebase";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map merge API failures to user-facing text. */
export function mergeFailureMessage(
  apiMessage: string,
  bypass: boolean,
): string {
  const lower = apiMessage.toLowerCase();
  if (
    lower.includes("pull request is not mergeable") ||
    lower.includes("not mergeable") ||
    lower.includes("merge conflict")
  ) {
    return "Could not merge - this branch has conflicts or is not mergeable. Resolve conflicts locally and push, then try again.";
  }
  if (lower.includes("draft")) {
    return "This pull request is still a draft. Use `@prbot ready` first.";
  }
  if (
    bypass &&
    (lower.includes("protected") ||
      lower.includes("rule") ||
      lower.includes("required") ||
      lower.includes("403") ||
      lower.includes("405") ||
      lower.includes("blocking"))
  ) {
    return (
      "Could not bypass repository rules to merge.\n\n" +
      "PR Bot merges as the **GitHub App**, not as the comment author. " +
      "Personal admin bypass on the website does not apply here.\n\n" +
      "To allow `@prbot merge now`, add this app to the target branch ruleset **bypass list** " +
      "(actor type **Integration**, bypass mode **pull request**). " +
      "If **Do not allow bypassing** is enabled for administrators, the app must still be an explicit bypass actor.\n\n" +
      "Otherwise merge from GitHub when checks and reviews pass, or use `@prbot merge` without `now`."
    );
  }
  if (
    !bypass &&
    (lower.includes("protected") ||
      lower.includes("rule") ||
      lower.includes("required") ||
      lower.includes("403") ||
      lower.includes("405"))
  ) {
    return (
      "Merge blocked by repository rules (reviews, checks, or other requirements).\n\n" +
      "Fix blockers and try again, or if maintainers may bypass rules for this app, use `@prbot merge now` " +
      "(requires the app on the ruleset bypass list)."
    );
  }
  return `Merge failed: ${apiMessage}`;
}

function auditCommitMessage(triggeredBy: string | undefined, bypass: boolean): string {
  const who = triggeredBy ? `@${triggeredBy}` : "a collaborator";
  const via = bypass ? "@prbot merge now (rules bypass requested)" : "@prbot merge";
  return `${via} by ${who}`;
}

type MergeAsyncResponse = {
  status?: string;
  details?: {
    message?: string;
    sha?: string;
    uuid?: string;
  };
};

async function pollAsyncMerge(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  uuid: string,
): Promise<{ ok: true; sha?: string } | { ok: false; message: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await delay(750);
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}",
      {
        owner,
        repo,
        pull_number: pullNumber,
        uuid,
      },
    );
    const body = data as MergeAsyncResponse;
    const status = body.status?.toLowerCase();
    if (status === "merged") {
      return { ok: true, sha: body.details?.sha };
    }
    if (status === "failed") {
      return {
        ok: false,
        message: body.details?.message ?? "Asynchronous merge failed.",
      };
    }
  }
  return {
    ok: false,
    message:
      "Merge is still running in the background. Refresh the pull request in a minute.",
  };
}

async function mergeWithBypass(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
  mergeMethod: PullMergeMethod | undefined,
  triggeredBy: string | undefined,
): Promise<string> {
  const { status, data } = await octokit.request(
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
    {
      owner,
      repo,
      pull_number: pullNumber,
      sha: headSha,
      merge_action: "direct_merge",
      bypass_rules: true,
      merge_method: mergeMethod,
      commit_message: auditCommitMessage(triggeredBy, true),
    },
  );

  const body = data as MergeAsyncResponse;
  const mergedSha = body.details?.sha;

  if (status === 200 || body.status?.toLowerCase() === "merged") {
    const shaNote = mergedSha ? ` (merge commit \`${mergedSha.slice(0, 7)}\`)` : "";
    return (
      `**Warning:** Merged PR #${pullNumber} with **rules bypass**${shaNote}. ` +
      "Required reviews, checks, or other rules may have been skipped. " +
      "Verify the change before relying on it."
    );
  }

  const uuid = body.details?.uuid;
  if ((status === 202 || body.status?.toLowerCase() === "pending") && uuid) {
    const result = await pollAsyncMerge(octokit, owner, repo, pullNumber, uuid);
    if (result.ok) {
      const shaNote = result.sha ? ` (merge commit \`${result.sha.slice(0, 7)}\`)` : "";
      return (
        `**Warning:** Merged PR #${pullNumber} with **rules bypass**${shaNote}. ` +
        "Required reviews, checks, or other rules may have been skipped."
      );
    }
    return mergeFailureMessage(result.message, true);
  }

  return mergeFailureMessage(body.details?.message ?? "Unexpected merge response.", true);
}

export async function mergePullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  options: {
    bypass: boolean;
    mergeMethod?: PullMergeMethod;
    triggeredBy?: string;
  },
): Promise<string> {
  const { bypass, mergeMethod, triggeredBy } = options;

  const { data: pull } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  if (pull.merged) {
    return `PR #${pullNumber} is already merged.`;
  }

  if (pull.state !== "open") {
    return "This pull request is not open.";
  }

  if (pull.draft) {
    return "This pull request is a draft. Use `@prbot ready` before merging.";
  }

  if (pull.mergeable === false || pull.mergeable_state === "dirty") {
    return "This branch has merge conflicts. Resolve conflicts locally and push, then try again.";
  }

  try {
    await octokit.pulls.checkIfMerged({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return `PR #${pullNumber} is already merged.`;
  } catch {
    // 404 = not merged yet
  }

  try {
    if (bypass) {
      return await mergeWithBypass(
        octokit,
        owner,
        repo,
        pullNumber,
        pull.head.sha,
        mergeMethod,
        triggeredBy,
      );
    }

    const { data: result } = await octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      sha: pull.head.sha,
      merge_method: mergeMethod,
      commit_message: auditCommitMessage(triggeredBy, false),
    });

    if (result.merged) {
      const shaNote = result.sha ? ` Merge commit \`${result.sha.slice(0, 7)}\`.` : "";
      return `Merged PR #${pullNumber} into \`${pull.base.ref}\`.${shaNote}`;
    }
    return mergeFailureMessage(result.message ?? "Merge was not applied.", false);
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" &&
            err !== null &&
            "message" in err &&
            typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : String(err);
    if (message.includes("unauthorized") || message.includes("403")) {
      return mergeFailureMessage(message, bypass);
    }
    return mergeFailureMessage(message, bypass);
  }
}