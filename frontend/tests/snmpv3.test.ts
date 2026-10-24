import { describe, expect, it } from "vitest";
import { EMPTY_V3, v3Problem } from "../src/components/SnmpV3Fields";
import { formatUptime } from "../src/lib/devices";

describe("v3Problem", () => {
  const user = { ...EMPTY_V3, user: "netops" };
  it("needs a user", () => {
    expect(v3Problem(EMPTY_V3)).toMatch(/user name/);
  });
  it("accepts noAuthNoPriv", () => {
    expect(v3Problem(user)).toBeNull();
  });
  it("needs the auth password unless one is saved", () => {
    const v = { ...user, authProtocol: "sha" };
    expect(v3Problem(v)).toMatch(/auth password/);
    expect(v3Problem(v, { auth: true, priv: false })).toBeNull();
  });
  it("refuses privacy without auth", () => {
    expect(v3Problem({ ...user, privProtocol: "aes", privPassword: "abcdefgh" })).toMatch(/auth protocol/);
  });
  it("refuses passwords under 8 characters", () => {
    expect(v3Problem({ ...user, authProtocol: "sha", authPassword: "short" })).toMatch(/8 characters/);
  });
  it("accepts authPriv", () => {
    expect(
      v3Problem({ ...user, authProtocol: "sha256", authPassword: "12345678", privProtocol: "aes", privPassword: "abcdefgh" }),
    ).toBeNull();
  });
});

describe("formatUptime", () => {
  it("formats days, hours and minutes", () => {
    expect(formatUptime(3 * 86400 + 5 * 3600 + 120)).toBe("3d 5h");
    expect(formatUptime(2 * 3600 + 7 * 60)).toBe("2h 7m");
    expect(formatUptime(300)).toBe("5m");
  });
  it("returns null for missing or zero", () => {
    expect(formatUptime(null)).toBeNull();
    expect(formatUptime(0)).toBeNull();
  });
});
