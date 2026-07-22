import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { constructEventMock, subscriptionsRetrieveMock } = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  subscriptionsRetrieveMock: vi.fn(),
}));

vi.mock("../src/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subscriptionsRetrieveMock },
  },
}));

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { getCreditBalance } from "../src/services/creditBalance";

const app = createApp();

const EMAIL_SUFFIX = "@webhooks.test.rokidspass.local";
const uniqueEmail = () => `webhook-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: "__webhook_test_" } } });
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_test_" } } });
});

async function makePlan() {
  return prisma.plan.create({
    data: {
      name: `__webhook_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      description: "test",
      monthlyCredits: 10,
      priceGbp: 999,
      stripePriceId: `price_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },
  });
}

function fakeStripeSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_test_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 }] },
    ...overrides,
  };
}

describe("POST /webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a request with no Stripe-Signature header", async () => {
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));
    expect(res.status).toBe(400);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("rejects a request with a signature constructEvent rejects", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("signature mismatch");
    });

    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=bad")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
  });

  it("grants initial credits on checkout.session.completed", async () => {
    const plan = await makePlan();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(),
        passwordHash: "not-a-real-hash",
        firstName: "Web",
        lastName: "Hook",
        role: "PARENT",
      },
    });

    const event = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          subscription: "sub_test_123",
          metadata: { userId: user.id, planId: plan.id },
        },
      },
    };
    constructEventMock.mockReturnValue(event);
    subscriptionsRetrieveMock.mockResolvedValue(fakeStripeSubscription());

    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=whatever")
      .send(Buffer.from(JSON.stringify(event)));

    expect(res.status).toBe(200);

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription).toMatchObject({ status: "ACTIVE", stripeSubscriptionId: "sub_test_123" });
    expect(await getCreditBalance(user.id)).toBe(plan.monthlyCredits);
  });

  it("does not reprocess an event id it has already seen", async () => {
    const plan = await makePlan();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(),
        passwordHash: "not-a-real-hash",
        firstName: "Web",
        lastName: "Hook",
        role: "PARENT",
      },
    });

    const eventId = `evt_test_${Date.now()}`;
    const event = {
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_456",
          subscription: "sub_test_456",
          metadata: { userId: user.id, planId: plan.id },
        },
      },
    };
    constructEventMock.mockReturnValue(event);
    subscriptionsRetrieveMock.mockResolvedValue(fakeStripeSubscription({ id: "sub_test_456" }));

    const send = () =>
      request(app)
        .post("/webhooks/stripe")
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", "t=1,v1=whatever")
        .send(Buffer.from(JSON.stringify(event)));

    const first = await send();
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBeUndefined();

    const second = await send();
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    // Credits should only have been granted once despite two deliveries of the same event.
    expect(await getCreditBalance(user.id)).toBe(plan.monthlyCredits);
  });

  it("does not grant renewal credits for the initial invoice (billing_reason subscription_create)", async () => {
    const plan = await makePlan();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(),
        passwordHash: "not-a-real-hash",
        firstName: "Web",
        lastName: "Hook",
        role: "PARENT",
      },
    });
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        stripeSubscriptionId: "sub_test_789",
        status: "ACTIVE",
      },
    });

    const event = {
      id: `evt_test_${Date.now()}`,
      type: "invoice.paid",
      data: {
        object: {
          billing_reason: "subscription_create",
          parent: { subscription_details: { subscription: "sub_test_789" } },
        },
      },
    };
    constructEventMock.mockReturnValue(event);

    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=whatever")
      .send(Buffer.from(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
    expect(await getCreditBalance(user.id)).toBe(0);
  });

  it("grants renewal credits for a subscription_cycle invoice", async () => {
    const plan = await makePlan();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(),
        passwordHash: "not-a-real-hash",
        firstName: "Web",
        lastName: "Hook",
        role: "PARENT",
      },
    });
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        stripeSubscriptionId: "sub_test_renew",
        status: "ACTIVE",
      },
    });

    const event = {
      id: `evt_test_${Date.now()}`,
      type: "invoice.paid",
      data: {
        object: {
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { subscription: "sub_test_renew" } },
        },
      },
    };
    constructEventMock.mockReturnValue(event);
    subscriptionsRetrieveMock.mockResolvedValue(fakeStripeSubscription({ id: "sub_test_renew" }));

    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=whatever")
      .send(Buffer.from(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(await getCreditBalance(user.id)).toBe(plan.monthlyCredits);
  });
});
