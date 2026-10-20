import { describe, expect, it } from "vitest";
import {
  deviceType,
  displayName,
  formatDuration,
  formatRelative,
  parseApiDate,
  sortedTypeCounts,
} from "../src/lib/devices";

describe("parseApiDate", () => {
  it("reads zone-less API timestamps as UTC, not local time", () => {
    expect(parseApiDate("2026-10-20T09:48:51")).toBe(Date.UTC(2026, 9, 20, 9, 48, 51));
    expect(parseApiDate("2026-10-20T09:48:51.322838")).toBe(Date.UTC(2026, 9, 20, 9, 48, 51, 322));
  });
  it("keeps an explicit zone", () => {
    expect(parseApiDate("2026-10-20T12:00:00+03:00")).toBe(Date.UTC(2026, 9, 20, 9, 0, 0));
    expect(parseApiDate("2026-10-20T09:00:00Z")).toBe(Date.UTC(2026, 9, 20, 9, 0, 0));
  });
});

describe("formatRelative", () => {
  const now = Date.UTC(2026, 9, 20, 10, 0, 0);
  it("measures from UTC", () => {
    expect(formatRelative("2026-10-20T09:59:40", now)).toBe("just now");
    expect(formatRelative("2026-10-20T09:15:00", now)).toBe("45m ago");
    expect(formatRelative("2026-10-20T07:00:00", now)).toBe("3h ago");
    expect(formatRelative("2026-10-19T09:00:00", now)).toBe("yesterday");
  });
  it("handles missing values", () => {
    expect(formatRelative(null, now)).toBe("-");
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration("2026-10-20T09:48:51", "2026-10-20T09:53:03")).toBe("4m 12s");
  });
  it("is null while a scan has no end", () => {
    expect(formatDuration("2026-10-20T09:48:51", null)).toBeNull();
  });
});

describe("device types", () => {
  it("orders infrastructure first and drops zero counts", () => {
    expect(sortedTypeCounts({ endpoint: 5, router: 1, server: 0, firewall: 2 })).toEqual([
      ["firewall", 2],
      ["router", 1],
      ["endpoint", 5],
    ]);
  });
  it("falls back for unknown types", () => {
    expect(deviceType("toaster").label).toBe("toaster");
    expect(deviceType(null).type).toBe("unknown");
  });
  it("shows sysName, else the short hostname, else the IP", () => {
    expect(displayName({ sys_name: "core-sw-01", hostname: "x.lan", ip_address: "10.0.0.2" })).toBe("core-sw-01");
    expect(displayName({ sys_name: null, hostname: "pg-1.fix_netmap", ip_address: "10.0.0.2" })).toBe("pg-1");
    expect(displayName({ sys_name: null, hostname: null, ip_address: "10.0.0.2" })).toBe("10.0.0.2");
  });
});
