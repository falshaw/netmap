import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** localStorage key; index.html reads the same key before first paint. */
export const THEME_KEY = "netmap-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Current theme, re-rendering when it changes. */
export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => "light" as const);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useTheme() === "dark";

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-btn ${className}`}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {dark ? "Light" : "Dark"}
    </button>
  );
}
