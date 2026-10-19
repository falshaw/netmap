import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ScanSearch,
  Clock,
  Settings,
  Map,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/scan", label: "New Scan", icon: ScanSearch },
  { path: "/history", label: "History", icon: Clock },
] as const;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = useCallback(
    (path: string) => {
      if (path === "/dashboard") return location.pathname === "/dashboard";
      return location.pathname.startsWith(path);
    },
    [location.pathname],
  );

  const navItems = useMemo(() => NAV_ITEMS.map((item) => item), []);

  const handleSignOut = useCallback(() => {
    sessionStorage.removeItem("netmap_authenticated");
    navigate("/login");
  }, [navigate]);

  const handleNavMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>, path: string) => {
      if (!isActive(path)) {
        e.currentTarget.style.background = "rgba(6, 182, 212, 0.1)";
        e.currentTarget.style.color = "var(--text-primary)";
      }
    },
    [isActive],
  );

  const handleNavMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLElement>, path: string) => {
      if (!isActive(path)) {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }
    },
    [isActive],
  );

  const handleSignOutMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.color = "#ef4444";
      e.currentTarget.style.background = "rgba(239,68,68,0.1)";
    },
    [],
  );

  const handleSignOutMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.color = "var(--text-secondary)";
      e.currentTarget.style.background = "transparent";
    },
    [],
  );

  return (
    <aside
      className="h-full flex flex-col flex-shrink-0"
      style={{
        width: 220,
        background: "rgba(0,0,0,0.3)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: "24px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          marginBottom: 20,
        }}
      >
        <Link to="/dashboard" className="flex items-center gap-3">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 40,
              height: 40,
              background:
                "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
              borderRadius: 10,
              boxShadow: "0 4px 12px rgba(6, 182, 212, 0.3)",
            }}
          >
            <Map
              className="w-5 h-5"
              style={{ color: "var(--navy-dark, #030014)" }}
            />
          </div>
          <div>
            <div className="text-[16px] font-bold text-white">
              Net<span style={{ color: "var(--accent-primary)" }}>Map</span>
            </div>
            <div
              className="text-[10px] uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "1px" }}
            >
              SNMP + nmap topology
            </div>
          </div>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex-1" style={{ padding: "0 12px" }}>
        <div
          className="text-[10px] font-semibold uppercase mb-2"
          style={{
            color: "var(--text-muted)",
            letterSpacing: "1px",
            padding: "0 12px",
          }}
        >
          Navigation
        </div>

        {navItems.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className="flex items-center gap-3 mb-1 transition-all"
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              fontSize: 14,
              color: isActive(path)
                ? "var(--accent-primary)"
                : "var(--text-secondary)",
              background: isActive(path)
                ? "linear-gradient(90deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)"
                : "transparent",
              boxShadow: isActive(path)
                ? "inset 3px 0 0 var(--accent-primary)"
                : "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => handleNavMouseEnter(e, path)}
            onMouseLeave={(e) => handleNavMouseLeave(e, path)}
          >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
            {label}
          </Link>
        ))}

        <div
          className="text-[10px] font-semibold uppercase mb-2"
          style={{
            color: "var(--text-muted)",
            letterSpacing: "1px",
            padding: "0 12px",
            marginTop: 24,
          }}
        >
          Settings
        </div>

        <Link
          to="/settings"
          className="flex items-center gap-3 mb-1 transition-all"
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            fontSize: 14,
            color: isActive("/settings")
              ? "var(--accent-primary)"
              : "var(--text-secondary)",
            background: isActive("/settings")
              ? "linear-gradient(90deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)"
              : "transparent",
            boxShadow: isActive("/settings")
              ? "inset 3px 0 0 var(--accent-primary)"
              : "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => handleNavMouseEnter(e, "/settings")}
          onMouseLeave={(e) => handleNavMouseLeave(e, "/settings")}
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0" />
          Settings
        </Link>
      </div>

      {/* User + Sign Out */}
      <div
        style={{
          padding: 20,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          marginTop: "auto",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 36,
              height: 36,
              background:
                "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "white",
            }}
          >
            NM
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white">
              NetMap Admin
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Network Engineer
            </div>
          </div>
          <div
            style={{
              width: 8,
              height: 8,
              background: "#10b981",
              borderRadius: "50%",
              boxShadow: "0 0 8px #10b981",
              animation: "pulse 2s infinite",
            }}
          />
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full transition-all"
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            fontSize: 14,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={handleSignOutMouseEnter}
          onMouseLeave={handleSignOutMouseLeave}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
