import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// Best-effort, in-memory sliding window: the Email provider's
// sendVerificationRequest callback gets no Convex ctx (only the Phone
// provider does — confirmed in @auth/core's actual type), so there's no way
// to check a durable, cross-instance counter from here. This still stops a
// basic same-isolate spam script from hammering one address, it just isn't
// a durable/distributed guarantee — it resets on cold start and isn't
// shared across concurrent instances of the function.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const sendLog = new Map<string, { windowStart: number; count: number }>();

function checkOtpRateLimit(identifier: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = sendLog.get(identifier);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    sendLog.set(identifier, { windowStart: now, count: 1 });
    return { ok: true };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

// Previously relayed every sign-in code through a third-party vly.ai/
// freebuff.app endpoint using an API key hardcoded in this file (visible to
// anyone who can read the repo). That meant every user's email address and
// live OTP code passed through infrastructure this project doesn't control,
// with no way to rotate the credential short of editing source. Replaced
// with Resend (resend.com) — a provider this project's own account and key
// control, configured the same way marketNews.ts guards FINNHUB_API_KEY.
export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const normalized = email.trim().toLowerCase();
    const limit = checkOtpRateLimit(normalized);
    if (!limit.ok) {
      throw new Error(
        `Too many sign-in codes requested for this email. Try again in ${limit.retryAfterSeconds}s.`,
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Email sign-in isn't configured yet — set RESEND_API_KEY (see resend.com).",
      );
    }
    const from = process.env.RESEND_FROM_EMAIL || "LedgerLoop <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `${token} is your LedgerLoop sign-in code`,
        text: `Your LedgerLoop sign-in code is ${token}. It expires in 15 minutes.`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to send sign-in email (${res.status})`);
    }
  },
});
