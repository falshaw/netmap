import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  ScanSearch,
  History as HistoryIcon,
  Waypoints,
  Server,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark, Wordmark } from "./AppBackground";
import { ThemeToggle } from "./ThemeToggle";
import { signOut } from "../lib/auth";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
};

const MAIN: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutGrid,
    match: (p) => p === "/dashboard",
  },
  {
    to: "/scan",
    label: "New scan",
    icon: ScanSearch,
    match: (p) => p.startsWith("/scan"),
  },
  {
    to: "/history",
    label: "History",
    icon: HistoryIcon,
    match: (p) => p.startsWith("/history") || p.startsWith("/compare"),
  },
];

const TOOLS: NavItem[] = [
  {
    to: "/topology",
    label: "Topology",
    icon: Waypoints,
    match: (p) => p.startsWith("/topology"),
  },
  {
    to: "/devices",
    label: "Devices",
    icon: Server,
    match: (p) => p.startsWith("/devices"),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (p) => p.startsWith("/settings"),
  },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const render = (item: NavItem) => {
    const on = item.match(pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        className={`side-link ${on ? "on" : ""}`}
        aria-current={on ? "page" : undefined}
      >
        <Icon aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <>
      {MAIN.map(render)}
      <div className="eyebrow mx-3 mt-3.5 mb-1">Tools</div>
      {TOOLS.map(render)}
    </>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleSignOut() {
    signOut();
    navigate("/login", { replace: true });
  }

  const userBlock = (
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className="grid place-items-center w-8 h-8 rounded-full bg-accent text-white text-[11px] font-bold shrink-0"
        aria-hidden
      >
        API
      </span>
      <div className="min-w-0">
        <div className="font-semibold truncate">API key</div>
        <div className="text-xs text-ink-65 truncate">Signed in</div>
      </div>
    </div>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-65 hover:text-ink cursor-pointer"
    >
      <LogOut className="w-3.5 h-3.5" aria-hidden />
      Sign out
    </button>
  );

  return (
    <>
      {/* Desktop: labelled glass sidebar, full viewport height */}
      <aside
        className="glass hidden lg:flex sticky top-7 w-[228px] shrink-0 flex-col gap-1 px-3.5 py-[18px] min-h-[calc(100vh-56px)]"
        aria-label="Main"
      >
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 font-bold text-base px-2 pt-0.5 pb-[18px]"
        >
          <LogoMark />
          <Wordmark />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="mt-auto border-t border-g-line pt-3.5 px-2 grid gap-3 text-[13px]">
          {userBlock}
          <div className="flex items-center justify-between gap-2">
            {signOutButton}
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Phone and tablet: glass top bar with a drop-down menu */}
      <header className="glass lg:hidden w-full !rounded-[18px] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 font-bold text-[15px] mr-auto"
          >
            <LogoMark size={32} />
            <Wordmark />
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="theme-btn !px-2.5"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
        {open && (
          <div id="mobile-nav" className="mt-3 border-t border-g-line pt-3">
            <nav className="flex flex-col gap-1" aria-label="Main navigation">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="mt-3 border-t border-g-line pt-3 px-2 flex items-center justify-between gap-3 text-[13px]">
              {userBlock}
              {signOutButton}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
