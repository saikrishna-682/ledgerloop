import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";

// Purely informational: real headlines from Finnhub's free market-news feed.
// No buy/sell framing or algorithmic recommendations — see the disclaimer
// rendered alongside this in the UI (src/components/MarketNews.tsx).
export interface NewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
  image: string | null;
  summary: string;
}

export const getMarketNews = action({
  args: {},
  handler: async (ctx): Promise<NewsItem[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error("Market news isn't configured yet.");

    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
    );
    if (!res.ok) {
      throw new Error(`Market news is temporarily unavailable (${res.status}).`);
    }
    const data = (await res.json()) as Array<{
      id: number;
      headline: string;
      source: string;
      url: string;
      datetime: number;
      image?: string;
      summary?: string;
    }>;

    return data.slice(0, 12).map((item) => ({
      id: item.id,
      headline: item.headline,
      source: item.source,
      url: item.url,
      datetime: item.datetime,
      image: item.image || null,
      summary: item.summary ?? "",
    }));
  },
});
