import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { NewsItem } from "@/convex/marketNews";
import { useAction } from "convex/react";
import { ExternalLink, Newspaper, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Only ~3 headlines are visible at once (this app is about your money, not
// the market) with a peek of the 4th plus a scroll fade doing double duty
// as the "there's more" affordance. Fade only appears on the edge that
// actually hides content — no top fade until you've scrolled down.
const VISIBLE_LIST_HEIGHT = 272;

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MarketNews() {
  const getMarketNews = useAction(api.marketNews.getMarketNews);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  function updateFade() {
    const el = scrollRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 4);
    setAtBottom(el.scrollTop >= el.scrollHeight - el.clientHeight - 4);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const news = await getMarketNews({});
      setItems(news);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load market news.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateFade();
  }, [items]);

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Newspaper className="size-4 text-primary" />
          Market news
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Refresh market news"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <CardContent className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Headlines only, for general awareness — not investment advice or a recommendation to
            buy or sell anything. Markets can move against any trend at any time. Do your own
            research (or talk to a licensed advisor) before acting on anything you read here.
          </p>
        </div>

        {loading && !items && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {items && items.length === 0 && !error && (
          <p className="py-2 text-sm text-muted-foreground">No headlines right now.</p>
        )}

        {items && items.length > 0 && (
          <div
            ref={scrollRef}
            onScroll={updateFade}
            className="flex flex-col gap-3 overflow-y-auto pr-1"
            style={{
              maxHeight: VISIBLE_LIST_HEIGHT,
              WebkitMaskImage: `linear-gradient(to bottom, ${atTop ? "black" : "transparent"} 0, black 20px, black calc(100% - 20px), ${atBottom ? "black" : "transparent"} 100%)`,
              maskImage: `linear-gradient(to bottom, ${atTop ? "black" : "transparent"} 0, black 20px, black calc(100% - 20px), ${atBottom ? "black" : "transparent"} 100%)`,
            }}
          >
            {items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{item.headline}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {item.source} · {timeAgo(item.datetime)}
                    <ExternalLink className="size-3" />
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
