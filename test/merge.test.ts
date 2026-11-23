import { describe, expect, it, vi } from "vitest";
import { mergeFailureMessage, mergePullRequest } from "../src/handlers/merge.js";

function mockOctokit(pull: {
  state: string;
  draft: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  head: { sha: string };
  base: { ref: string };
}) {
  return {
    pulls: {
      get: vi.fn().mockResolvedValue({ data: pull }),
      checkIfMerged: vi.fn().mockRejectedValue({ status: 404 }),
      merge: vi.fn().mockResolvedValue({
        data: { merged: true, sha: "abc1234567890", message: "merged" },
      }),
    },
    request: vi.fn(),
  };
}

describe("mergeFailureMessage", () => {
  it("explains app bypass setup when bypass merge is blocked", () => {
    const msg = mergeFailureMessage("Repository rule violations found", true);
    expect(msg).toContain("GitHub App");
    expect(msg).toContain("bypass list");
  });

  it("suggests merge now when normal merge is blocked", () => {
    const msg = mergeFailureMessage("At least 1 approving review is required", false);
    expect(msg).toContain("@prbot merge now");
  });
});

describe("mergePullRequest", () => {
  it("merges via REST when bypass is false", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: false,
      mergeable: true,
      mergeable_state: "clean",
      head: { sha: "deadbeef" },
      base: { ref: "main" },
    });
    const msg = await mergePullRequest(octokit as never, "o", "r", 42, {
      bypass: false,
      triggeredBy: "alice",
    });
    expect(msg).toContain("Merged PR #42");
    expect(octokit.pulls.merge).toHaveBeenCalledWith(
      expect.objectContaining({
        pull_number: 42,
        sha: "deadbeef",
        commit_message: expect.stringContaining("@alice"),
      }),
    );
    expect(octokit.request).not.toHaveBeenCalled();
  });

  it("uses merge-async with bypass_rules when merge now", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: false,
      mergeable: true,
      mergeable_state: "blocked",
      head: { sha: "cafebabe" },
      base: { ref: "main" },
    });
    octokit.request.mockResolvedValue({
      status: 200,
      data: {
        status: "merged",
        details: { sha: "1111222233334444" },
      },
    });

    const msg = await mergePullRequest(octokit as never, "o", "r", 7, {
      bypass: true,
      mergeMethod: "squash",
      triggeredBy: "bob",
    });

    expect(msg).toContain("rules bypass");
    expect(octokit.request).toHaveBeenCalledWith(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
      expect.objectContaining({
        pull_number: 7,
        bypass_rules: true,
        merge_action: "direct_merge",
        merge_method: "squash",
      }),
    );
    expect(octokit.pulls.merge).not.toHaveBeenCalled();
  });

  it("rejects draft pull requests", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: true,
      head: { sha: "x" },
      base: { ref: "main" },
    });
    const msg = await mergePullRequest(octokit as never, "o", "r", 1, {
      bypass: false,
    });
    expect(msg).toContain("draft");
    expect(octokit.pulls.merge).not.toHaveBeenCalled();
  });
});