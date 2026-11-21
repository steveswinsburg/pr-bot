import { describe, expect, it } from "vitest";
import { formatCommitList } from "../src/handlers/commits.js";

describe("formatCommitList", () => {
  const commits = Array.from({ length: 25 }, (_, i) => ({
    sha: `abcd${String(i).padStart(3, "0")}ef`,
    commit: { message: `Commit ${i}` },
  }));

  it("truncates with a note when over the limit", () => {
    const out = formatCommitList(commits, 20);
    expect(out).toContain("`abcd000` Commit 0");
    expect(out).toContain("Showing 20 of 25 commits");
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(20);
  });

  it("handles empty list", () => {
    expect(formatCommitList([])).toBe("No commits on this pull request.");
  });
});