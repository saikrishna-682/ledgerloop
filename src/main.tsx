import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { useMutation } from "convex/react";
import { api } from "./convex/_generated/api";
import type { Id } from "./convex/_generated/dataModel";
import { PENDING_GUEST_CLAIM_KEY } from "@/lib/guestClaim";
import { MoneyLoader } from "@/components/MoneyLoader";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Home = lazy(() => import("./pages/Home.tsx"));
const Activity = lazy(() => import("./pages/Activity.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
// AppShell pulls in the transaction drawer (Radix Dialog/Drawer + form
// inputs) and a dozen icons — only signed-in visitors need any of that, so
// it's lazy too rather than shipping to everyone who lands on / or /auth.
const AppShell = lazy(() =>
  import("@/components/AppShell").then((m) => ({ default: m.AppShell })),
);

/** Wraps an authenticated page in the app shell and seeds default data. */
function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth redirectImmediately>
      <SeedOnMount>
        <Suspense fallback={<RouteLoading />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </SeedOnMount>
    </RequireAuth>
  );
}

/** Inserts default accounts/categories/settings exactly once per user.
 *  Also claims a just-upgraded guest's data first, if any is pending — see
 *  PENDING_GUEST_CLAIM_KEY and claimGuestData in convex/finance.ts. */
function SeedOnMount({ children }: { children: React.ReactNode }) {
  const claimGuestData = useMutation(api.finance.claimGuestData);
  const seed = useMutation(api.finance.seedIfEmpty);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    (async () => {
      const pendingGuestId = localStorage.getItem(PENDING_GUEST_CLAIM_KEY);
      if (pendingGuestId) {
        try {
          await claimGuestData({ guestUserId: pendingGuestId as Id<"users"> });
        } catch {
          // Best-effort — worst case the guest starts fresh on the new account.
        } finally {
          localStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
        }
      }
      await seed().catch(() => {}); // proceed even if seeding fails
      setSeeded(true);
    })();
  }, [claimGuestData, seed]);
  return seeded ? (
    <>{children}</>
  ) : (
    <RouteLoading />
  );
}

// Loading fallback for route transitions and the initial seeding step.
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <MoneyLoader />
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/home" />}
              />
              <Route
                path="/home"
                element={
                  <AppPage>
                    <Home />
                  </AppPage>
                }
              />
              <Route
                path="/activity"
                element={
                  <AppPage>
                    <Activity />
                  </AppPage>
                }
              />
              <Route
                path="/profile"
                element={
                  <AppPage>
                    <Profile />
                  </AppPage>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
