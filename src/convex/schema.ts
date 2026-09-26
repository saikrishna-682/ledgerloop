import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Money is always stored as integer cents (e.g. $12.34 -> 1234).

    accounts: defineTable({
      userId: v.id("users"),
      name: v.string(),
      kind: v.union(
        v.literal("checking"),
        v.literal("savings"),
        v.literal("cash"),
        v.literal("credit"),
      ),
      startingBalanceCents: v.number(),
      archived: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),

    categories: defineTable({
      userId: v.id("users"),
      name: v.string(),
      kind: v.union(v.literal("expense"), v.literal("income")),
      icon: v.string(), // lucide icon name, resolved on the client
      color: v.string(), // hex color used for chips and charts
      essential: v.optional(v.boolean()),
      isSystem: v.optional(v.boolean()),
      archived: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),

    transactions: defineTable({
      userId: v.id("users"),
      accountId: v.id("accounts"),
      categoryId: v.id("categories"),
      type: v.union(v.literal("income"), v.literal("expense")),
      amountCents: v.number(),
      date: v.string(), // "YYYY-MM-DD"
      merchant: v.string(),
      note: v.optional(v.string()),
    })
      .index("by_user_date", ["userId", "date"])
      .index("by_account", ["accountId"])
      .index("by_category", ["categoryId"]),

    settings: defineTable({
      userId: v.id("users"),
      bufferPct: v.number(), // 0-100, % of monthly income held back as buffer
      age: v.optional(v.number()), // used only for the age-based stock allocation guideline
    }).index("by_user", ["userId"]),

    // One row per category the user has set a monthly target for. The target
    // applies every month (no monthKey) — simple recurring budgets, not
    // per-month-specific ones.
    budgets: defineTable({
      userId: v.id("users"),
      categoryId: v.id("categories"),
      monthlyCents: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_category", ["userId", "categoryId"]),

    debts: defineTable({
      userId: v.id("users"),
      name: v.string(),
      balanceCents: v.number(),
      aprBps: v.number(), // APR in basis points, e.g. 24.99% -> 2499
      minPaymentCents: v.number(),
      archived: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
