-- NetMap Database Schema
-- Network topology discovery and diagram generation

-- Scan configurations (saved profiles)
CREATE TABLE IF NOT EXISTS scan_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    target_ip VARCHAR(45) NOT NULL,
    subnets JSONB DEFAULT '[]'::jsonb,
    snmp_community VARCHAR(100),
    snmp_version VARCHAR(5) DEFAULT '2c',
    snmp_port INTEGER DEFAULT 161,
    snmp_v3_user VARCHAR(100),
    snmp_v3_auth_protocol VARCHAR(10),
    snmp_v3_auth_password VARCHAR(200),
    snmp_v3_priv_protocol VARCHAR(10),
    snmp_v3_priv_password VARCHAR(200),
    scan_nmap BOOLEAN DEFAULT true,
    scan_arp BOOLEAN DEFAULT true,
    scan_snmp BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Scan runs
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    config_id INTEGER REFERENCES scan_configs(id),
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    phase VARCHAR(50),
    target_ip VARCHAR(45) NOT NULL,
    subnets JSONB DEFAULT '[]'::jsonb,
    device_count INTEGER DEFAULT 0,
    link_count INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_created ON scans(created_at DESC);

-- Discovered devices
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    hostname VARCHAR(255),
    mac_address VARCHAR(17),
    vendor VARCHAR(100),
    device_type VARCHAR(30) DEFAULT 'unknown',
    os_family VARCHAR(100),
    os_version VARCHAR(100),
    sys_name VARCHAR(255),
    sys_descr TEXT,
    sys_object_id VARCHAR(255),
    sys_location VARCHAR(255),
    sys_contact VARCHAR(255),
    uptime_seconds BIGINT,
    snmp_reachable BOOLEAN DEFAULT false,
    position_x FLOAT,
    position_y FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_devices_scan ON devices(scan_id);
CREATE INDEX idx_devices_ip ON devices(ip_address);

-- Device interfaces
CREATE TABLE IF NOT EXISTS interfaces (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    if_index INTEGER,
    name VARCHAR(100),
    description VARCHAR(255),
    ip_address VARCHAR(45),
    subnet_mask VARCHAR(45),
    mac_address VARCHAR(17),
    speed_mbps BIGINT,
    mtu INTEGER,
    admin_status VARCHAR(10),
    oper_status VARCHAR(10),
    if_type VARCHAR(50),
    vlan_id INTEGER,
    in_octets BIGINT,
    out_octets BIGINT,
    in_errors BIGINT,
    out_errors BIGINT,
    utilization_in FLOAT,
    utilization_out FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_interfaces_device ON interfaces(device_id);

-- Discovered links between devices
CREATE TABLE IF NOT EXISTS links (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    source_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    target_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    source_interface_id INTEGER REFERENCES interfaces(id) ON DELETE SET NULL,
    target_interface_id INTEGER REFERENCES interfaces(id) ON DELETE SET NULL,
    discovery_method VARCHAR(20),
    bandwidth_mbps BIGINT,
    link_type VARCHAR(30),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_links_scan ON links(scan_id);
CREATE INDEX idx_links_source ON links(source_device_id);
CREATE INDEX idx_links_target ON links(target_device_id);

-- Discovered networks/subnets
CREATE TABLE IF NOT EXISTS networks (
    id SERIAL PRIMARY KEY,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    network_address VARCHAR(45) NOT NULL,
    prefix_length INTEGER NOT NULL,
    vlan_id INTEGER,
    vlan_name VARCHAR(100),
    gateway_ip VARCHAR(45),
    gateway_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    device_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_networks_scan ON networks(scan_id);

-- Application settings (singleton row)
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- Encrypted at rest (Fernet), NULL until set on the Settings page.
    -- Never seed a plaintext value here: the API would fail to decrypt it.
    snmp_community VARCHAR(512),
    snmp_version VARCHAR(5) DEFAULT '2c',
    snmp_port INTEGER DEFAULT 161,
    snmp_timeout INTEGER DEFAULT 5,
    snmp_retries INTEGER DEFAULT 2,
    default_scan_nmap BOOLEAN DEFAULT true,
    default_scan_arp BOOLEAN DEFAULT true,
    default_scan_snmp BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
