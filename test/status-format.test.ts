import { describe, expect, it } from "vitest";
import { formatStatusMessage } from "../src/status/format.js";
import type { StatusSnapshot } from "../src/status/types.js";

const base: StatusSnapshot = {
  pullNumber: 42,
  draft: false,
  mergeable: false,
  mergeState: "blocked",
  baseRef: "main",
  behindBy: 3,
  checks: [
    { name: "ci/lint", display: "fail" },
    { name: "ci/test", display: "ok" },
    { name: "deploy-preview", display: "pending" },
  ],
  approvingReviewCount: 0,
  changesRequested: false,
};

describe("formatStatusMessage", () => {
  it("renders a status table with actionable hints", () => {
    const md = formatStatusMessage(base);
    expect(md).toContain("### PR #42 - status");
    expect(md).toContain("| Merge | **BLOCKED** |");
    expect(md).toContain("ci/lint");
    expect(md).toContain("Review required");
    expect(md).toContain("@prbot rebase");
    expect(md).toContain("@prbot rerun");
  });

  it("suggests ready for drafts", () => {
    const md = formatStatusMessage({ ...base, draft: true, mergeState: "blocked" });
    expect(md).toContain("| Draft | Yes |");
    expect(md).toContain("@prbot ready");
  });
});
