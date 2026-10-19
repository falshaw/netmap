import { Navigate, Outlet } from "react-router-dom";

const STORAGE_KEY = "netmap_authenticated";

/**
 * Route guard: redirects to /login if not authenticated.
 * The actual API key is injected server-side by nginx — this only
 * checks whether the user has validated their key this session.
 */
export default function RequireAuth() {
  const isAuthenticated = sessionStorage.getItem(STORAGE_KEY);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
