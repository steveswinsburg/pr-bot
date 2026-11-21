import { describe, expect, it } from "vitest";
import { formatDiffSummary } from "../src/handlers/diff.js";

describe("formatDiffSummary", () => {
  it("summarizes counts and top files", () => {
    const files = [
      { filename: "a.ts", additions: 10, deletions: 2, status: "modified" },
      { filename: "b.ts", additions: 1, deletions: 1, status: "modified" },
    ];
    const out = formatDiffSummary(files, "main", "feat");
    expect(out).toContain("**2** files");
    expect(out).toContain("**+11**");
    expect(out).toContain("**-3**");
    expect(out).toContain("`a.ts`");
  });

  it("handles no files", () => {
    expect(formatDiffSummary([], "main", "feat")).toContain("No file changes");
  });
});