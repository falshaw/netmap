import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSignedIn } from "../lib/auth";

/**
 * Route guard: sends the visitor to /login (remembering where they wanted to
 * go) unless they validated the API key in this tab's session.
 */
export default function RequireAuth() {
  const location = useLocation();
  if (!isSignedIn()) {
    const next = location.pathname + location.search;
    return (
      <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
    );
  }
  return <Outlet />;
}
