import { describe, expect, it } from "vitest";
import { HELP_TEXT, parseCommand } from "../src/commands.js";

describe("parseCommand", () => {
  it("ignores comments without mention", () => {
    expect(parseCommand("please rebase")).toBeNull();
  });

  it("parses rebase", () => {
    expect(parseCommand("@prbot rebase")).toEqual({ kind: "rebase" });
    expect(parseCommand("@PRBot  rebase please")).toEqual({ kind: "rebase" });
  });

  it("parses resolve variants", () => {
    expect(parseCommand("@prbot resolve")).toEqual({
      kind: "resolve",
      strategy: "merge",
    });
    expect(parseCommand("@prbot resolve ours")).toEqual({
      kind: "resolve",
      strategy: "ours",
    });
    expect(parseCommand("@prbot resolve theirs please")).toEqual({
      kind: "resolve",
      strategy: "theirs",
    });
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

  it("parses lock and unlock", () => {
    expect(parseCommand("@prbot lock")).toEqual({ kind: "lock", locked: true });
    expect(parseCommand("@prbot unlock")).toEqual({ kind: "lock", locked: false });
  });

  it("parses update", () => {
    expect(parseCommand("@prbot update")).toEqual({ kind: "update" });
  });

  it("parses help", () => {
    expect(parseCommand("@prbot help")).toEqual({ kind: "help" });
    expect(parseCommand("@prbot /help")).toEqual({ kind: "help" });
  });

  it("only parses when the mention leads the comment", () => {
    expect(parseCommand("Unknown command. @prbot help")).toBeNull();
    expect(parseCommand(`Unknown command. ${HELP_TEXT}`)).toBeNull();
  });

  it("parses app slug mention at start", () => {
    expect(parseCommand("@steve-pr-bot help", { appSlug: "steve-pr-bot" })).toEqual({
      kind: "help",
    });
    expect(parseCommand("@steve-pr-bot[bot] status", { appSlug: "steve-pr-bot" })).toEqual({
      kind: "status",
    });
  });
});
