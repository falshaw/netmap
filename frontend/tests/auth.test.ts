import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/auth";

describe("safeNextPath", () => {
  it("returns app paths unchanged", () => {
    expect(safeNextPath("/topology/4")).toBe("/topology/4");
    expect(safeNextPath("/scan?poll=3")).toBe("/scan?poll=3");
  });
  it("defaults to the dashboard", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("/")).toBe("/dashboard");
    expect(safeNextPath("/login?next=/x")).toBe("/dashboard");
  });
  it("never redirects off-site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    // "/\evil.example": browsers treat the backslash like a slash.
    expect(safeNextPath("/" + String.fromCharCode(92) + "evil.example")).toBe("/dashboard");
  });
});
