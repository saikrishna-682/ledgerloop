import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { formatMonthKey, currentMonthKey } from "@/lib/months";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  CircleDollarSign,
  Home,
  LogOut,
  Plus,
  ScrollText,
  ShieldAlert,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

const SALARY_REMINDER_SNOOZE_KEY = "salaryReminderSnoozeUntil";

/** Lets any page (e.g. Home's empty state) open the add-transaction drawer. */
const OpenAddContext = createContext<() => void>(() => {});
export function useOpenAddTxn() {
  return useContext(OpenAddContext);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <OpenAddContext.Provider value={() => setAddOpen(true)}>
      <div className="flex min-h-screen flex-col bg-muted/40">
        <header
          className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md md:mx-auto md:w-full md:max-w-md md:border-x"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
            <Link to="/home" className="flex items-center gap-2.5">
              <Logo className="size-7" />
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="hidden font-medium sm:inline-flex">
                {formatMonthKey(currentMonthKey())}
              </Badge>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                  >
                    {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <UserRound className="size-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                  >
                    <LogOut className="size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md flex-1 bg-background px-4 pb-36 pt-5 md:border-x md:border-border/60">
          {user?.isAnonymous && <GuestDataBanner />}
          <SalaryCheckInBanner onLogIncome={() => setAddOpen(true)} />
          {children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md md:mx-auto md:w-full md:max-w-md md:border-x"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex h-16 w-full max-w-md items-stretch justify-around px-2">
            <NavItem
              to="/home"
              icon={Home}
              label="Home"
              active={location.pathname === "/home"}
            />
            <NavItem
              to="/activity"
              icon={ScrollText}
              label="Activity"
              active={location.pathname === "/activity"}
            />
            <div className="relative w-16 shrink-0">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label="Add transaction"
                className="absolute -top-5 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                <Plus className="size-6" />
              </button>
            </div>
            <NavItem
              to="/profile"
              icon={UserRound}
              label="Profile"
              active={location.pathname === "/profile"}
            />
          </div>
        </nav>

        <Drawer open={addOpen} onOpenChange={setAddOpen}>
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>Add transaction</DrawerTitle>
              <DrawerDescription>Log income or an expense</DrawerDescription>
            </DrawerHeader>
            {addOpen && <TransactionDrawer onDone={() => setAddOpen(false)} />}
          </DrawerContent>
        </Drawer>
      </div>
    </OpenAddContext.Provider>
  );
}

/** Guests' data lives on a throwaway anonymous account — nudge them to sign
 *  in once they've actually logged something worth keeping. Dismissible for
 *  the current session; reappears next load since the risk doesn't go away. */
function GuestDataBanner() {
  const transactions = useQuery(api.finance.listTransactions, {});
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !transactions || transactions.length === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-900/50 dark:bg-amber-950/40">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          You're browsing as a guest
        </p>
        <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
          Your data isn't backed up yet. Sign in or create an account to make sure you don't
          lose it.
        </p>
        <Link
          to="/auth"
          className="mt-2 inline-flex text-xs font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-200"
        >
          Sign in / create account
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 text-amber-700/70 hover:bg-amber-200/50 hover:text-amber-900 dark:text-amber-400/70 dark:hover:bg-amber-900/40"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Once a month (and again a day later if snoozed), nudge the user to log
 *  their salary if no income has hit the current month yet — the
 *  safe-to-spend number is only as good as what's been logged. */
function SalaryCheckInBanner({ onLogIncome }: { onLogIncome: () => void }) {
  const monthKey = currentMonthKey();
  const stats = useQuery(api.finance.getMonthlyStats, { monthKey });
  const [snoozedNow, setSnoozedNow] = useState(false);

  if (snoozedNow || !stats || stats.incomeCents > 0) return null;

  try {
    const snoozeUntil = localStorage.getItem(SALARY_REMINDER_SNOOZE_KEY);
    if (snoozeUntil && Date.now() < Number(snoozeUntil)) return null;
  } catch {
    // If localStorage is unavailable just show the reminder every time.
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border/60 bg-primary/5 px-4 py-3.5">
      <CircleDollarSign className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Have you received your salary yet?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          No income logged for {formatMonthKey(monthKey)} yet — log it to keep safe-to-spend
          accurate.
        </p>
        <div className="mt-2 flex gap-4">
          <button
            type="button"
            onClick={onLogIncome}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Log income
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(
                  SALARY_REMINDER_SNOOZE_KEY,
                  String(Date.now() + 24 * 60 * 60 * 1000),
                );
              } catch {
                // Session-only fallback below still hides it for now.
              }
              setSnoozedNow(true);
            }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "drop-shadow-sm")} strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  );
}
