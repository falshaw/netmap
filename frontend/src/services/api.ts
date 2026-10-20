import axios from "axios";
import { signOut } from "../lib/auth";

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// API key is injected server-side by nginx proxy header — no client-side header needed.

// A 401/403 means the key nginx sends no longer matches the API (rotated or
// expired): end the UI session and come back here after signing in again.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      signOut();
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?expired=1&next=${encodeURIComponent(next)}`;
    }
    return Promise.reject(error);
  },
);

/** Readable message from an axios error (FastAPI puts it in `detail`). */
export function errorMessage(err: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    if (err.response) return `${fallback} (HTTP ${err.response.status})`;
    return "Cannot reach the NetMap API";
  }
  return err instanceof Error ? err.message : fallback;
}

/** Save a Blob as a file, keeping the object URL alive until the click ran. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export interface ScanRequest {
  target_ip: string;
  subnets: string[];
  snmp_community?: string;
  snmp_version: string;
  scan_nmap: boolean;
  scan_arp: boolean;
  scan_snmp: boolean;
}

export interface ScanResponse {
  id: number;
  status: string;
  progress: number;
  phase: string | null;
  target_ip: string;
  subnets: string[] | null;
  device_count: number;
  link_count: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string | null;
}

export interface InterfaceData {
  id: number;
  if_index: number | null;
  name: string | null;
  description: string | null;
  ip_address: string | null;
  subnet_mask: string | null;
  mac_address: string | null;
  speed_mbps: number | null;
  mtu: number | null;
  admin_status: string | null;
  oper_status: string | null;
  vlan_id: number | null;
  utilization_in: number | null;
  utilization_out: number | null;
}

export interface DeviceData {
  id: number;
  ip_address: string;
  hostname: string | null;
  mac_address: string | null;
  vendor: string | null;
  device_type: string;
  os_family: string | null;
  os_version: string | null;
  sys_name: string | null;
  sys_descr: string | null;
  sys_location: string | null;
  snmp_reachable: boolean;
  position_x: number | null;
  position_y: number | null;
  interfaces: InterfaceData[];
}

export interface LinkData {
  id: number;
  source_device_id: number;
  target_device_id: number;
  source_interface_id: number | null;
  target_interface_id: number | null;
  discovery_method: string | null;
  bandwidth_mbps: number | null;
  link_type: string | null;
}

export interface NetworkData {
  id: number;
  network_address: string;
  prefix_length: number;
  vlan_id: number | null;
  vlan_name: string | null;
  gateway_ip: string | null;
  device_count: number;
}

export interface TopologyData {
  scan_id: number;
  devices: DeviceData[];
  links: LinkData[];
  networks: NetworkData[];
  stats: {
    device_count: number;
    link_count: number;
    network_count: number;
    device_types: Record<string, number>;
  };
}

export interface SettingsData {
  snmp_community: string;
  snmp_version: string;
  snmp_port: number;
  snmp_timeout: number;
  snmp_retries: number;
  default_scan_nmap: boolean;
  default_scan_arp: boolean;
  default_scan_snmp: boolean;
  // LLM / API configuration
  llm_provider: string;
  llm_ollama_host: string;
  llm_ollama_model: string;
  llm_claude_model: string;
  // Notification preferences
  notify_enabled: boolean;
  notify_webhook_url: string;
  notify_on_scan_complete: boolean;
  notify_on_scan_failed: boolean;
}

export interface LLMTestRequest {
  llm_provider?: string;
  llm_ollama_host?: string;
  llm_ollama_model?: string;
  llm_claude_model?: string;
}

export interface LLMTestResult {
  ok: boolean;
  provider: string;
  model: string;
  detail: string;
  model_available: boolean | null;
}

export interface DeviceChange {
  ip_address: string;
  hostname: string | null;
  device_type: string;
  vendor: string | null;
  change_type: "added" | "removed" | "changed";
  changes?: Record<string, { from: string; to: string }>;
}

export interface LinkChange {
  source_ip: string;
  target_ip: string;
  discovery_method: string | null;
  change_type: "added" | "removed" | "changed";
}

export interface ScanDiffData {
  scan_a_id: number;
  scan_b_id: number;
  devices_added: DeviceChange[];
  devices_removed: DeviceChange[];
  devices_changed: DeviceChange[];
  devices_unchanged: number;
  links_added: LinkChange[];
  links_removed: LinkChange[];
  links_changed: LinkChange[];
  links_unchanged: number;
}

export interface StatsData {
  total_scans: number;
  total_devices: number;
  device_types: Record<string, number>;
}

export const api = {
  createScan: async (data: ScanRequest): Promise<ScanResponse> => {
    const res = await client.post("/scans", data);
    return res.data;
  },

  listScans: async (limit = 20): Promise<ScanResponse[]> => {
    const res = await client.get("/scans", { params: { limit } });
    return res.data;
  },

  getScan: async (id: number): Promise<ScanResponse> => {
    const res = await client.get(`/scans/${id}`);
    return res.data;
  },

  deleteScan: async (id: number): Promise<void> => {
    await client.delete(`/scans/${id}`);
  },

  getTopology: async (scanId: number): Promise<TopologyData> => {
    const res = await client.get(`/scans/${scanId}/topology`);
    return res.data;
  },

  updatePositions: async (
    scanId: number,
    positions: { device_id: number; x: number; y: number }[],
  ): Promise<void> => {
    await client.put(`/scans/${scanId}/positions`, { positions });
  },

  exportDrawio: async (scanId: number): Promise<void> => {
    const res = await client.get(`/scans/${scanId}/export/drawio`, {
      responseType: "blob",
    });
    saveBlob(res.data, `netmap-scan-${scanId}.drawio`);
  },

  compareScan: async (idA: number, idB: number): Promise<ScanDiffData> => {
    const res = await client.get(`/scans/${idA}/compare/${idB}`);
    return res.data;
  },

  getSettings: async (): Promise<SettingsData> => {
    const res = await client.get("/settings");
    return res.data;
  },

  updateSettings: async (
    data: Partial<SettingsData>,
  ): Promise<SettingsData> => {
    const res = await client.put("/settings", data);
    return res.data;
  },

  testLLMConnection: async (
    data: LLMTestRequest,
  ): Promise<LLMTestResult> => {
    const res = await client.post("/settings/llm/test", data);
    return res.data;
  },

  getStats: async (): Promise<StatsData> => {
    const res = await client.get("/stats");
    return res.data;
  },
};
