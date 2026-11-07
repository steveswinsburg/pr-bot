import type { Octokit } from "@octokit/rest";
import { formatStatusMessage } from "../status/format.js";
import type { CheckDisplay, CheckItem, StatusSnapshot } from "../status/types.js";

type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

function checkDisplay(
  status: string,
  conclusion: string | null | undefined,
): CheckDisplay {
  const st = status.toLowerCase();
  if (st === "queued" || st === "in_progress" || st === "waiting" || st === "pending") {
    return "pending";
  }
  switch (conclusion?.toLowerCase()) {
    case "success":
      return "ok";
    case "failure":
    case "timed_out":
    case "action_required":
      return "fail";
    case "skipped":
    case "neutral":
    case "cancelled":
      return "neutral";
    default:
      return st === "completed" ? "neutral" : "pending";
  }
}

function summarizeReviews(
  reviews: Array<{
    user: { login: string } | null;
    state: string;
    submitted_at?: string | null;
  }>,
): { approvingReviewCount: number; changesRequested: boolean } {
  const byUser = new Map<string, { state: ReviewState; at: number }>();
  for (const r of reviews) {
    const login = r.user?.login;
    if (!login) continue;
    const at = r.submitted_at ? Date.parse(r.submitted_at) : 0;
    const prev = byUser.get(login);
    if (!prev || at >= prev.at) {
      byUser.set(login, { state: r.state as ReviewState, at });
    }
  }
  let approvingReviewCount = 0;
  let changesRequested = false;
  for (const { state } of byUser.values()) {
    if (state === "APPROVED") approvingReviewCount++;
    if (state === "CHANGES_REQUESTED") changesRequested = true;
  }
  return { approvingReviewCount, changesRequested };
}

export async function pullRequestStatus(
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
    return `PR #${pullNumber} is ${pull.state} — status is only reported for open pull requests.`;
  }

  const [{ data: checkData }, { data: reviews }] = await Promise.all([
    octokit.checks.listForRef({
      owner,
      repo,
      ref: pull.head.sha,
      per_page: 100,
    }),
    octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    }),
  ]);

  const checks: CheckItem[] = checkData.check_runs.map((run) => ({
    name: run.name,
    display: checkDisplay(run.status, run.conclusion),
  }));

  checks.sort((a, b) => a.name.localeCompare(b.name));

  let behindBy: number | null = null;
  const mergeState = pull.mergeable_state;
  try {
    const { data: compare } = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pull.base.ref}...${pull.head.ref}`,
    });
    behindBy = compare.behind_by;
  } catch {
    behindBy = null;
  }

  const { approvingReviewCount, changesRequested } = summarizeReviews(reviews);

  const snapshot: StatusSnapshot = {
    pullNumber,
    draft: pull.draft ?? false,
    mergeable: pull.mergeable,
    mergeState: mergeState ?? null,
    baseRef: pull.base.ref,
    behindBy,
    checks,
    approvingReviewCount,
    changesRequested,
  };

  return formatStatusMessage(snapshot);
}
