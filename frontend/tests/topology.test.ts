import { describe, expect, it } from "vitest";
import { assignNetworks, inNetwork } from "../src/lib/topology";
import type { DeviceData, NetworkData } from "../src/services/api";

const net = (id: number, addr: string, prefix: number): NetworkData => ({
  id,
  network_address: addr,
  prefix_length: prefix,
  vlan_id: null,
  vlan_name: null,
  gateway_ip: null,
  device_count: 0,
});
const dev = (id: number, ip: string) => ({ id, ip_address: ip }) as DeviceData;

describe("topology helpers", () => {
  it("matches addresses to CIDRs", () => {
    expect(inNetwork("172.25.0.3", net(1, "172.25.0.0", 16))).toBe(true);
    expect(inNetwork("172.26.0.3", net(1, "172.25.0.0", 16))).toBe(false);
    expect(inNetwork("not-an-ip", net(1, "172.25.0.0", 16))).toBe(false);
  });
  it("puts a device in the most specific subnet", () => {
    const wide = net(1, "10.0.0.0", 8);
    const narrow = net(2, "10.1.2.0", 24);
    const m = assignNetworks([dev(1, "10.1.2.5"), dev(2, "10.9.9.9"), dev(3, "192.168.1.1")], [wide, narrow]);
    expect(m.get(1)).toBe(narrow);
    expect(m.get(2)).toBe(wide);
    expect(m.has(3)).toBe(false);
  });
});
