import { Switch } from "@/components/ui/switch";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

// Not using next-themes: outside a Next.js SSR app it injects a <script>
// tag React-side (a no-op — React never executes scripts it renders) and
// logs a console warning on every render. A plain localStorage + class-list
// toggle is all a client-only SPA needs.
const STORAGE_KEY = "theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing / blocked storage — fall back to system preference.
    }
    const dark = stored ? stored === "dark" : systemPrefersDark();
    setIsDark(dark);
    applyTheme(dark);
    setMounted(true);
  }, []);

  function toggle(next: boolean) {
    setIsDark(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Per-viewer convenience only — fine if it doesn't persist.
    }
  }

  return (
    <label
      className="flex items-center gap-1.5"
      aria-label={mounted && isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className="size-3.5 text-muted-foreground" />
      <Switch checked={mounted && isDark} onCheckedChange={toggle} className="scale-90" />
      <Moon className="size-3.5 text-muted-foreground" />
    </label>
  );
}
