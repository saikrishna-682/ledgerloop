import * as SwitchPrimitive from "@radix-ui/react-switch";
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

  const checked = mounted && isDark;

  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={toggle}
      aria-label={checked ? "Switch to light mode" : "Switch to dark mode"}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-muted transition-colors data-[state=checked]:bg-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <SwitchPrimitive.Thumb
        className="flex size-5 translate-x-0.5 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-foreground data-[state=checked]:text-background"
      >
        {checked ? <Moon className="size-3" /> : <Sun className="size-3" />}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}
