import type { StatusSnapshot } from "./types.js";

function titleCaseMergeState(state: string | null): string {
  if (!state) return "Unknown";
  return state.replace(/_/g, " ").toUpperCase();
}

function formatChecksLine(checks: StatusSnapshot["checks"]): string {
  if (checks.length === 0) return "_No checks reported on the latest commit._";
  return checks
    .map((c) => {
      const icon =
        c.display === "ok"
          ? "✅"
          : c.display === "fail"
            ? "❌"
            : c.display === "pending"
              ? "⏳"
              : "⚪";
      const suffix =
        c.display === "fail"
          ? " failed"
          : c.display === "pending"
            ? " in progress"
            : "";
      return `${icon} \`${c.name}\`${suffix}`;
    })
    .join(" · ");
}

function mergeAction(snapshot: StatusSnapshot): string {
  if (snapshot.mergeable === null) {
    return "GitHub is still computing mergeability — try again in a minute.";
  }
  const state = snapshot.mergeState?.toLowerCase();
  if (snapshot.draft) return "Use `@prbot ready` when you want review.";
  if (state === "dirty") return "Resolve merge conflicts with the base branch.";
  if (state === "blocked" || state === "unstable") {
    return "Address failing checks, reviews, or branch protection below.";
  }
  if (state === "behind" || (snapshot.behindBy ?? 0) > 0) {
    return "Update the branch (e.g. `@prbot rebase`).";
  }
  if (state === "clean") return "Nothing blocking from merge state.";
  return "—";
}

function reviewsCell(snapshot: StatusSnapshot): { state: string; action: string } {
  if (snapshot.changesRequested) {
    return {
      state: "**Changes requested**",
      action: "Push updates and re-request review when ready.",
    };
  }
  const n = snapshot.approvingReviewCount;
  const label = n === 1 ? "1 approving review" : `${n} approving reviews`;
  if (n === 0) {
    return {
      state: "**Review required** (0 on record)",
      action: "Ask reviewers via GitHub (CODEOWNERS / assignments).",
    };
  }
  return {
    state: label,
    action: "Confirm branch protection approval count in the repo settings.",
  };
}

function branchCell(snapshot: StatusSnapshot): { state: string; action: string } {
  if (snapshot.behindBy != null && snapshot.behindBy > 0) {
    return {
      state: `**Behind** \`${snapshot.baseRef}\` by ${snapshot.behindBy} commit${snapshot.behindBy === 1 ? "" : "s"}`,
      action: "Use `@prbot rebase` if you want it updated.",
    };
  }
  const state = snapshot.mergeState?.toLowerCase();
  if (state === "behind") {
    return {
      state: `**Behind** \`${snapshot.baseRef}\``,
      action: "Use `@prbot rebase` if you want it updated.",
    };
  }
  return { state: `Up to date with \`${snapshot.baseRef}\``, action: "—" };
}

function checksAction(snapshot: StatusSnapshot): string {
  const failed = snapshot.checks.some((c) => c.display === "fail");
  const pending = snapshot.checks.some((c) => c.display === "pending");
  if (failed && pending) {
    return "Fix failures; `@prbot rerun` or `@prbot rerun failed` for CI.";
  }
  if (failed) return "`@prbot rerun` or `@prbot rerun failed` to retry CI.";
  if (pending) return "Wait for in-progress checks to finish.";
  return "—";
}

function draftCell(snapshot: StatusSnapshot): { state: string; action: string } {
  if (snapshot.draft) {
    return { state: "Yes", action: "`@prbot ready` when ready for review." };
  }
  return { state: "No", action: "`@prbot draft` to mark as draft." };
}

export function formatStatusMessage(snapshot: StatusSnapshot): string {
  const mergeLabel =
    snapshot.mergeable === null
      ? "**Computing…**"
      : `**${titleCaseMergeState(snapshot.mergeState)}**`;

  const reviews = reviewsCell(snapshot);
  const branch = branchCell(snapshot);
  const draft = draftCell(snapshot);

  const lines = [
    `### PR #${snapshot.pullNumber} — status`,
    "",
    "| Item | State | Action |",
    "| --- | --- | --- |",
    `| Merge | ${mergeLabel} | ${mergeAction(snapshot)} |`,
    `| Draft | ${draft.state} | ${draft.action} |`,
    `| Checks | ${formatChecksLine(snapshot.checks)} | ${checksAction(snapshot)} |`,
    `| Reviews | ${reviews.state} | ${reviews.action} |`,
    `| Branch | ${branch.state} | ${branch.action} |`,
  ];

  return lines.join("\n");
}
