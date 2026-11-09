import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands.js";

describe("parseCommand", () => {
  it("ignores comments without mention", () => {
    expect(parseCommand("please rebase")).toBeNull();
  });

  it("parses rebase", () => {
    expect(parseCommand("@prbot rebase")).toEqual({ kind: "rebase" });
    expect(parseCommand("@PRBot  rebase please")).toEqual({ kind: "rebase" });
  });

  it("parses rerun variants", () => {
    expect(parseCommand("@prbot rerun")).toEqual({
      kind: "rerun",
      failedOnly: false,
    });
    expect(parseCommand("@prbot rerun failed")).toEqual({
      kind: "rerun",
      failedOnly: true,
    });
  });

  it("returns null for unknown verb", () => {
    expect(parseCommand("@prbot shipit")).toBeNull();
  });

  it("defaults bare mention to help", () => {
    expect(parseCommand("@prbot")).toEqual({ kind: "help" });
  });

  it("parses ready", () => {
    expect(parseCommand("@prbot ready")).toEqual({ kind: "ready" });
  });

  it("parses status", () => {
    expect(parseCommand("@prbot status")).toEqual({ kind: "status" });
  });

  it("parses draft", () => {
    expect(parseCommand("@prbot draft")).toEqual({ kind: "draft" });
  });
});
