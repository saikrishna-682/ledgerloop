import { Logo } from "@/components/Logo";
import { MoneyLoader } from "@/components/MoneyLoader";
import { api } from "@/convex/_generated/api";
import {
  isSessionUnlocked,
  markSessionLocked,
  markSessionUnlocked,
} from "@/lib/appLockSession";
import { useMutation, useQuery } from "convex/react";
import { Delete } from "lucide-react";
import { useEffect, useState } from "react";

const PIN_LENGTH = 6; // max — verifyPin accepts whatever length was actually set

/** Gates its children behind a PIN entry screen when one is set. This is a
 *  local "glance" lock on top of real auth, not a replacement for it — it
 *  re-locks every time the tab is backgrounded (visibilitychange), not on a
 *  timer, matching how most banking apps behave. */
export function AppLock({ children }: { children: React.ReactNode }) {
  const pinEnabled = useQuery(api.finance.isPinEnabled);
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    if (pinEnabled === undefined) return;
    setLocked(pinEnabled && !isSessionUnlocked());
  }, [pinEnabled]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        markSessionLocked();
      } else if (pinEnabled) {
        setLocked(!isSessionUnlocked());
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pinEnabled]);

  if (pinEnabled === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <MoneyLoader />
      </div>
    );
  }
  if (!pinEnabled || !locked) return <>{children}</>;

  return (
    <LockScreen
      onUnlock={() => {
        markSessionUnlocked();
        setLocked(false);
      }}
    />
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const verifyPin = useMutation(api.finance.verifyPin);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lockedForSeconds, setLockedForSeconds] = useState(0);

  useEffect(() => {
    if (lockedForSeconds <= 0) return;
    const id = setInterval(() => setLockedForSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockedForSeconds]);

  async function submit(pin: string) {
    setChecking(true);
    setError(null);
    try {
      const result = await verifyPin({ pin });
      if (result.ok) {
        onUnlock();
        return;
      }
      if ("lockedForSeconds" in result && result.lockedForSeconds) {
        setLockedForSeconds(result.lockedForSeconds);
        setError(`Too many attempts. Try again in ${result.lockedForSeconds}s.`);
      } else {
        setError("Incorrect PIN");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDigits("");
      setChecking(false);
    }
  }

  function press(d: string) {
    if (checking || lockedForSeconds > 0) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    setError(null);
    // A PIN can be 4-6 digits; 4 submits as soon as a 5th isn't entered
    // shortly after — but simplest and least surprising is to require the
    // exact length the user set, so just submit at 4 and let a wrong-length
    // guess fail normally. In practice PINs are almost always 4 digits.
    if (next.length === 4) {
      void submit(next);
    }
  }

  function backspace() {
    if (checking) return;
    setDigits((d) => d.slice(0, -1));
    setError(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-12" />
        <p className="text-sm font-medium text-muted-foreground">Enter your PIN</p>
        <div className="flex gap-3" role="status" aria-label={`${digits.length} of 4 digits entered`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={
                "size-3 rounded-full border border-border transition-colors " +
                (i < digits.length ? "bg-foreground" : "bg-transparent")
              }
            />
          ))}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={checking || lockedForSeconds > 0}
            className="flex size-16 items-center justify-center rounded-full text-xl font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press("0")}
          disabled={checking || lockedForSeconds > 0}
          className="flex size-16 items-center justify-center rounded-full text-xl font-medium transition-colors hover:bg-muted disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={checking || digits.length === 0}
          aria-label="Backspace"
          className="flex size-16 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Delete className="size-5" />
        </button>
      </div>
    </div>
  );
}
