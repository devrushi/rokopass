import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { getCreditBalance, getCreditSummary } from "../src/services/creditBalance";

const EMAIL_SUFFIX = "@credits.test.rokidspass.local";
const uniqueEmail = () => `credits-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let userId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(),
      passwordHash: "not-a-real-hash",
      firstName: "Credit",
      lastName: "Tester",
      role: "PARENT",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.creditTransaction.deleteMany({ where: { userId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("getCreditBalance", () => {
  it("returns 0 for a user with no transactions", async () => {
    expect(await getCreditBalance(userId)).toBe(0);
  });

  it("sums grants and deductions across the ledger", async () => {
    await prisma.creditTransaction.createMany({
      data: [
        { userId, amount: 8, reason: "SUBSCRIPTION_INITIAL" },
        { userId, amount: -2, reason: "BOOKING" },
        { userId, amount: -2, reason: "BOOKING" },
        { userId, amount: 2, reason: "BOOKING_REFUND" },
      ],
    });

    expect(await getCreditBalance(userId)).toBe(6);
  });
});

describe("getCreditSummary", () => {
  it("reports no plan/subscription when none exists", async () => {
    const summary = await getCreditSummary(userId);
    expect(summary.plan).toBeNull();
    expect(summary.subscriptionStatus).toBeNull();
    expect(summary.balance).toBe(6);
  });

  it("includes plan and subscription details once subscribed", async () => {
    const plan = await prisma.plan.upsert({
      where: { name: "__test_plan__" },
      update: {},
      create: {
        name: "__test_plan__",
        description: "test",
        monthlyCredits: 10,
        priceGbp: 999,
        stripePriceId: `price_test_${Date.now()}`,
      },
    });

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: `sub_test_${Date.now()}`,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      },
    });

    const summary = await getCreditSummary(userId);
    expect(summary.plan).toMatchObject({ id: plan.id, name: "__test_plan__", monthlyCredits: 10 });
    expect(summary.subscriptionStatus).toBe("ACTIVE");
    expect(summary.currentPeriodEnd).not.toBeNull();

    await prisma.subscription.delete({ where: { id: subscription.id } });
    await prisma.plan.delete({ where: { id: plan.id } });
  });
});
