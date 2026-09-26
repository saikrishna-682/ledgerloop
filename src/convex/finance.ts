import { getAuthUserId } from "@convex-dev/auth/server";
import { sha256 } from "@oslojs/crypto/sha2";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { daysInMonth as daysInMonthOf } from "../lib/months";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hashPin(pin: string, salt: string): string {
  return toHex(sha256(new TextEncoder().encode(`${salt}:${pin}`)));
}

// ---------------------------------------------------------------------------
// Money rule: every amount is stored as integer cents ($12.34 -> 1234).
// ---------------------------------------------------------------------------

// Seed data — inserted once per user so the app is immediately meaningful.
const SYSTEM_CATEGORIES: Array<{
  name: string;
  kind: "income" | "expense";
  icon: string;
  color: string;
  essential: boolean;
}> = [
  { name: "Salary", kind: "income", icon: "Briefcase", color: "#059669", essential: false },
  { name: "Freelance", kind: "income", icon: "PenTool", color: "#0d9488", essential: false },
  { name: "Other income", kind: "income", icon: "CircleDollarSign", color: "#0f766e", essential: false },
  { name: "Groceries", kind: "expense", icon: "ShoppingCart", color: "#f97316", essential: true },
  { name: "Rent", kind: "expense", icon: "Home", color: "#6366f1", essential: true },
  { name: "Utilities", kind: "expense", icon: "Plug", color: "#06b6d4", essential: true },
  { name: "Transport", kind: "expense", icon: "Car", color: "#0ea5e9", essential: true },
  { name: "Health", kind: "expense", icon: "HeartPulse", color: "#ec4899", essential: true },
  { name: "Dining out", kind: "expense", icon: "UtensilsCrossed", color: "#ef4444", essential: false },
  { name: "Shopping", kind: "expense", icon: "ShoppingBag", color: "#8b5cf6", essential: false },
  { name: "Entertainment", kind: "expense", icon: "Clapperboard", color: "#eab308", essential: false },
  { name: "Subscriptions", kind: "expense", icon: "Repeat", color: "#14b8a6", essential: false },
  { name: "Other", kind: "expense", icon: "CircleDot", color: "#64748b", essential: false },
];

const DEFAULT_ACCOUNTS: Array<{
  name: string;
  kind: "checking" | "savings" | "cash" | "credit";
  startingBalanceCents: number;
}> = [
  { name: "Checking", kind: "checking", startingBalanceCents: 0 },
  { name: "Credit card", kind: "credit", startingBalanceCents: 0 },
];

// Buffer default: 10% of income held back, per the product spec.
const DEFAULT_BUFFER_PCT = 10;

/** Trims and length-caps a user-supplied name; the client already validates
 * this, but every mutation is also callable directly, so the server enforces
 * it too rather than trusting the UI. */
function requireName(name: string, maxLength = 100): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  if (trimmed.length > maxLength) throw new Error(`Name must be ${maxLength} characters or fewer`);
  return trimmed;
}

/** The client only ever offers a fixed swatch palette, but every mutation is
 * also directly callable, so this is enforced server-side too — a category
 * color ends up in inline style values, never interpolated into raw HTML/CSS
 * text, but a hex format is cheap insurance against that changing later. */
function requireHexColor(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Color must be a hex value like #64748b");
  return color;
}

// ---------------------------------------------------------------------------
// Guest data claiming — a guest's data lives under their anonymous user id.
// Signing in with email/Google authenticates as a *different* user id, so
// without this the guest's accounts/categories/transactions would silently
// stay orphaned under the old anonymous id. The client calls this right
// after a guest completes real sign-in (see main.tsx), moving every row
// over to the now-signed-in user.
//
// Trusting a client-supplied guestUserId directly here used to be an IDOR:
// any signed-in user could pass *any* anonymous user's id (Convex ids are
// not secret — they're returned in every query result) and merge that
// guest's entire financial history into their own account. A short-lived,
// single-use token minted only while genuinely authenticated as that guest
// (see createGuestClaimToken below) proves the caller actually was that
// browser session, not just that the target happens to be anonymous.
// ---------------------------------------------------------------------------

const GUEST_CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

export const createGuestClaimToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.isAnonymous !== true) throw new Error("Not a guest account");

    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    await ctx.db.insert("guestClaimTokens", { token, guestUserId: userId, createdAt: Date.now() });
    return token;
  },
});

export const claimGuestData = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const claim = await ctx.db
      .query("guestClaimTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    // Consume immediately (before any await that could race a second call)
    // so the token can't be replayed even if the rest of this fails.
    if (claim) await ctx.db.delete(claim._id);
    if (!claim || Date.now() - claim.createdAt > GUEST_CLAIM_TOKEN_TTL_MS) return;

    const guestUserId = claim.guestUserId;
    if (userId === guestUserId) return;

    const guest = await ctx.db.get(guestUserId);
    if (!guest || guest.isAnonymous !== true) return;

    const [accounts, categories, transactions, guestSettings, myExistingSettings] =
      await Promise.all([
        ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", guestUserId)).collect(),
        ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", guestUserId)).collect(),
        ctx.db
          .query("transactions")
          .withIndex("by_user_date", (q) => q.eq("userId", guestUserId))
          .collect(),
        ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", guestUserId)).collect(),
        ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ]);

    for (const row of [...accounts, ...categories, ...transactions]) {
      await ctx.db.patch(row._id, { userId });
    }

    // The signed-in user may already have default settings seeded — keep
    // theirs and drop the guest's rather than ending up with two rows.
    for (const [i, row] of guestSettings.entries()) {
      if (i === 0 && !myExistingSettings) {
        await ctx.db.patch(row._id, { userId });
      } else {
        await ctx.db.delete(row._id);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Seeding (idempotent mutation — queries cannot write, so the client calls
// this once on mount and any concurrent duplicate runs serially and no-ops).
// ---------------------------------------------------------------------------

const GUEST_NAME_ADJECTIVES = [
  "Curious", "Quiet", "Swift", "Bright", "Calm", "Bold", "Gentle", "Clever", "Sunny", "Steady",
];
const GUEST_NAME_ANIMALS = [
  "Otter", "Falcon", "Fox", "Heron", "Lynx", "Sparrow", "Badger", "Dolphin", "Wren", "Hare",
];

function randomGuestName(): string {
  const a = GUEST_NAME_ADJECTIVES[Math.floor(Math.random() * GUEST_NAME_ADJECTIVES.length)];
  const b = GUEST_NAME_ANIMALS[Math.floor(Math.random() * GUEST_NAME_ANIMALS.length)];
  return `${a} ${b}`;
}

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const [user, cats, accts, settings] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);

    // Guests otherwise have no name/email to identify their account by —
    // give them a friendly, memorable one they can rename later in Profile.
    if (user?.isAnonymous && !user.name) {
      await ctx.db.patch(userId, { name: randomGuestName() });
    }

    if (cats.length === 0) {
      for (const c of SYSTEM_CATEGORIES) {
        await ctx.db.insert("categories", { userId, ...c, isSystem: true });
      }
    }
    if (accts.length === 0) {
      for (const a of DEFAULT_ACCOUNTS) {
        await ctx.db.insert("accounts", { userId, ...a });
      }
    }
    if (!settings) {
      await ctx.db.insert("settings", { userId, bufferPct: DEFAULT_BUFFER_PCT });
    }
  },
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const rows = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((r) => !r.archived);
  },
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("expense"), v.literal("income")),
    icon: v.string(),
    color: v.string(),
    essential: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const name = requireName(args.name);
    const color = requireHexColor(args.color);
    return await ctx.db.insert("categories", { userId, ...args, name, color, isSystem: false });
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    essential: v.boolean(),
  },
  handler: async (ctx, { id, name, essential }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Category not found");
    await ctx.db.patch(id, { name: requireName(name), essential });
  },
});

export const deleteCategory = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Category not found");
    const used = await ctx.db
      .query("transactions")
      .withIndex("by_category", (q) => q.eq("categoryId", id))
      .first();
    if (used) {
      // Soft-archive so existing transaction history stays meaningful.
      await ctx.db.patch(id, { archived: true });
      return "archived" as const;
    }
    await ctx.db.delete(id);
    return "deleted" as const;
  },
});

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((r) => !r.archived);
  },
});

export const createAccount = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("checking"), v.literal("savings"), v.literal("cash"), v.literal("credit")),
    startingBalanceCents: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await ctx.db.insert("accounts", { userId, ...args, name: requireName(args.name) });
  },
});

export const updateAccount = mutation({
  args: {
    id: v.id("accounts"),
    name: v.string(),
    kind: v.union(v.literal("checking"), v.literal("savings"), v.literal("cash"), v.literal("credit")),
    startingBalanceCents: v.number(),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    patch.name = requireName(patch.name);
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Account not found");
    await ctx.db.patch(id, patch);
  },
});

export const deleteAccount = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Account not found");
    const used = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", id))
      .first();
    if (used) {
      await ctx.db.patch(id, { archived: true });
      return "archived" as const;
    }
    await ctx.db.delete(id);
    return "deleted" as const;
  },
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Whitelisted on purpose: pinHash/pinSalt must never reach the client —
    // a 4-6 digit PIN's hash is trivially brute-forceable offline once the
    // salt is known, which defeats verifyPin's server-side rate limiting.
    return {
      bufferPct: row?.bufferPct ?? DEFAULT_BUFFER_PCT,
      age: row?.age,
    };
  },
});

// ---------------------------------------------------------------------------
// App-lock PIN — a local "quick glance" gate on top of real auth (not a
// replacement for it). The PIN itself never leaves the server: setPin only
// stores a salted hash, and verifyPin is the only thing that can check a
// guess, with a short lockout after repeated failures.
// ---------------------------------------------------------------------------

export const isPinEnabled = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return row?.pinHash !== undefined;
  },
});

export const setPin = mutation({
  args: { pin: v.string() },
  handler: async (ctx, { pin }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4-6 digits");

    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = toHex(saltBytes);
    const pinHash = hashPin(pin, salt);

    const row = await ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    const patch = { pinHash, pinSalt: salt, pinFailedAttempts: 0, pinLockedUntil: undefined };
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else {
      await ctx.db.insert("settings", { userId, bufferPct: DEFAULT_BUFFER_PCT, ...patch });
    }
  },
});

export const clearPin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      pinHash: undefined,
      pinSalt: undefined,
      pinFailedAttempts: 0,
      pinLockedUntil: undefined,
    });
  },
});

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30 * 1000;

export const verifyPin = mutation({
  args: { pin: v.string() },
  handler: async (ctx, { pin }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (!row?.pinHash || !row.pinSalt) return { ok: true as const }; // no PIN set — nothing to gate

    const now = Date.now();
    if (row.pinLockedUntil && row.pinLockedUntil > now) {
      const seconds = Math.ceil((row.pinLockedUntil - now) / 1000);
      return { ok: false as const, lockedForSeconds: seconds };
    }

    const matches = hashPin(pin, row.pinSalt) === row.pinHash;
    if (matches) {
      await ctx.db.patch(row._id, { pinFailedAttempts: 0, pinLockedUntil: undefined });
      return { ok: true as const };
    }

    const attempts = (row.pinFailedAttempts ?? 0) + 1;
    if (attempts >= PIN_MAX_ATTEMPTS) {
      await ctx.db.patch(row._id, { pinFailedAttempts: 0, pinLockedUntil: now + PIN_LOCKOUT_MS });
      return { ok: false as const, lockedForSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000) };
    }
    await ctx.db.patch(row._id, { pinFailedAttempts: attempts });
    return { ok: false as const, attemptsRemaining: PIN_MAX_ATTEMPTS - attempts };
  },
});

export const setBufferPct = mutation({
  args: { bufferPct: v.number() },
  handler: async (ctx, { bufferPct }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const clamped = Math.min(100, Math.max(0, Math.round(bufferPct)));
    if (row) {
      await ctx.db.patch(row._id, { bufferPct: clamped });
    } else {
      await ctx.db.insert("settings", { userId, bufferPct: clamped });
    }
  },
});

export const setAge = mutation({
  args: { age: v.optional(v.number()) },
  handler: async (ctx, { age }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (age !== undefined && (age < 0 || age > 120)) throw new Error("Enter a valid age");
    const row = await ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    const clamped = age === undefined ? undefined : Math.round(age);
    if (row) {
      await ctx.db.patch(row._id, { age: clamped });
    } else {
      await ctx.db.insert("settings", { userId, bufferPct: DEFAULT_BUFFER_PCT, age: clamped });
    }
  },
});

// Real (not projected) balance held in savings-kind accounts — used as the
// "current progress" figure for the emergency-fund guideline.
export const getSavingsBalanceCents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const [accounts, transactions] = await Promise.all([
      ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("transactions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);
    const savingsAccountIds = new Set(
      accounts.filter((a) => a.kind === "savings" && !a.archived).map((a) => a._id),
    );
    const today = new Date().toISOString().slice(0, 10);
    let balanceCents = accounts
      .filter((a) => savingsAccountIds.has(a._id))
      .reduce((sum, a) => sum + a.startingBalanceCents, 0);
    for (const t of transactions) {
      if (t.date > today || !savingsAccountIds.has(t.accountId)) continue;
      balanceCents += t.type === "income" ? t.amountCents : -t.amountCents;
    }
    return balanceCents;
  },
});

export const updateProfileName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) throw new Error("Name cannot be empty");
    await ctx.db.patch(userId, { name: trimmed });
  },
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const addTransaction = mutation({
  args: {
    type: v.union(v.literal("income"), v.literal("expense")),
    amountCents: v.number(),
    date: v.string(), // "YYYY-MM-DD"
    merchant: v.string(),
    categoryId: v.id("categories"),
    accountId: v.id("accounts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.amountCents <= 0) throw new Error("Amount must be greater than zero");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Invalid date");
    const [category, account] = await Promise.all([
      ctx.db.get(args.categoryId),
      ctx.db.get(args.accountId),
    ]);
    if (!category || category.userId !== userId) throw new Error("Category not found");
    if (!account || account.userId !== userId) throw new Error("Account not found");
    return await ctx.db.insert("transactions", { userId, ...args });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    type: v.union(v.literal("income"), v.literal("expense")),
    amountCents: v.number(),
    date: v.string(),
    merchant: v.string(),
    categoryId: v.id("categories"),
    accountId: v.id("accounts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Transaction not found");
    if (patch.amountCents <= 0) throw new Error("Amount must be greater than zero");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) throw new Error("Invalid date");
    const [category, account] = await Promise.all([
      ctx.db.get(patch.categoryId),
      ctx.db.get(patch.accountId),
    ]);
    if (!category || category.userId !== userId) throw new Error("Category not found");
    if (!account || account.userId !== userId) throw new Error("Account not found");
    await ctx.db.patch(id, patch);
  },
});

export const deleteTransaction = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Transaction not found");
    await ctx.db.delete(id);
  },
});

export const listTransactions = query({
  args: {
    // Inclusive "YYYY-MM-DD" bounds. Omit both for the most recent history.
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, { fromDate, toDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const all = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    const rows = all.filter(
      (t) => (!fromDate || t.date >= fromDate) && (!toDate || t.date <= toDate),
    );
    const sorted = rows.sort((a, b) =>
      a.date === b.date ? b._creationTime - a._creationTime : b.date.localeCompare(a.date),
    );
    return fromDate || toDate ? sorted : sorted.slice(0, 400);
  },
});

// Full, uncapped history with category/account names resolved — for CSV
// export. listTransactions above intentionally caps at 400 rows for the
// Activity feed; export needs everything.
export const exportTransactions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const [transactions, categories, accounts] = await Promise.all([
      ctx.db.query("transactions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);
    const catsById = new Map(categories.map((c) => [c._id, c]));
    const accountsById = new Map(accounts.map((a) => [a._id, a]));

    return transactions
      .sort((a, b) =>
        a.date === b.date ? b._creationTime - a._creationTime : b.date.localeCompare(a.date),
      )
      .map((t) => ({
        date: t.date,
        type: t.type,
        merchant: t.merchant,
        category: catsById.get(t.categoryId)?.name ?? "Uncategorized",
        account: accountsById.get(t.accountId)?.name ?? "Unknown",
        amountCents: t.amountCents,
        note: t.note ?? "",
      }));
  },
});

// ---------------------------------------------------------------------------
// The v1 calculation engine — all integer cents.
//
//   Balance        = starting balances + every transaction delta dated <= today
//                    (credit-card expenses don't reduce cash until paid)
//   Balance before month = the same, but only transactions strictly before
//                    the viewed month's 1st — i.e. what carried in.
//   Buffer         = bufferPct of this month's income (default 10%)
//   Safe to spend  = max(0, Balance before month + month income
//                          - month essentials - Buffer)
//   Safe remaining = max(0, Safe to spend - month discretionary spent)
//
// "Balance before month" (not today's running balance) is what's added to
// this month's income: today's balance already has this month's income and
// essentials netted into it, so adding the full running balance on top of
// month income/essentials here would double-count both — safe-to-spend
// would jump by 2x every paycheck. Carrying in only the pre-month balance
// keeps each month's income/essentials counted exactly once.
//
// The three dashboard numbers answer: how much do I have, how much is
// committed, and how much can I safely spend — per the product spec.
// ---------------------------------------------------------------------------

export interface MonthStats {
  monthKey: string; // "YYYY-MM"
  incomeCents: number;
  spentCents: number;
  essentialCents: number;
  discretionaryCents: number;
  bufferPct: number;
  bufferCents: number;
  safeToSpendCents: number;
  safeSpentCents: number;
  safeRemainingCents: number;
  balanceCents: number;
  byCategory: Array<{
    categoryId: string;
    name: string;
    color: string;
    icon: string;
    cents: number;
  }>;
}

export const getMonthlyStats = query({
  args: { monthKey: v.string() }, // "YYYY-MM"
  handler: async (ctx, { monthKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Invalid monthKey");

    const [settings, accounts, categories, transactions] = await Promise.all([
      ctx.db.query("settings").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("accounts").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("transactions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);

    const activeAccounts = accounts.filter((a) => !a.archived);
    const catsById = new Map(categories.map((c) => [c._id, c]));
    const accountKind = new Map(activeAccounts.map((a) => [a._id, a.kind]));

    const bufferPct = Math.min(100, Math.max(0, settings?.bufferPct ?? DEFAULT_BUFFER_PCT));
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${monthKey}-01`;

    const startingCents = activeAccounts.reduce(
      (sum, a) => sum + (a.kind === "credit" ? -a.startingBalanceCents : a.startingBalanceCents),
      0,
    );
    let balanceCents = startingCents;
    let balanceBeforeMonthCents = startingCents;
    let incomeCents = 0;
    let spentCents = 0;
    let essentialCents = 0;
    const catTotals = new Map<Id<"categories">, number>();

    for (const t of transactions) {
      if (t.date > today) continue;
      const beforeMonth = t.date < monthStart;
      if (t.type === "income") {
        balanceCents += t.amountCents;
        if (beforeMonth) balanceBeforeMonthCents += t.amountCents;
        if (t.date.startsWith(monthKey)) incomeCents += t.amountCents;
      } else {
        // Credit-card spending is a liability, not cash out the door.
        if (accountKind.get(t.accountId) !== "credit") {
          balanceCents -= t.amountCents;
          if (beforeMonth) balanceBeforeMonthCents -= t.amountCents;
        }
        if (t.date.startsWith(monthKey)) {
          spentCents += t.amountCents;
          if (catsById.get(t.categoryId)?.essential === true) essentialCents += t.amountCents;
          catTotals.set(t.categoryId, (catTotals.get(t.categoryId) ?? 0) + t.amountCents);
        }
      }
    }

    const bufferCents = Math.round((incomeCents * bufferPct) / 100);
    const safeToSpendCents = Math.max(
      0,
      balanceBeforeMonthCents + incomeCents - essentialCents - bufferCents,
    );
    const safeSpentCents = Math.max(0, spentCents - essentialCents);
    const safeRemainingCents = Math.max(0, safeToSpendCents - safeSpentCents);

    const byCategory = [...catTotals.entries()]
      .map(([categoryId, cents]) => {
        const cat = catsById.get(categoryId);
        return {
          categoryId,
          cents,
          name: cat?.name ?? "Uncategorized",
          color: cat?.color ?? "#64748b",
          icon: cat?.icon ?? "CircleDot",
        };
      })
      .sort((a, b) => b.cents - a.cents);

    const stats: MonthStats = {
      monthKey,
      incomeCents,
      spentCents,
      essentialCents,
      discretionaryCents: spentCents - essentialCents,
      bufferPct,
      bufferCents,
      safeToSpendCents,
      safeSpentCents,
      safeRemainingCents,
      balanceCents,
      byCategory,
    };
    return stats;
  },
});

// ---------------------------------------------------------------------------
// Trend — income/spent for the last N months, oldest first. Powers the
// month-over-month bar chart.
// ---------------------------------------------------------------------------

export const getTrend = query({
  args: { months: v.number() },
  handler: async (ctx, { months }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const count = Math.min(24, Math.max(1, Math.round(months)));

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();

    const today = new Date().toISOString().slice(0, 10);
    const keys: string[] = [];
    {
      let [y, m] = today.slice(0, 7).split("-").map(Number);
      for (let i = 0; i < count; i++) {
        keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
        m -= 1;
        if (m === 0) {
          m = 12;
          y -= 1;
        }
      }
    }

    const byMonth = new Map<string, { incomeCents: number; spentCents: number }>(
      keys.map((k) => [k, { incomeCents: 0, spentCents: 0 }]),
    );
    for (const t of transactions) {
      if (t.date > today) continue;
      const key = t.date.slice(0, 7);
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      if (t.type === "income") bucket.incomeCents += t.amountCents;
      else bucket.spentCents += t.amountCents;
    }

    return keys.map((monthKey) => ({ monthKey, ...byMonth.get(monthKey)! }));
  },
});

// ---------------------------------------------------------------------------
// Budgets — one recurring monthly target per category (§9 of the product
// spec). Progress is computed against the requested month's transactions.
// ---------------------------------------------------------------------------

export const listBudgetsWithProgress = query({
  args: { monthKey: v.string() },
  handler: async (ctx, { monthKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Invalid monthKey");

    const [budgets, categories, transactions] = await Promise.all([
      ctx.db.query("budgets").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("transactions").withIndex("by_user_date", (q) => q.eq("userId", userId)).collect(),
    ]);
    const catsById = new Map(categories.map((c) => [c._id, c]));

    const spentByCategory = new Map<Id<"categories">, number>();
    for (const t of transactions) {
      if (t.type !== "expense" || !t.date.startsWith(monthKey)) continue;
      spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amountCents);
    }

    const today = new Date().toISOString().slice(0, 10);
    const isCurrentMonth = monthKey === today.slice(0, 7);
    const elapsedDays = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonthOf(monthKey);
    const totalDays = daysInMonthOf(monthKey);

    return budgets
      .map((b) => {
        const cat = catsById.get(b.categoryId);
        const spentCents = spentByCategory.get(b.categoryId) ?? 0;
        const projectedCents =
          isCurrentMonth && elapsedDays > 0
            ? Math.round((spentCents / elapsedDays) * totalDays)
            : spentCents;
        return {
          budgetId: b._id,
          categoryId: b.categoryId,
          name: cat?.name ?? "Uncategorized",
          color: cat?.color ?? "#64748b",
          icon: cat?.icon ?? "CircleDot",
          monthlyCents: b.monthlyCents,
          spentCents,
          remainingCents: b.monthlyCents - spentCents,
          pctUsed: b.monthlyCents > 0 ? Math.round((spentCents / b.monthlyCents) * 100) : 0,
          projectedCents,
          projectedOverBudget: isCurrentMonth && projectedCents > b.monthlyCents,
        };
      })
      .sort((a, b) => b.pctUsed - a.pctUsed);
  },
});

export const setBudget = mutation({
  args: { categoryId: v.id("categories"), monthlyCents: v.number() },
  handler: async (ctx, { categoryId, monthlyCents }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (monthlyCents < 0) throw new Error("Budget must be zero or more");
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== userId) throw new Error("Category not found");

    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", categoryId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { monthlyCents });
    } else {
      await ctx.db.insert("budgets", { userId, categoryId, monthlyCents });
    }
  },
});

export const deleteBudget = mutation({
  args: { id: v.id("budgets") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Budget not found");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Debts — balance/APR/minimum payment per debt (§17 of the product spec).
// Avalanche/snowball payoff math is pure and runs client-side (src/lib/debtPayoff.ts)
// against this list, so the "what if I pay $X extra" slider needs no round trip.
// ---------------------------------------------------------------------------

export const listDebts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const rows = await ctx.db.query("debts").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.filter((r) => !r.archived);
  },
});

export const createDebt = mutation({
  args: {
    name: v.string(),
    balanceCents: v.number(),
    aprBps: v.number(),
    minPaymentCents: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.balanceCents < 0 || args.aprBps < 0 || args.minPaymentCents < 0) {
      throw new Error("Values must be zero or more");
    }
    return await ctx.db.insert("debts", { userId, ...args, name: requireName(args.name) });
  },
});

export const updateDebt = mutation({
  args: {
    id: v.id("debts"),
    name: v.string(),
    balanceCents: v.number(),
    aprBps: v.number(),
    minPaymentCents: v.number(),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Debt not found");
    if (patch.balanceCents < 0 || patch.aprBps < 0 || patch.minPaymentCents < 0) {
      throw new Error("Values must be zero or more");
    }
    patch.name = requireName(patch.name);
    await ctx.db.patch(id, patch);
  },
});

export const deleteDebt = mutation({
  args: { id: v.id("debts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Debt not found");
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// Savings goals — envelope-style. Progress is a manually-tracked savedCents
// balance (contribute/withdraw), not derived from transactions or accounts,
// so a goal can stand for money set aside however the user actually manages it.
// ---------------------------------------------------------------------------

export const listGoals = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const rows = await ctx.db.query("goals").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.filter((r) => !r.archived).sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const createGoal = mutation({
  args: {
    name: v.string(),
    targetCents: v.number(),
    targetDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.targetCents <= 0) throw new Error("Target must be greater than zero");
    if (args.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.targetDate)) throw new Error("Invalid date");
    return await ctx.db.insert("goals", {
      userId,
      name: requireName(args.name),
      targetCents: args.targetCents,
      targetDate: args.targetDate,
      savedCents: 0,
    });
  },
});

export const updateGoal = mutation({
  args: {
    id: v.id("goals"),
    name: v.string(),
    targetCents: v.number(),
    targetDate: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Goal not found");
    if (patch.targetCents <= 0) throw new Error("Target must be greater than zero");
    if (patch.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.targetDate)) throw new Error("Invalid date");
    await ctx.db.patch(id, { name: requireName(patch.name), targetCents: patch.targetCents, targetDate: patch.targetDate });
  },
});

export const contributeToGoal = mutation({
  args: { id: v.id("goals"), deltaCents: v.number() },
  handler: async (ctx, { id, deltaCents }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Goal not found");
    const savedCents = Math.max(0, existing.savedCents + deltaCents);
    await ctx.db.patch(id, { savedCents });
    return savedCents;
  },
});

export const deleteGoal = mutation({
  args: { id: v.id("goals") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const existing = await ctx.db.get(id);
    if (!existing || existing.userId !== userId) throw new Error("Goal not found");
    await ctx.db.delete(id);
  },
});
