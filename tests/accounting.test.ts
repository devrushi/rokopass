import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { accountsCreateMock, accountLinksCreateMock, accountsRetrieveMock } = vi.hoisted(() => ({
  accountsCreateMock: vi.fn(),
  accountLinksCreateMock: vi.fn(),
  accountsRetrieveMock: vi.fn(),
}));

vi.mock("../src/lib/stripe", () => ({
  stripe: {
    accounts: { create: accountsCreateMock, retrieve: accountsRetrieveMock },
    accountLinks: { create: accountLinksCreateMock },
  },
}));

import { createApp } from "../src/app";
import { syncConnectAccountFromWebhook } from "../src/lib/stripeConnect";
import { UPLOAD_ROOT } from "../src/lib/upload";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@accounting.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function registerProvider(label: string) {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(label),
    password: "Password123",
    firstName: "Test",
    lastName: label,
    role: "PROVIDER",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.providerExpense.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.providerBusinessProfile.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GET/PUT /accounting/business-profile", () => {
  it("returns null before a profile has been created", async () => {
    const { token } = await registerProvider("blank");
    const res = await request(app).get("/accounting/business-profile").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  it("rejects a VAT-registered profile with no VAT number", async () => {
    const { token } = await registerProvider("novat");
    const res = await request(app)
      .put("/accounting/business-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        legalBusinessName: "No Vat Ltd",
        addressLine1: "1 Street",
        city: "Leicester",
        postcode: "LE1 1AA",
        country: "GB",
        isVatRegistered: true,
      });
    expect(res.status).toBe(400);
  });

  it("creates then updates a business profile", async () => {
    const { token } = await registerProvider("owner");
    const create = await request(app)
      .put("/accounting/business-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        legalBusinessName: "First Name Ltd",
        addressLine1: "1 Street",
        city: "Leicester",
        postcode: "LE1 1AA",
        country: "GB",
        isVatRegistered: false,
      });
    expect(create.status).toBe(200);
    expect(create.body.profile.legalBusinessName).toBe("First Name Ltd");

    const update = await request(app)
      .put("/accounting/business-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        legalBusinessName: "Renamed Ltd",
        addressLine1: "1 Street",
        city: "Leicester",
        postcode: "LE1 1AA",
        country: "GB",
        isVatRegistered: true,
        vatNumber: "GB123456789",
      });
    expect(update.status).toBe(200);
    expect(update.body.profile.legalBusinessName).toBe("Renamed Ltd");
    expect(update.body.profile.vatNumber).toBe("GB123456789");

    const get = await request(app).get("/accounting/business-profile").set("Authorization", `Bearer ${token}`);
    expect(get.body.profile.legalBusinessName).toBe("Renamed Ltd");
  });
});

describe("Stripe Connect onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Connect account once and reuses it on a second onboarding link request", async () => {
    const { token, id: providerId } = await registerProvider("connect");
    accountsCreateMock.mockResolvedValue({ id: "acct_test_new" });
    accountLinksCreateMock.mockResolvedValue({ url: "https://connect.stripe.com/setup/1" });

    const first = await request(app)
      .post("/accounting/connect/onboarding-link")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.url).toBe("https://connect.stripe.com/setup/1");
    expect(accountsCreateMock).toHaveBeenCalledTimes(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: providerId } });
    expect(user.stripeConnectAccountId).toBe("acct_test_new");

    accountLinksCreateMock.mockResolvedValue({ url: "https://connect.stripe.com/setup/2" });
    const second = await request(app)
      .post("/accounting/connect/onboarding-link")
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    // Account should not be created twice — the existing one is reused.
    expect(accountsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("reports not connected before any onboarding link has been requested", async () => {
    const { token } = await registerProvider("notconnected");
    const res = await request(app).get("/accounting/connect/status").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: false, payoutsEnabled: false });
  });

  it("reads live status from Stripe and syncs it locally", async () => {
    const { token, id: providerId } = await registerProvider("livestatus");
    await prisma.user.update({ where: { id: providerId }, data: { stripeConnectAccountId: "acct_test_live" } });
    accountsRetrieveMock.mockResolvedValue({ details_submitted: true, payouts_enabled: true });

    const res = await request(app).get("/accounting/connect/status").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: true, detailsSubmitted: true, payoutsEnabled: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: providerId } });
    expect(user.connectPayoutsEnabled).toBe(true);
  });

  it("syncs payoutsEnabled/detailsSubmitted from an account.updated webhook payload", async () => {
    const { id: providerId } = await registerProvider("webhooksync");
    await prisma.user.update({ where: { id: providerId }, data: { stripeConnectAccountId: "acct_test_webhook" } });

    await syncConnectAccountFromWebhook({
      id: "acct_test_webhook",
      details_submitted: true,
      payouts_enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: providerId } });
    expect(user.connectDetailsSubmitted).toBe(true);
    expect(user.connectPayoutsEnabled).toBe(true);
  });
});

describe("Provider expenses", () => {
  it("creates, lists, updates, and deletes an expense", async () => {
    const { token } = await registerProvider("expenses");

    const create = await request(app)
      .post("/accounting/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "CAR_VAN_TRAVEL", description: "Fuel", amountGbp: 2500, incurredOn: "2024-06-01" });
    expect(create.status).toBe(201);
    const expenseId = create.body.expense.id as string;

    const list = await request(app).get("/accounting/expenses").set("Authorization", `Bearer ${token}`);
    expect(list.body.expenses.some((e: { id: string }) => e.id === expenseId)).toBe(true);

    const update = await request(app)
      .patch(`/accounting/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amountGbp: 3000 });
    expect(update.status).toBe(200);
    expect(update.body.expense.amountGbp).toBe(3000);

    const del = await request(app).delete(`/accounting/expenses/${expenseId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/accounting/expenses").set("Authorization", `Bearer ${token}`);
    expect(listAfter.body.expenses.some((e: { id: string }) => e.id === expenseId)).toBe(false);
  });

  it("refuses to let one provider modify another provider's expense", async () => {
    const owner = await registerProvider("expowner");
    const intruder = await registerProvider("expintruder");

    const create = await request(app)
      .post("/accounting/expenses")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ category: "OTHER", description: "Widget", amountGbp: 500, incurredOn: "2024-06-01" });
    const expenseId = create.body.expense.id as string;

    const patch = await request(app)
      .patch(`/accounting/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${intruder.token}`)
      .send({ amountGbp: 999 });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/accounting/expenses/${expenseId}`)
      .set("Authorization", `Bearer ${intruder.token}`);
    expect(del.status).toBe(403);
  });

  it("uploads and deletes a receipt image", async () => {
    const { token } = await registerProvider("receipt");
    const create = await request(app)
      .post("/accounting/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "OFFICE_ADMIN", description: "Stationery", amountGbp: 1200, incurredOn: "2024-06-01" });
    const expenseId = create.body.expense.id as string;

    const upload = await request(app)
      .post(`/accounting/expenses/${expenseId}/receipt`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "receipt.png", contentType: "image/png" });
    expect(upload.status).toBe(200);
    expect(upload.body.expense.receiptUrl).toMatch(/^\/uploads\/receipts\/.+\.png$/);

    const filePath = path.join(UPLOAD_ROOT, upload.body.expense.receiptUrl.replace(/^\/uploads\//, ""));
    expect(fs.existsSync(filePath)).toBe(true);

    await request(app).delete(`/accounting/expenses/${expenseId}`).set("Authorization", `Bearer ${token}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
