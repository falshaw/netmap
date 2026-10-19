import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Outlet,
} from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import RequireAuth from "./components/RequireAuth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ScanPage from "./pages/Scan";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Topology from "./pages/Topology";
import ScanDiff from "./pages/ScanDiff";
import NotFound from "./pages/NotFound";

/**
 * Layout with sidebar for main app pages (dashboard, scan, history, settings).
 * Gold-bordered container wrapping sidebar + content.
 */
function AppShell() {
  return (
    <div className="min-h-screen flex items-start justify-center p-6">
      <div
        className="flex w-full rounded-[20px] overflow-hidden"
        style={{
          maxWidth: 1200,
          border: "1px solid var(--accent-primary)",
          boxShadow:
            "0 0 60px rgba(6, 182, 212, 0.15), 0 0 100px rgba(124, 58, 237, 0.1), 0 25px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          background:
            "linear-gradient(145deg, rgba(15,35,64,0.95), rgba(10,22,40,0.98))",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Full-screen layout for pages that don't use the sidebar
 * (landing page and topology canvas).
 */
function FullScreen() {
  return <Outlet />;
}

/**
 * Scroll to top on route change.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Public full-screen routes (no sidebar, no auth) */}
          <Route element={<FullScreen />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
          </Route>

          {/* Protected routes */}
          <Route element={<RequireAuth />}>
            {/* Full-screen protected routes (no sidebar) */}
            <Route element={<FullScreen />}>
              <Route path="/topology/:scanId" element={<Topology />} />
              <Route path="/compare/:scanIdA/:scanIdB" element={<ScanDiff />} />
            </Route>

            {/* App shell routes (sidebar) */}
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
