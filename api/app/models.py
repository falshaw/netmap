"""SQLAlchemy ORM models for NetMap"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, BigInteger,
    DateTime, ForeignKey, JSON,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class ScanConfig(Base):
    __tablename__ = "scan_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    target_ip = Column(String(45), nullable=False)
    subnets = Column(JSON)
    snmp_community = Column(String(100))
    snmp_version = Column(String(5), default="2c")
    snmp_port = Column(Integer, default=161)
    snmp_v3_user = Column(String(100))
    snmp_v3_auth_protocol = Column(String(10))
    snmp_v3_auth_password = Column(String(200))
    snmp_v3_priv_protocol = Column(String(10))
    snmp_v3_priv_password = Column(String(200))
    scan_nmap = Column(Boolean, default=True)
    scan_arp = Column(Boolean, default=True)
    scan_snmp = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    scans = relationship("Scan", back_populates="config")


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("scan_configs.id"))
    status = Column(String(20), default="pending")
    progress = Column(Integer, default=0)
    phase = Column(String(50))
    target_ip = Column(String(45), nullable=False)
    subnets = Column(JSON)
    device_count = Column(Integer, default=0)
    link_count = Column(Integer, default=0)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    config = relationship("ScanConfig", back_populates="scans")
    devices = relationship("Device", back_populates="scan", cascade="all, delete-orphan")
    links = relationship("Link", back_populates="scan", cascade="all, delete-orphan")
    networks = relationship("Network", back_populates="scan", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    ip_address = Column(String(45), nullable=False)
    hostname = Column(String(255))
    mac_address = Column(String(17))
    vendor = Column(String(100))
    device_type = Column(String(30), default="unknown")
    os_family = Column(String(100))
    os_version = Column(String(100))
    sys_name = Column(String(255))
    sys_descr = Column(Text)
    sys_object_id = Column(String(255))
    sys_location = Column(String(255))
    sys_contact = Column(String(255))
    uptime_seconds = Column(BigInteger)
    snmp_reachable = Column(Boolean, default=False)
    position_x = Column(Float)
    position_y = Column(Float)
    created_at = Column(DateTime, server_default=func.now())

    scan = relationship("Scan", back_populates="devices")
    interfaces = relationship("Interface", back_populates="device", cascade="all, delete-orphan")
    source_links = relationship("Link", foreign_keys="Link.source_device_id", back_populates="source_device")
    target_links = relationship("Link", foreign_keys="Link.target_device_id", back_populates="target_device")


class Interface(Base):
    __tablename__ = "interfaces"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    if_index = Column(Integer)
    name = Column(String(100))
    description = Column(String(255))
    ip_address = Column(String(45))
    subnet_mask = Column(String(45))
    mac_address = Column(String(17))
    speed_mbps = Column(BigInteger)
    mtu = Column(Integer)
    admin_status = Column(String(10))
    oper_status = Column(String(10))
    if_type = Column(String(50))
    vlan_id = Column(Integer)
    in_octets = Column(BigInteger)
    out_octets = Column(BigInteger)
    in_errors = Column(BigInteger)
    out_errors = Column(BigInteger)
    utilization_in = Column(Float)
    utilization_out = Column(Float)
    created_at = Column(DateTime, server_default=func.now())

    device = relationship("Device", back_populates="interfaces")


class Link(Base):
    __tablename__ = "links"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    source_device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    target_device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    source_interface_id = Column(Integer, ForeignKey("interfaces.id", ondelete="SET NULL"))
    target_interface_id = Column(Integer, ForeignKey("interfaces.id", ondelete="SET NULL"))
    discovery_method = Column(String(20))
    bandwidth_mbps = Column(BigInteger)
    link_type = Column(String(30))
    created_at = Column(DateTime, server_default=func.now())

    scan = relationship("Scan", back_populates="links")
    source_device = relationship("Device", foreign_keys=[source_device_id], back_populates="source_links")
    target_device = relationship("Device", foreign_keys=[target_device_id], back_populates="target_links")
    source_interface = relationship("Interface", foreign_keys=[source_interface_id])
    target_interface = relationship("Interface", foreign_keys=[target_interface_id])


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    snmp_community = Column(String(100), default="public")
    snmp_version = Column(String(5), default="2c")
    snmp_port = Column(Integer, default=161)
    snmp_timeout = Column(Integer, default=5)
    snmp_retries = Column(Integer, default=2)
    default_scan_nmap = Column(Boolean, default=True)
    default_scan_arp = Column(Boolean, default=True)
    default_scan_snmp = Column(Boolean, default=True)
    # LLM / API configuration (used by app.llm — provider + endpoints)
    llm_provider = Column(String(20), default="ollama")
    llm_ollama_host = Column(String(255), default="http://host.docker.internal:11434")
    llm_ollama_model = Column(String(100), default="qwen2.5:7b")
    llm_claude_model = Column(String(20), default="sonnet")
    # Notification preferences
    notify_enabled = Column(Boolean, default=False)
    notify_webhook_url = Column(String(500), default="")  # encrypted at rest
    notify_on_scan_complete = Column(Boolean, default=True)
    notify_on_scan_failed = Column(Boolean, default=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


def ensure_app_settings_columns() -> None:
    """Idempotently add AppSettings columns introduced after initial creation.

    ``Base.metadata.create_all()`` only creates missing tables — it never ALTERs
    an existing one. Databases provisioned before the LLM/notification settings
    were added therefore need the new columns backfilled explicitly. Safe to run
    on every startup: each column is added only if absent.
    """
    from sqlalchemy import inspect as sa_inspect, text

    from app.database import engine

    inspector = sa_inspect(engine)
    if "app_settings" not in inspector.get_table_names():
        return  # create_all() will build it fresh with every column

    existing = {col["name"] for col in inspector.get_columns("app_settings")}
    is_sqlite = engine.dialect.name == "sqlite"
    false_lit = "0" if is_sqlite else "FALSE"
    true_lit = "1" if is_sqlite else "TRUE"

    additions: list[tuple[str, str]] = [
        ("llm_provider", "VARCHAR(20) DEFAULT 'ollama'"),
        ("llm_ollama_host", "VARCHAR(255) DEFAULT 'http://host.docker.internal:11434'"),
        ("llm_ollama_model", "VARCHAR(100) DEFAULT 'qwen2.5:7b'"),
        ("llm_claude_model", "VARCHAR(20) DEFAULT 'sonnet'"),
        ("notify_enabled", f"BOOLEAN DEFAULT {false_lit}"),
        ("notify_webhook_url", "VARCHAR(500)"),
        ("notify_on_scan_complete", f"BOOLEAN DEFAULT {true_lit}"),
        ("notify_on_scan_failed", f"BOOLEAN DEFAULT {true_lit}"),
    ]

    missing = [(name, ddl) for name, ddl in additions if name not in existing]
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing:
            conn.execute(text(f"ALTER TABLE app_settings ADD COLUMN {name} {ddl}"))


class Network(Base):
    __tablename__ = "networks"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    network_address = Column(String(45), nullable=False)
    prefix_length = Column(Integer, nullable=False)
    vlan_id = Column(Integer)
    vlan_name = Column(String(100))
    gateway_ip = Column(String(45))
    gateway_device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"))
    device_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    scan = relationship("Scan", back_populates="networks")
    gateway_device = relationship("Device", foreign_keys=[gateway_device_id])
