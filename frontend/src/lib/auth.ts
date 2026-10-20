/**
 * UI session flag. nginx injects the real X-API-Key server-side, so the
 * browser never holds the key: the login form only proves the user knows it
 * (GET /api/auth/validate with X-Login-Key) and this flag remembers that for
 * the tab's session.
 */
const STORAGE_KEY = "netmap_authenticated";

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  return store()?.getItem(STORAGE_KEY) === "1";
}

export function markSignedIn(): void {
  store()?.setItem(STORAGE_KEY, "1");
}

export function signOut(): void {
  store()?.removeItem(STORAGE_KEY);
}

/**
 * Where to go after sign-in. Only same-origin app paths are allowed, so a
 * crafted ?next= cannot send the user to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/dashboard";
  if (next === "/" || next.startsWith("/login")) return "/dashboard";
  return next;
}
