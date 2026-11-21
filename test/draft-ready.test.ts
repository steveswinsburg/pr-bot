import { describe, expect, it, vi } from "vitest";
import { markPullRequestDraft } from "../src/handlers/draft.js";
import { markPullRequestReady } from "../src/handlers/ready.js";

function mockOctokit(pull: {
  state: string;
  draft: boolean;
  node_id: string;
}) {
  return {
    pulls: {
      get: vi.fn().mockResolvedValue({ data: pull }),
    },
    graphql: vi.fn().mockResolvedValue({}),
  };
}

describe("markPullRequestDraft", () => {
  it("uses convertPullRequestToDraft GraphQL mutation", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: false,
      node_id: "PR_kwDO123",
    });
    const msg = await markPullRequestDraft(
      octokit as never,
      "usechippy",
      "specifications",
      900,
    );
    expect(msg).toBe("PR #900 is now a **draft**.");
    expect(octokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      { pullRequestId: "PR_kwDO123" },
    );
  });

  it("skips mutation when already draft", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: true,
      node_id: "PR_kwDO123",
    });
    const msg = await markPullRequestDraft(octokit as never, "o", "r", 1);
    expect(msg).toContain("already");
    expect(octokit.graphql).not.toHaveBeenCalled();
  });
});

describe("markPullRequestReady", () => {
  it("uses markPullRequestReadyForReview GraphQL mutation", async () => {
    const octokit = mockOctokit({
      state: "open",
      draft: true,
      node_id: "PR_kwDO456",
    });
    const msg = await markPullRequestReady(octokit as never, "o", "r", 2);
    expect(msg).toBe("PR #2 is **ready for review**.");
    expect(octokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("markPullRequestReadyForReview"),
      { pullRequestId: "PR_kwDO456" },
    );
  });
});