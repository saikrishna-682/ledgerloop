import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";
import { Logo, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

// This page is locked to a phone-width frame at every viewport size — see
// AppShell.tsx for the same pattern applied to the signed-in app. Tailwind's
// sm:/lg: variants are viewport-width media queries, not container-width
// ones, so unlike a plain "max-w" wrapper, every section below is written
// mobile-only (no sm:/lg: reflow) rather than relying on one to shrink.
export default function Landing() {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md md:mx-auto md:max-w-md md:border-x">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Logo className="size-8" />
            <Wordmark />
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md bg-background md:border-x md:border-border/60">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[320px] max-w-md rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex w-full flex-col items-center px-4 pb-14 pt-14 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1 text-xs font-medium">
                <ShieldCheck className="size-3.5 text-primary" />
                Know your money before your money disappears
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight">
                Not what you spent.
                <br />
                <span className="text-primary">What you can safely spend.</span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                LedgerLoop turns your income and expenses into one honest number — so the
                balance in your account never lies to you again.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3">
                <Button asChild size="lg" className="h-12 w-full gap-2 px-7 text-base">
                  <Link to="/auth">
                    Start free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 w-full px-7 text-base">
                  <a href="#how-it-works">See how it works</a>
                </Button>
              </div>
            </motion.div>

            {/* Hero card mock */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-14 w-full"
            >
              <div className="card-soft rounded-3xl border border-border/60 bg-card p-6 text-left">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <ShieldCheck className="size-4" />
                  Safe to spend today
                </div>
                <div className="money mt-2 text-5xl font-bold tracking-tight">$830</div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-primary/15">
                  <div className="h-full w-[64%] rounded-full bg-primary" />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>36% left for the month</span>
                  <span className="money">$1,580 / $2,410</span>
                </div>
                <div className="mt-5 grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 pt-4">
                  {[
                    { label: "Balance", value: "$3,900", icon: Wallet },
                    { label: "Committed", value: "−$1,470", icon: TrendingDown },
                    { label: "Buffer", value: "−$600", icon: TrendingUp },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col items-center gap-0.5 text-center">
                      <c.icon className="size-4 text-muted-foreground" />
                      <span className="money text-sm font-semibold">{c.value}</span>
                      <span className="text-[10px] text-muted-foreground">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* The problem / the shift */}
        <section className="w-full px-4 py-12">
          <motion.div {...fadeUp} className="grid gap-4">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Other apps ask
              </p>
              <p className="mt-2 text-xl font-semibold text-muted-foreground">
                “Where did my money go?”
              </p>
            </div>
            <div className="rounded-2xl border border-primary/30 bg-accent p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                LedgerLoop asks
              </p>
              <p className="mt-2 text-xl font-semibold text-accent-foreground">
                “Where should my money go next?”
              </p>
            </div>
          </motion.div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border/60 bg-card/50">
          <div className="w-full px-4 py-14">
            <motion.h2 {...fadeUp} className="text-center text-3xl font-bold tracking-tight">
              Three numbers. Total clarity.
            </motion.h2>
            <motion.p {...fadeUp} className="mt-3 text-center text-muted-foreground">
              The math is transparent and deterministic — no black-box advice, no vague
              insights. You can always see how the number was computed.
            </motion.p>
            <div className="mt-10 grid gap-4">
              {[
                {
                  step: "01",
                  title: "Log income & expenses",
                  body: "A fast, two-tap entry for every dollar in and out — income, essentials, and everyday spending.",
                },
                {
                  step: "02",
                  title: "Mark what's essential",
                  body: "Essentials like rent and groceries are treated as committed money, not free money.",
                },
                {
                  step: "03",
                  title: "See safe-to-spend",
                  body: "Balance + income − essentials − your buffer. One number that respects your future bills.",
                },
              ].map((f, i) => (
                <motion.div
                  key={f.step}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="card-soft rounded-2xl border border-border/60 bg-card p-6"
                >
                  <span className="money text-xs font-bold text-primary">{f.step}</span>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="w-full px-4 py-14">
          <motion.h2 {...fadeUp} className="text-3xl font-bold tracking-tight">
            Built on honest arithmetic
          </motion.h2>
          <div className="mt-8 grid gap-y-5">
            {[
              "Integer-cent math — no floating-point rounding errors, ever",
              "Credit-card spending tracked as a liability, not lost cash",
              "A configurable buffer held back before anything is spendable",
              "Essentials separated from discretionary spending automatically",
              "Every number shows the math behind it — nothing to trust blindly",
              "No shaming, no noise — just awareness, decision, action",
            ].map((p, i) => (
              <motion.div
                key={p}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="size-3 text-primary" />
                </span>
                <p className="text-sm leading-relaxed text-foreground/90">{p}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="w-full px-4 pb-16">
          <motion.div
            {...fadeUp}
            className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground"
          >
            <h2 className="text-3xl font-bold tracking-tight">
              Your balance is not your budget.
            </h2>
            <p className="mt-3 text-sm text-primary-foreground/80">
              Set up takes two minutes: log one income, mark your essentials, and your first
              safe-to-spend number appears.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-8 h-12 w-full gap-2 px-8 text-base">
              <Link to="/auth">
                Get started free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </motion.div>
        </section>

        <footer className="border-t border-border/60">
          <div className="flex w-full flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <div className="flex items-center gap-2">
              <Logo className="size-6" />
              <Wordmark />
            </div>
            <p className="text-xs text-muted-foreground">
              © 2026 LedgerLoop · Personal finance, honestly computed.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
