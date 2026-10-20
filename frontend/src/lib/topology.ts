import type { DeviceData, NetworkData } from "../services/api";

export function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function inNetwork(ip: string, net: NetworkData): boolean {
  const addr = ipToInt(ip);
  const base = ipToInt(net.network_address);
  if (addr === null || base === null) return false;
  const bits = net.prefix_length;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((addr & mask) >>> 0) === ((base & mask) >>> 0);
}

/** Device id -> the most specific network that contains it. */
export function assignNetworks(
  devices: DeviceData[],
  networks: NetworkData[],
): Map<number, NetworkData> {
  const byPrefix = [...networks].sort((a, b) => b.prefix_length - a.prefix_length);
  const out = new Map<number, NetworkData>();
  for (const d of devices) {
    const net = byPrefix.find((n) => inNetwork(d.ip_address, n));
    if (net) out.set(d.id, net);
  }
  return out;
}

export function compareIp(a: string, b: string): number {
  return (ipToInt(a) ?? 0) - (ipToInt(b) ?? 0);
}
