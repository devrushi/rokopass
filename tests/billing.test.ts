import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { customersCreateMock, checkoutSessionsCreateMock, invoicesListMock } = vi.hoisted(() => ({
  customersCreateMock: vi.fn(),
  checkoutSessionsCreateMock: vi.fn(),
  invoicesListMock: vi.fn(),
}));

vi.mock("../src/lib/stripe", () => ({
  stripe: {
    customers: { create: customersCreateMock },
    checkout: { sessions: { create: checkoutSessionsCreateMock } },
    invoices: { list: invoicesListMock },
  },
}));

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@billing.test.rokidspass.local";
const uniqueEmail = () => `billing-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  await prisma.plan.deleteMany({ where: { name: { startsWith: "__billing_test_" } } });
});

async function registerParent() {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(),
    password: "Password123",
    firstName: "Billing",
    lastName: "Tester",
    role: "PARENT",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function makePlan() {
  return prisma.plan.create({
    data: {
      name: `__billing_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      description: "test",
      monthlyCredits: 6,
      priceGbp: 1500,
      stripePriceId: `price_test_${Date.now()}`,
    },
  });
}

describe("GET /billing/plans", () => {
  it("lists active plans without authentication", async () => {
    const plan = await makePlan();
    const res = await request(app).get("/billing/plans");
    expect(res.status).toBe(200);
    expect(res.body.plans.some((p: { id: string }) => p.id === plan.id)).toBe(true);
  });
});

describe("GET /billing/credits", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/billing/credits");
    expect(res.status).toBe(401);
  });

  it("returns a zero balance and no plan for a fresh user", async () => {
    const { token } = await registerParent();
    const res = await request(app).get("/billing/credits").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance: 0, plan: null, subscriptionStatus: null });
  });
});

describe("POST /billing/checkout-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/billing/checkout-session").send({ planId: "not-a-uuid" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown plan", async () => {
    const { token } = await registerParent();
    const res = await request(app)
      .post("/billing/checkout-session")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  it("creates a Stripe customer once and reuses it on subsequent checkouts", async () => {
    const { token, id: userId } = await registerParent();
    const plan = await makePlan();

    customersCreateMock.mockResolvedValue({ id: "cus_test_123" });
    checkoutSessionsCreateMock.mockResolvedValue({ client_secret: "cs_secret_1" });

    const first = await request(app)
      .post("/billing/checkout-session")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: plan.id });

    expect(first.status).toBe(201);
    expect(first.body.clientSecret).toBe("cs_secret_1");
    expect(customersCreateMock).toHaveBeenCalledTimes(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.stripeCustomerId).toBe("cus_test_123");

    checkoutSessionsCreateMock.mockResolvedValue({ client_secret: "cs_secret_2" });
    const second = await request(app)
      .post("/billing/checkout-session")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: plan.id });

    expect(second.status).toBe(201);
    // Customer should not be created again — the existing stripeCustomerId is reused.
    expect(customersCreateMock).toHaveBeenCalledTimes(1);
    expect(checkoutSessionsCreateMock).toHaveBeenCalledTimes(2);
  });
});

describe("GET /billing/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/billing/invoices");
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a user with no Stripe customer yet", async () => {
    const { token } = await registerParent();
    const res = await request(app).get("/billing/invoices").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invoices).toEqual([]);
    expect(invoicesListMock).not.toHaveBeenCalled();
  });

  it("lists Stripe invoices for a user with a customer ID", async () => {
    const { token, id: userId } = await registerParent();
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: "cus_test_invoices" } });

    invoicesListMock.mockResolvedValue({
      data: [
        {
          id: "in_123",
          number: "INV-001",
          status: "paid",
          amount_paid: 1999,
          currency: "gbp",
          created: 1700000000,
          hosted_invoice_url: "https://stripe.example/invoice/123",
          invoice_pdf: "https://stripe.example/invoice/123.pdf",
        },
      ],
    });

    const res = await request(app).get("/billing/invoices").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]).toMatchObject({
      id: "in_123",
      number: "INV-001",
      amountPaid: 1999,
      hostedInvoiceUrl: "https://stripe.example/invoice/123",
    });
    expect(invoicesListMock).toHaveBeenCalledWith({ customer: "cus_test_invoices", limit: 24 });
  });
});
