import { describe, expect, it } from "vitest";
import { rebaseFailureMessage } from "../src/handlers/rebase";

describe("rebaseFailureMessage", () => {
  it("detects already up to date from API", () => {
    expect(
      rebaseFailureMessage(
        "GraphQL: There are no new commits on the base branch. (updatePullRequestBranch)",
      ),
    ).toContain("already up to date");
  });

  it("detects merge conflicts without suggesting up to date", () => {
    const msg = rebaseFailureMessage(
      "GraphQL: merge conflict between base and head (updatePullRequestBranch)",
    );
    expect(msg).toContain("merge conflicts");
    expect(msg.toLowerCase()).not.toContain("up to date");
  });

  it("detects stale head sha", () => {
    expect(
      rebaseFailureMessage(
        "GraphQL: expected head sha didn't match current head ref (updatePullRequestBranch)",
      ),
    ).toContain("branch changed");
  });

  it("uses a branch-rules message for generic 422", () => {
    const msg = rebaseFailureMessage("Request failed with status code 422");
    expect(msg).toContain("branch rules");
    expect(msg.toLowerCase()).not.toContain("may be up to date");
  });
});