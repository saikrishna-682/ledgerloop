export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9.5 21.5v-8.2L16 8.5l6.5 4.8v8.2"
        stroke="currentColor"
        className="text-primary-foreground"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 21.5v-4.2a3 3 0 0 1 6 0v4.2"
        stroke="currentColor"
        className="text-primary-foreground"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="text-[15px] font-semibold tracking-tight text-foreground">
      Ledger<span className="text-primary">Loop</span>
    </span>
  );
}
