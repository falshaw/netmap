"""Pydantic request/response schemas for API routes"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
import ipaddress


# SNMPv3 protocol names the scanner understands ("" or None = not used).
SNMP_V3_AUTH_PROTOCOLS = ("md5", "sha", "sha224", "sha256")
SNMP_V3_PRIV_PROTOCOLS = ("des", "3des", "aes", "aes128", "aes192", "aes256")


def _check_v3_protocol(v: Optional[str], allowed: tuple[str, ...], field: str) -> Optional[str]:
    if v is None or v == "":
        return v
    v = v.lower()
    if v not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(allowed)}")
    return v


class ScanRequest(BaseModel):
    target_ip: str
    subnets: list[str] = []
    snmp_community: Optional[str] = None
    # None = use the default saved in Settings (falls back to 2c / 161).
    snmp_version: Optional[str] = None
    snmp_port: Optional[int] = Field(default=None, ge=1, le=65535)
    # SNMPv3 USM credentials; unset fields come from Settings.
    snmp_v3_user: Optional[str] = Field(default=None, max_length=100)
    snmp_v3_auth_protocol: Optional[str] = None
    snmp_v3_auth_password: Optional[str] = Field(default=None, max_length=200)
    snmp_v3_priv_protocol: Optional[str] = None
    snmp_v3_priv_password: Optional[str] = Field(default=None, max_length=200)
    scan_nmap: bool = True
    scan_arp: bool = True
    scan_snmp: bool = True

    @field_validator("snmp_v3_auth_protocol")
    @classmethod
    def validate_v3_auth(cls, v: Optional[str]) -> Optional[str]:
        return _check_v3_protocol(v, SNMP_V3_AUTH_PROTOCOLS, "snmp_v3_auth_protocol")

    @field_validator("snmp_v3_priv_protocol")
    @classmethod
    def validate_v3_priv(cls, v: Optional[str]) -> Optional[str]:
        return _check_v3_protocol(v, SNMP_V3_PRIV_PROTOCOLS, "snmp_v3_priv_protocol")

    @field_validator("target_ip")
    @classmethod
    def validate_target_ip(cls, v: str) -> str:
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")
        return v

    @field_validator("subnets")
    @classmethod
    def validate_subnets(cls, v: list[str]) -> list[str]:
        for subnet in v:
            try:
                net = ipaddress.ip_network(subnet, strict=False)
            except ValueError:
                raise ValueError(f"Invalid subnet: {subnet}")
            if net.prefixlen == 32:
                raise ValueError(f"Single-host /32 networks are not valid scan targets: {subnet}")
        return v

    @field_validator("snmp_version")
    @classmethod
    def validate_snmp_version(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ("1", "2c", "3"):
            raise ValueError("snmp_version must be 1, 2c, or 3")
        return v


class ScanResponse(BaseModel):
    id: int
    status: str
    progress: int
    phase: Optional[str] = None
    target_ip: str
    subnets: Optional[list[str]] = None
    device_count: int = 0
    link_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InterfaceResponse(BaseModel):
    id: int
    if_index: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    mac_address: Optional[str] = None
    speed_mbps: Optional[int] = None
    mtu: Optional[int] = None
    admin_status: Optional[str] = None
    oper_status: Optional[str] = None
    vlan_id: Optional[int] = None
    utilization_in: Optional[float] = None
    utilization_out: Optional[float] = None

    class Config:
        from_attributes = True


class DeviceResponse(BaseModel):
    id: int
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    device_type: str = "unknown"
    os_family: Optional[str] = None
    os_version: Optional[str] = None
    sys_name: Optional[str] = None
    sys_descr: Optional[str] = None
    sys_object_id: Optional[str] = None
    sys_location: Optional[str] = None
    sys_contact: Optional[str] = None
    uptime_seconds: Optional[int] = None
    snmp_reachable: bool = False
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    interfaces: list[InterfaceResponse] = []

    class Config:
        from_attributes = True


class LinkResponse(BaseModel):
    id: int
    source_device_id: int
    target_device_id: int
    source_interface_id: Optional[int] = None
    target_interface_id: Optional[int] = None
    discovery_method: Optional[str] = None
    bandwidth_mbps: Optional[int] = None
    link_type: Optional[str] = None

    class Config:
        from_attributes = True


class NetworkResponse(BaseModel):
    id: int
    network_address: str
    prefix_length: int
    vlan_id: Optional[int] = None
    vlan_name: Optional[str] = None
    gateway_ip: Optional[str] = None
    device_count: int = 0
    position_x: Optional[float] = None
    position_y: Optional[float] = None

    class Config:
        from_attributes = True


class TopologyResponse(BaseModel):
    scan_id: int
    devices: list[DeviceResponse]
    links: list[LinkResponse]
    networks: list[NetworkResponse]
    stats: dict


_LLM_PROVIDERS = ("ollama", "claude")
_CLAUDE_MODELS = ("haiku", "sonnet", "opus")


class SettingsResponse(BaseModel):
    snmp_community: str = "public"
    snmp_version: str = "2c"
    snmp_port: int = 161
    snmp_timeout: int = 5
    snmp_retries: int = 2
    # SNMPv3: the passwords are write-only; the API only says whether one is saved.
    snmp_v3_user: str = ""
    snmp_v3_auth_protocol: str = ""
    snmp_v3_auth_password_set: bool = False
    snmp_v3_priv_protocol: str = ""
    snmp_v3_priv_password_set: bool = False
    default_scan_nmap: bool = True
    default_scan_arp: bool = True
    default_scan_snmp: bool = True
    # LLM / API configuration
    llm_provider: str = "ollama"
    llm_ollama_host: str = ""  # blank = OLLAMA_HOST from .env
    llm_ollama_model: str = ""  # blank = OLLAMA_MODEL from .env
    llm_claude_model: str = "sonnet"
    # Notification preferences
    notify_enabled: bool = False
    notify_webhook_url: str = ""
    notify_on_scan_complete: bool = True
    notify_on_scan_failed: bool = True

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None
    snmp_port: Optional[int] = Field(default=None, ge=1, le=65535)
    snmp_timeout: Optional[int] = Field(default=None, ge=1, le=30)
    snmp_retries: Optional[int] = Field(default=None, ge=0, le=10)
    # SNMPv3: a password left out keeps the saved one, "" clears it.
    snmp_v3_user: Optional[str] = Field(default=None, max_length=100)
    snmp_v3_auth_protocol: Optional[str] = None
    snmp_v3_auth_password: Optional[str] = Field(default=None, max_length=200)
    snmp_v3_priv_protocol: Optional[str] = None
    snmp_v3_priv_password: Optional[str] = Field(default=None, max_length=200)
    default_scan_nmap: Optional[bool] = None
    default_scan_arp: Optional[bool] = None
    default_scan_snmp: Optional[bool] = None
    # LLM / API configuration
    llm_provider: Optional[str] = None
    llm_ollama_host: Optional[str] = None
    llm_ollama_model: Optional[str] = None
    llm_claude_model: Optional[str] = None
    # Notification preferences
    notify_enabled: Optional[bool] = None
    notify_webhook_url: Optional[str] = Field(default=None, max_length=500)
    notify_on_scan_complete: Optional[bool] = None
    notify_on_scan_failed: Optional[bool] = None

    @field_validator("snmp_version")
    @classmethod
    def validate_snmp_version(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("1", "2c", "3"):
            raise ValueError("snmp_version must be 1, 2c, or 3")
        return v

    @field_validator("snmp_v3_auth_protocol")
    @classmethod
    def validate_v3_auth(cls, v: Optional[str]) -> Optional[str]:
        return _check_v3_protocol(v, SNMP_V3_AUTH_PROTOCOLS, "snmp_v3_auth_protocol")

    @field_validator("snmp_v3_priv_protocol")
    @classmethod
    def validate_v3_priv(cls, v: Optional[str]) -> Optional[str]:
        return _check_v3_protocol(v, SNMP_V3_PRIV_PROTOCOLS, "snmp_v3_priv_protocol")

    @field_validator("llm_provider")
    @classmethod
    def validate_llm_provider(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _LLM_PROVIDERS:
            raise ValueError("llm_provider must be 'ollama' or 'claude'")
        return v

    @field_validator("llm_claude_model")
    @classmethod
    def validate_llm_claude_model(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _CLAUDE_MODELS:
            raise ValueError("llm_claude_model must be haiku, sonnet, or opus")
        return v

    @field_validator("notify_webhook_url")
    @classmethod
    def validate_webhook_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return v
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("notify_webhook_url must start with http:// or https://")
        return v


class LLMTestRequest(BaseModel):
    """Optional overrides — falls back to persisted settings when omitted.

    Lets the Settings card test the values currently on screen before saving.
    """

    llm_provider: Optional[str] = None
    llm_ollama_host: Optional[str] = None
    llm_ollama_model: Optional[str] = None
    llm_claude_model: Optional[str] = None

    @field_validator("llm_provider")
    @classmethod
    def validate_llm_provider(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _LLM_PROVIDERS:
            raise ValueError("llm_provider must be 'ollama' or 'claude'")
        return v


class LLMTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    detail: str
    model_available: Optional[bool] = None


class DeviceChange(BaseModel):
    ip_address: str
    hostname: Optional[str] = None
    device_type: str = "unknown"
    vendor: Optional[str] = None
    change_type: str  # "added", "removed", "changed"
    changes: Optional[dict] = None


class LinkChange(BaseModel):
    source_ip: str
    target_ip: str
    discovery_method: Optional[str] = None
    change_type: str  # "added", "removed", "changed"


class ScanDiffResponse(BaseModel):
    scan_a_id: int
    scan_b_id: int
    devices_added: list[DeviceChange]
    devices_removed: list[DeviceChange]
    devices_changed: list[DeviceChange]
    devices_unchanged: int
    links_added: list[LinkChange]
    links_removed: list[LinkChange]
    links_changed: list[LinkChange]
    links_unchanged: int


class PositionUpdate(BaseModel):
    device_id: int
    x: float
    y: float


class NetworkPositionUpdate(BaseModel):
    network_id: int
    x: float
    y: float


class PositionUpdateRequest(BaseModel):
    positions: list[PositionUpdate] = []
    networks: list[NetworkPositionUpdate] = []
