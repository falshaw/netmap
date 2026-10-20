import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Outlet,
} from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/Sidebar";
import RequireAuth from "./components/RequireAuth";
import { AppBackground } from "./components/AppBackground";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ScanPage from "./pages/Scan";
import History from "./pages/History";
import Settings from "./pages/Settings";
import TopologyLatest from "./pages/TopologyLatest";
import ScanDiff from "./pages/ScanDiff";
import NotFound from "./pages/NotFound";

// The canvas (React Flow) is the heaviest part of the app: load it on demand.
const Topology = lazy(() => import("./pages/Topology"));

/** Glass shell: labelled sidebar + main panel, both full viewport height. */
function AppShell() {
  return (
    <>
      <AppBackground />
      <div className="mx-auto flex max-w-[1340px] flex-col gap-3 p-4 lg:flex-row lg:items-start lg:gap-[18px] lg:px-6 lg:py-7">
        <Sidebar />
        <main className="glass w-full min-w-0 flex-1 p-[18px] sm:px-7 sm:pt-[26px] sm:pb-7 lg:min-h-[calc(100vh-56px)]">
          <Suspense fallback={<p className="text-ink-65" aria-busy="true">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </>
  );
}

/** Scroll to top on route change. */
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
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            {/* No landing page: the app starts on the dashboard. */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/history" element={<History />} />
              <Route path="/topology" element={<TopologyLatest />} />
              <Route path="/topology/:scanId" element={<Topology />} />
              <Route path="/compare/:scanIdA/:scanIdB" element={<ScanDiff />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
