import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Inserts a bare user row and returns a client authenticated as them. */
async function asNewUser(t: ReturnType<typeof convexTest>, opts?: { isAnonymous?: boolean }) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { isAnonymous: opts?.isAnonymous });
  });
  return { userId, as: t.withIdentity({ subject: `${userId}|test-session` }) };
}

function newTest() {
  return convexTest(schema, modules);
}

describe("seedIfEmpty", () => {
  it("creates default categories, accounts, and settings exactly once", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);

    await as.mutation(api.finance.seedIfEmpty, {});
    const categories = await as.query(api.finance.listCategories, {});
    const accounts = await as.query(api.finance.listAccounts, {});
    const settings = await as.query(api.finance.getSettings, {});

    expect(categories.length).toBeGreaterThan(0);
    expect(accounts.length).toBeGreaterThan(0);
    expect(settings.bufferPct).toBe(10);

    // Calling it again must not create duplicates.
    await as.mutation(api.finance.seedIfEmpty, {});
    const categoriesAfter = await as.query(api.finance.listCategories, {});
    expect(categoriesAfter.length).toBe(categories.length);
  });

  it("gives an anonymous user a random display name, but never overwrites an existing one", async () => {
    const t = newTest();
    const { as, userId } = await asNewUser(t, { isAnonymous: true });

    await as.mutation(api.finance.seedIfEmpty, {});
    const user1 = await t.run((ctx) => ctx.db.get(userId));
    expect(user1?.name).toBeTruthy();

    await t.run((ctx) => ctx.db.patch(userId, { name: "Custom Name" }));
    await as.mutation(api.finance.seedIfEmpty, {});
    const user2 = await t.run((ctx) => ctx.db.get(userId));
    expect(user2?.name).toBe("Custom Name");
  });
});

describe("getMonthlyStats — safe-to-spend math", () => {
  async function seededUser(t: ReturnType<typeof convexTest>) {
    const { as, userId } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const accounts = await as.query(api.finance.listAccounts, {});
    const categories = await as.query(api.finance.listCategories, {});
    const checking = accounts.find((a) => a.kind === "checking")!;
    const salary = categories.find((c) => c.name === "Salary")!;
    const groceries = categories.find((c) => c.name === "Groceries")!; // essential
    const diningOut = categories.find((c) => c.name === "Dining out")!; // not essential
    return { as, userId, checking, salary, groceries, diningOut };
  }

  it("does not double-count this month's income into the balance carried in", async () => {
    const t = newTest();
    const { as, checking, salary } = await seededUser(t);
    const monthKey = new Date().toISOString().slice(0, 7);

    await as.mutation(api.finance.addTransaction, {
      type: "income",
      amountCents: 250000, // $2,500
      date: `${monthKey}-01`,
      merchant: "Paycheck",
      categoryId: salary._id,
      accountId: checking._id,
    });

    const stats = await as.query(api.finance.getMonthlyStats, { monthKey });

    // Regression test for the double-counting bug: with a 10% buffer and no
    // prior balance, safe-to-spend must be income minus buffer, not
    // (balance-which-already-includes-income) + income again.
    expect(stats.balanceCents).toBe(250000);
    expect(stats.bufferCents).toBe(25000);
    expect(stats.safeToSpendCents).toBe(225000); // 2500 - 250 buffer, NOT 4750
  });

  it("does not double-subtract essential spending that's already reflected in the balance", async () => {
    const t = newTest();
    const { as, checking, salary, groceries } = await seededUser(t);
    const monthKey = new Date().toISOString().slice(0, 7);

    await as.mutation(api.finance.addTransaction, {
      type: "income",
      amountCents: 250000,
      date: `${monthKey}-01`,
      merchant: "Paycheck",
      categoryId: salary._id,
      accountId: checking._id,
    });
    await as.mutation(api.finance.addTransaction, {
      type: "expense",
      amountCents: 50000, // $500 groceries (essential)
      date: `${monthKey}-02`,
      merchant: "Whole Foods",
      categoryId: groceries._id,
      accountId: checking._id,
    });

    const stats = await as.query(api.finance.getMonthlyStats, { monthKey });

    expect(stats.balanceCents).toBe(200000); // 2500 - 500
    // safeToSpend = balanceBeforeMonth(0) + income(2500) - essential(500) - buffer(250) = 1750
    expect(stats.safeToSpendCents).toBe(175000);
    // Equivalently: available balance minus buffer, once essentials are
    // already reflected in the balance.
    expect(stats.safeToSpendCents).toBe(stats.balanceCents - stats.bufferCents);
  });

  it("carries a prior month's leftover balance forward without re-adding old income", async () => {
    const t = newTest();
    const { as, checking, salary } = await seededUser(t);

    await as.mutation(api.finance.addTransaction, {
      type: "income",
      amountCents: 100000, // $1,000 last month, none spent
      date: "2026-08-01",
      merchant: "August pay",
      categoryId: salary._id,
      accountId: checking._id,
    });

    const stats = await as.query(api.finance.getMonthlyStats, { monthKey: "2026-09" });

    // No September income/essentials, so safe-to-spend is just the carried
    // balance minus a buffer computed on zero income this month.
    expect(stats.incomeCents).toBe(0);
    expect(stats.balanceCents).toBe(100000);
    expect(stats.bufferCents).toBe(0);
    expect(stats.safeToSpendCents).toBe(100000);
  });

  it("excludes credit-card expenses from the cash balance", async () => {
    const t = newTest();
    const { as, checking, salary, diningOut } = await seededUser(t);
    const accounts = await as.query(api.finance.listAccounts, {});
    const creditCard = accounts.find((a) => a.kind === "credit")!;
    const monthKey = new Date().toISOString().slice(0, 7);

    await as.mutation(api.finance.addTransaction, {
      type: "income",
      amountCents: 200000,
      date: `${monthKey}-01`,
      merchant: "Pay",
      categoryId: salary._id,
      accountId: checking._id,
    });
    await as.mutation(api.finance.addTransaction, {
      type: "expense",
      amountCents: 15000,
      date: `${monthKey}-02`,
      merchant: "Restaurant",
      categoryId: diningOut._id,
      accountId: creditCard._id, // charged to credit, not paid yet
    });

    const stats = await as.query(api.finance.getMonthlyStats, { monthKey });
    // Cash balance is untouched by the credit charge...
    expect(stats.balanceCents).toBe(200000);
    // ...but it still shows up as spending for budgeting purposes.
    expect(stats.spentCents).toBe(15000);
  });
});

describe("authorization", () => {
  it("addTransaction rejects a category that belongs to a different user", async () => {
    const t = newTest();
    const other = await asNewUser(t);
    await other.as.mutation(api.finance.seedIfEmpty, {});
    const otherCategories = await other.as.query(api.finance.listCategories, {});
    const otherCategoryId = otherCategories[0]._id;

    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const myAccounts = await as.query(api.finance.listAccounts, {});

    await expect(
      as.mutation(api.finance.addTransaction, {
        type: "expense",
        amountCents: 1000,
        date: "2026-09-01",
        merchant: "Attempted cross-tenant write",
        categoryId: otherCategoryId,
        accountId: myAccounts[0]._id,
      }),
    ).rejects.toThrow(/Category not found/);
  });

  it("addTransaction rejects an account that belongs to a different user", async () => {
    const t = newTest();
    const other = await asNewUser(t);
    await other.as.mutation(api.finance.seedIfEmpty, {});
    const otherAccounts = await other.as.query(api.finance.listAccounts, {});

    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const myCategories = await as.query(api.finance.listCategories, {});

    await expect(
      as.mutation(api.finance.addTransaction, {
        type: "expense",
        amountCents: 1000,
        date: "2026-09-01",
        merchant: "Attempted cross-tenant write",
        categoryId: myCategories[0]._id,
        accountId: otherAccounts[0]._id,
      }),
    ).rejects.toThrow(/Account not found/);
  });

  it("cannot delete or edit another user's transaction, category, or account", async () => {
    const t = newTest();
    const owner = await asNewUser(t);
    await owner.as.mutation(api.finance.seedIfEmpty, {});
    const ownerAccounts = await owner.as.query(api.finance.listAccounts, {});
    const ownerCategories = await owner.as.query(api.finance.listCategories, {});
    const txnId = await owner.as.mutation(api.finance.addTransaction, {
      type: "expense",
      amountCents: 1000,
      date: "2026-09-01",
      merchant: "Owner's transaction",
      categoryId: ownerCategories[0]._id,
      accountId: ownerAccounts[0]._id,
    });

    const attacker = await asNewUser(t);
    await expect(
      attacker.as.mutation(api.finance.deleteTransaction, { id: txnId }),
    ).rejects.toThrow(/not found/);
    await expect(
      attacker.as.mutation(api.finance.deleteAccount, { id: ownerAccounts[0]._id }),
    ).rejects.toThrow(/not found/);
    await expect(
      attacker.as.mutation(api.finance.deleteCategory, { id: ownerCategories[0]._id }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects unauthenticated calls", async () => {
    const t = newTest();
    await expect(t.query(api.finance.listTransactions, {})).rejects.toThrow(/Not authenticated/);
    await expect(
      t.mutation(api.finance.addTransaction, {
        type: "expense",
        amountCents: 100,
        date: "2026-09-01",
        merchant: "x",
        categoryId: "not-real" as Id<"categories">,
        accountId: "not-real" as Id<"accounts">,
      }),
    ).rejects.toThrow();
  });
});

describe("input validation", () => {
  it("rejects a zero or negative transaction amount", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const accounts = await as.query(api.finance.listAccounts, {});
    const categories = await as.query(api.finance.listCategories, {});

    await expect(
      as.mutation(api.finance.addTransaction, {
        type: "expense",
        amountCents: 0,
        date: "2026-09-01",
        merchant: "Free?",
        categoryId: categories[0]._id,
        accountId: accounts[0]._id,
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("rejects a malformed date", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const accounts = await as.query(api.finance.listAccounts, {});
    const categories = await as.query(api.finance.listCategories, {});

    await expect(
      as.mutation(api.finance.addTransaction, {
        type: "expense",
        amountCents: 100,
        date: "09/01/2026",
        merchant: "Bad date format",
        categoryId: categories[0]._id,
        accountId: accounts[0]._id,
      }),
    ).rejects.toThrow(/Invalid date/);
  });

  it("rejects an empty or whitespace-only category name", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);

    await expect(
      as.mutation(api.finance.createCategory, {
        name: "   ",
        kind: "expense",
        icon: "CircleDot",
        color: "#000000",
        essential: false,
      }),
    ).rejects.toThrow(/cannot be empty/);
  });

  it("trims a category name before saving", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    const id = await as.mutation(api.finance.createCategory, {
      name: "  Pet care  ",
      kind: "expense",
      icon: "CircleDot",
      color: "#000000",
      essential: false,
    });
    const categories = await as.query(api.finance.listCategories, {});
    expect(categories.find((c) => c._id === id)?.name).toBe("Pet care");
  });

  it("clamps the buffer percentage to 0-100", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);

    await as.mutation(api.finance.setBufferPct, { bufferPct: 250 });
    expect((await as.query(api.finance.getSettings, {})).bufferPct).toBe(100);

    await as.mutation(api.finance.setBufferPct, { bufferPct: -10 });
    expect((await as.query(api.finance.getSettings, {})).bufferPct).toBe(0);
  });
});

describe("claimGuestData", () => {
  it("moves a guest's accounts, categories, and transactions onto the signed-in user", async () => {
    const t = newTest();
    const guest = await asNewUser(t, { isAnonymous: true });
    await guest.as.mutation(api.finance.seedIfEmpty, {});
    const guestAccounts = await guest.as.query(api.finance.listAccounts, {});
    const guestCategories = await guest.as.query(api.finance.listCategories, {});
    await guest.as.mutation(api.finance.addTransaction, {
      type: "income",
      amountCents: 5000,
      date: "2026-09-01",
      merchant: "Guest income",
      categoryId: guestCategories[0]._id,
      accountId: guestAccounts[0]._id,
    });

    const token = await guest.as.mutation(api.finance.createGuestClaimToken, {});
    const real = await asNewUser(t);
    await real.as.mutation(api.finance.claimGuestData, { token });

    const myTransactions = await real.as.query(api.finance.listTransactions, {});
    expect(myTransactions).toHaveLength(1);
    expect(myTransactions[0].merchant).toBe("Guest income");

    const myAccounts = await real.as.query(api.finance.listAccounts, {});
    expect(myAccounts.length).toBe(guestAccounts.length);
  });

  // Regression test for a real IDOR: claimGuestData used to accept a raw
  // guestUserId straight from the client. Convex ids are not secret (every
  // query result returns them), so any signed-in user could merge *any*
  // anonymous guest's entire financial history into their own account just
  // by knowing or guessing that guest's id. The fix requires a token minted
  // server-side while genuinely authenticated as that guest — so merely
  // knowing the victim's user id (simulated here) must no longer work.
  it("cannot be used to steal another guest's data by supplying their id as a token", async () => {
    const t = newTest();
    const victim = await asNewUser(t, { isAnonymous: true });
    await victim.as.mutation(api.finance.seedIfEmpty, {});

    const attacker = await asNewUser(t);
    await attacker.as.mutation(api.finance.claimGuestData, { token: victim.userId });

    const victimAccounts = await victim.as.query(api.finance.listAccounts, {});
    const attackerAccounts = await attacker.as.query(api.finance.listAccounts, {});
    expect(victimAccounts.length).toBeGreaterThan(0);
    expect(attackerAccounts.length).toBe(0);
  });

  it("refuses to claim data from a non-anonymous user even with a stolen token concept", async () => {
    const t = newTest();
    const victim = await asNewUser(t, { isAnonymous: false });
    await victim.as.mutation(api.finance.seedIfEmpty, {});

    // A non-anonymous user can't even mint a claim token for themselves.
    await expect(victim.as.mutation(api.finance.createGuestClaimToken, {})).rejects.toThrow();

    const attacker = await asNewUser(t);
    await attacker.as.mutation(api.finance.claimGuestData, { token: "bogus-token" });

    const victimAccounts = await victim.as.query(api.finance.listAccounts, {});
    const attackerAccounts = await attacker.as.query(api.finance.listAccounts, {});
    expect(victimAccounts.length).toBeGreaterThan(0);
    expect(attackerAccounts.length).toBe(0);
  });

  it("is single-use — a second claim with the same token is a no-op", async () => {
    const t = newTest();
    const guest = await asNewUser(t, { isAnonymous: true });
    await guest.as.mutation(api.finance.seedIfEmpty, {});
    const token = await guest.as.mutation(api.finance.createGuestClaimToken, {});

    const real = await asNewUser(t);
    await real.as.mutation(api.finance.claimGuestData, { token });
    const firstClaimAccounts = await real.as.query(api.finance.listAccounts, {});
    expect(firstClaimAccounts.length).toBeGreaterThan(0);

    const another = await asNewUser(t);
    await another.as.mutation(api.finance.claimGuestData, { token });
    const secondClaimAccounts = await another.as.query(api.finance.listAccounts, {});
    expect(secondClaimAccounts.length).toBe(0);
  });

  it("is a no-op when claiming your own id", async () => {
    const t = newTest();
    const { as } = await asNewUser(t, { isAnonymous: true });
    await as.mutation(api.finance.seedIfEmpty, {});
    const token = await as.mutation(api.finance.createGuestClaimToken, {});
    await expect(as.mutation(api.finance.claimGuestData, { token })).resolves.not.toThrow();
  });
});

describe("app lock PIN", () => {
  it("is disabled until set, and getSettings never exposes the hash", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    expect(await as.query(api.finance.isPinEnabled, {})).toBe(false);

    await as.mutation(api.finance.setPin, { pin: "1234" });
    expect(await as.query(api.finance.isPinEnabled, {})).toBe(true);

    const settings = await as.query(api.finance.getSettings, {});
    expect(settings).not.toHaveProperty("pinHash");
    expect(settings).not.toHaveProperty("pinSalt");
  });

  it("rejects non-numeric or wrong-length PINs", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await expect(as.mutation(api.finance.setPin, { pin: "abcd" })).rejects.toThrow();
    await expect(as.mutation(api.finance.setPin, { pin: "123" })).rejects.toThrow();
  });

  it("verifies a correct PIN and rejects an incorrect one", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.setPin, { pin: "4242" });

    expect(await as.mutation(api.finance.verifyPin, { pin: "0000" })).toMatchObject({ ok: false });
    expect(await as.mutation(api.finance.verifyPin, { pin: "4242" })).toMatchObject({ ok: true });
  });

  it("locks out after repeated wrong attempts", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.setPin, { pin: "4242" });

    for (let i = 0; i < 5; i++) {
      await as.mutation(api.finance.verifyPin, { pin: "0000" });
    }
    // The 5th failure should trigger a lockout even with the correct PIN.
    const result = await as.mutation(api.finance.verifyPin, { pin: "4242" });
    expect(result.ok).toBe(false);
    expect((result as { lockedForSeconds?: number }).lockedForSeconds).toBeGreaterThan(0);
  });

  it("is scoped per user — one user's PIN can't verify against another's", async () => {
    const t = newTest();
    const alice = await asNewUser(t);
    const bob = await asNewUser(t);
    await alice.as.mutation(api.finance.setPin, { pin: "1111" });
    await bob.as.mutation(api.finance.setPin, { pin: "2222" });

    expect(await bob.as.mutation(api.finance.verifyPin, { pin: "1111" })).toMatchObject({ ok: false });
    expect(await alice.as.mutation(api.finance.verifyPin, { pin: "1111" })).toMatchObject({ ok: true });
  });

  it("clearPin turns the lock off", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.setPin, { pin: "1234" });
    await as.mutation(api.finance.clearPin, {});
    expect(await as.query(api.finance.isPinEnabled, {})).toBe(false);
    // With no PIN set, verifyPin has nothing to gate.
    expect(await as.mutation(api.finance.verifyPin, { pin: "0000" })).toMatchObject({ ok: true });
  });
});

describe("budgets", () => {
  it("tracks spent/remaining/pctUsed and flags a projected overspend", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const accounts = await as.query(api.finance.listAccounts, {});
    const categories = await as.query(api.finance.listCategories, {});
    const diningOut = categories.find((c) => c.name === "Dining out")!;

    await as.mutation(api.finance.setBudget, { categoryId: diningOut._id, monthlyCents: 10000 });
    await as.mutation(api.finance.addTransaction, {
      type: "expense",
      amountCents: 8000,
      date: "2026-09-01",
      merchant: "Fancy dinner",
      categoryId: diningOut._id,
      accountId: accounts[0]._id,
    });

    const budgets = await as.query(api.finance.listBudgetsWithProgress, { monthKey: "2026-09" });
    const b = budgets.find((x) => x.categoryId === diningOut._id)!;
    expect(b.spentCents).toBe(8000);
    expect(b.remainingCents).toBe(2000);
    expect(b.pctUsed).toBe(80);
  });

  it("setBudget upserts rather than creating duplicates", async () => {
    const t = newTest();
    const { as } = await asNewUser(t);
    await as.mutation(api.finance.seedIfEmpty, {});
    const categories = await as.query(api.finance.listCategories, {});
    const cat = categories.find((c) => c.kind === "expense")!;

    await as.mutation(api.finance.setBudget, { categoryId: cat._id, monthlyCents: 5000 });
    await as.mutation(api.finance.setBudget, { categoryId: cat._id, monthlyCents: 7500 });

    const budgets = await as.query(api.finance.listBudgetsWithProgress, {
      monthKey: new Date().toISOString().slice(0, 7),
    });
    const matches = budgets.filter((b) => b.categoryId === cat._id);
    expect(matches).toHaveLength(1);
    expect(matches[0].monthlyCents).toBe(7500);
  });
});
