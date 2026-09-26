import { Banknote } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A loading indicator themed around the app's subject: a bill "flipping"
 * like it's being counted, with a rapidly ticking dollar counter underneath.
 * Purely decorative — the ticker never reflects a real amount.
 */
export function MoneyLoader({ label = "Loading" }: { label?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + Math.floor(Math.random() * 9) + 3) % 1000);
    }, 55);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
      <div
        className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10"
        style={{ perspective: "200px" }}
      >
        <Banknote
          className="size-8 text-primary"
          style={{
            transformStyle: "preserve-3d",
            animation: "bill-flip 1.1s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0 rounded-2xl bg-primary/25"
          style={{ animation: "bill-flip-shade 1.1s ease-in-out infinite" }}
        />
        <div className="absolute -bottom-1 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-primary"
              style={{
                animation: "coin-pop 0.9s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="money text-lg font-semibold text-primary tabular-nums">
        ${tick.toString().padStart(3, "0")}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
