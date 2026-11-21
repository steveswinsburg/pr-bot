import { describe, expect, it } from "vitest";
import { formatChangelog } from "../src/handlers/changelog.js";

describe("formatChangelog", () => {
  it("formats commit first lines as bullets", () => {
    expect(
      formatChangelog([
        { commit: { message: "Add feature\n\nBody" } },
        { commit: { message: "Fix bug" } },
      ]),
    ).toBe("- Add feature\n- Fix bug");
  });

  it("handles no commits", () => {
    expect(formatChangelog([])).toBe(
      "No commits on this branch beyond the merge base.",
    );
  });
});