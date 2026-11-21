import { describe, expect, it } from "vitest";
import { shouldSkipResolve } from "../src/handlers/resolve";

describe("shouldSkipResolve", () => {
  it("skips only when head is current with base and no overlapping edits", () => {
    expect(shouldSkipResolve(0, 0, 0)).toBe(true);
    expect(shouldSkipResolve(1, 0, 0)).toBe(false);
    expect(shouldSkipResolve(0, 2, 0)).toBe(false);
    expect(shouldSkipResolve(0, 0, 1)).toBe(false);
    expect(shouldSkipResolve(3, 0, 0)).toBe(false);
  });
});