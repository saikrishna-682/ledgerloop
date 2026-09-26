import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

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
