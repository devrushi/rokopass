import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { transfersCreateMock } = vi.hoisted(() => ({
  transfersCreateMock: vi.fn(),
}));

vi.mock("../src/lib/stripe", () => ({
  stripe: {
    transfers: { create: transfersCreateMock },
  },
}));

import { createApp } from "../src/app";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@payouts.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let adminToken: string;
let ageGroupId: string;
let originalSettings: Awaited<ReturnType<typeof prisma.platformSettings.findUnique>>;

async function loginAsAdmin(): Promise<string> {
  const email = uniqueEmail("admin");
  const passwordHash = await hashPassword("Password123");
  await prisma.user.create({ data: { email, passwordHash, firstName: "Ad", lastName: "Min", role: "ADMIN" } });
  const res = await request(app).post("/auth/login").send({ email, password: "Password123" });
  return res.body.accessToken as string;
}

async function registerProvider() {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail("provider"),
    password: "Password123",
    firstName: "Prov",
    lastName: "Ider",
    role: "PROVIDER",
  });
  const id = res.body.user.id as string;
  await prisma.user.update({ where: { id }, data: { verificationStatus: "APPROVED" } });
  return { token: res.body.accessToken as string, id };
}

async function registerParent() {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail("parent"),
    password: "Password123",
    firstName: "Par",
    lastName: "Ent",
    role: "PARENT",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function setBusinessProfile(token: string, overrides: Partial<Record<string, unknown>> = {}) {
  return request(app)
    .put("/accounting/business-profile")
    .set("Authorization", `Bearer ${token}`)
    .send({
      legalBusinessName: "Test Provider Ltd",
      addressLine1: "1 Test Street",
      city: "Leicester",
      postcode: "LE1 1AA",
      country: "GB",
      isVatRegistered: false,
      ...overrides,
    });
}

async function makeActivity(providerToken: string) {
  const res = await request(app)
    .post("/activities")
    .set("Authorization", `Bearer ${providerToken}`)
    .send({
      title: "Payout Test Activity",
      description: "d",
      category: "Swimming",
      ageGroupId,
      location: "L",
      capacity: 10,
      creditCost: 3,
    });
  return res.body.activity.id as string;
}

async function makeEarnedBooking(params: {
  activityId: string;
  parentId: string;
  status?: "ATTENDED" | "NO_SHOW" | "CANCELLED";
  startsAt: Date;
  creditsSpent?: number;
}) {
  const session = await prisma.classSession.create({
    data: {
      activityId: params.activityId,
      startsAt: params.startsAt,
      endsAt: new Date(params.startsAt.getTime() + 60 * 60 * 1000),
      capacity: 10,
    },
  });
  const child = await prisma.child.create({
    data: { parentId: params.parentId, firstName: "Kid", lastName: "Tester", dateOfBirth: new Date("2018-01-01") },
  });
  const booking = await prisma.booking.create({
    data: {
      childId: child.id,
      sessionId: session.id,
      parentId: params.parentId,
      status: params.status ?? "ATTENDED",
      creditsSpent: params.creditsSpent ?? 3,
    },
  });
  return booking;
}

async function getSettings(token: string) {
  const res = await request(app).get("/admin/payouts/settings").set("Authorization", `Bearer ${token}`);
  return res.body.settings as {
    creditValueGbp: number;
    commissionRatePercent: number;
    platformVatRegistered: boolean;
    platformVatRatePercent: number;
  };
}

beforeAll(async () => {
  adminToken = await loginAsAdmin();
  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
  originalSettings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  const activities = await prisma.activity.findMany({ where: { providerId: { in: userIds } } });
  const activityIds = activities.map((a) => a.id);
  const sessions = await prisma.classSession.findMany({ where: { activityId: { in: activityIds } } });
  const sessionIds = sessions.map((s) => s.id);
  const bookings = await prisma.booking.findMany({ where: { sessionId: { in: sessionIds } } });
  const bookingIds = bookings.map((b) => b.id);

  await prisma.payoutStatementLine.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.payoutStatement.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.classSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.child.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
  await prisma.providerBusinessProfile.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  if (originalSettings) {
    await prisma.platformSettings.update({ where: { id: "singleton" }, data: originalSettings });
  }
});

describe("POST /admin/payouts/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires ADMIN", async () => {
    const provider = await registerProvider();
    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ providerId: provider.id, periodStart: "2020-01-01", periodEnd: "2020-02-01" });
    expect(res.status).toBe(403);
  });

  it("rejects a provider with no business profile", async () => {
    const provider = await registerProvider();
    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2020-01-01", periodEnd: "2020-02-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/business profile/i);
  });

  it("rejects a period with no eligible bookings", async () => {
    const provider = await registerProvider();
    await setBusinessProfile(provider.token);

    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2020-01-01", periodEnd: "2020-02-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no eligible bookings/i);
  });

  it("generates a statement from ATTENDED and NO_SHOW bookings, correctly priced", async () => {
    const provider = await registerProvider();
    const parent = await registerParent();
    await setBusinessProfile(provider.token, { legalBusinessName: "Correctly Priced Ltd" });
    const activityId = await makeActivity(provider.token);

    const periodStart = new Date("2024-01-01T00:00:00Z");
    const periodEnd = new Date("2024-02-01T00:00:00Z");

    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "ATTENDED",
      startsAt: new Date("2024-01-10T10:00:00Z"),
      creditsSpent: 3,
    });
    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "NO_SHOW",
      startsAt: new Date("2024-01-15T10:00:00Z"),
      creditsSpent: 2,
    });
    // Outside the period — must not be included.
    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "ATTENDED",
      startsAt: new Date("2024-02-05T10:00:00Z"),
      creditsSpent: 5,
    });
    // A held (not yet earned) booking — must not be included.
    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "NO_SHOW",
      startsAt: new Date("2024-01-20T10:00:00Z"),
      creditsSpent: 1,
    });

    const settings = await getSettings(adminToken);

    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });

    expect(res.status).toBe(201);
    const statement = res.body.statement;
    expect(statement.creditsRedeemed).toBe(6); // 3 + 2 + 1
    expect(statement.lines).toHaveLength(3);
    expect(statement.providerLegalName).toBe("Correctly Priced Ltd");
    expect(statement.statementNumber).toMatch(/^STMT-\d{4}-\d{6}$/);

    const expectedGross = 6 * settings.creditValueGbp;
    const expectedCommission = Math.round((expectedGross * settings.commissionRatePercent) / 100);
    const expectedVat = settings.platformVatRegistered
      ? Math.round((expectedCommission * settings.platformVatRatePercent) / 100)
      : 0;
    expect(statement.grossAmountGbp).toBe(expectedGross);
    expect(statement.commissionAmountGbp).toBe(expectedCommission);
    expect(statement.commissionVatGbp).toBe(expectedVat);
    expect(statement.netAmountGbp).toBe(expectedGross - expectedCommission - expectedVat);
  });

  it("pays out a late-cancelled booking whose credits were forfeited, but not a refunded one", async () => {
    const provider = await registerProvider();
    const parent = await registerParent();
    await setBusinessProfile(provider.token);
    const activityId = await makeActivity(provider.token);

    // Forfeited on cancellation (no BOOKING_REFUND transaction) — the provider still held the
    // capacity and the credit was never returned, so this should be paid out just like a NO_SHOW.
    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "CANCELLED",
      startsAt: new Date("2024-06-10T10:00:00Z"),
      creditsSpent: 3,
    });

    // Cancelled well within the free-cancellation window — refunded, so must NOT be paid out.
    const refunded = await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      status: "CANCELLED",
      startsAt: new Date("2024-06-15T10:00:00Z"),
      creditsSpent: 5,
    });
    await prisma.creditTransaction.create({
      data: { userId: parent.id, bookingId: refunded.id, amount: 5, reason: "BOOKING_REFUND" },
    });

    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2024-06-01", periodEnd: "2024-07-01" });

    expect(res.status).toBe(201);
    expect(res.body.statement.creditsRedeemed).toBe(3);
    expect(res.body.statement.lines).toHaveLength(1);
    expect(res.body.statement.lines[0].creditsSpent).toBe(3);
  });

  it("never pays out the same booking twice across two generation runs", async () => {
    const provider = await registerProvider();
    const parent = await registerParent();
    await setBusinessProfile(provider.token);
    const activityId = await makeActivity(provider.token);

    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      startsAt: new Date("2024-03-05T10:00:00Z"),
      creditsSpent: 4,
    });

    const first = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2024-03-01", periodEnd: "2024-04-01" });
    expect(first.status).toBe(201);
    expect(first.body.statement.creditsRedeemed).toBe(4);

    // Same booking, same (or overlapping) period — nothing left to pay out.
    const second = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2024-03-01", periodEnd: "2024-04-01" });
    expect(second.status).toBe(400);
  });
});

describe("POST /admin/payouts/:id/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function generateStatement() {
    const provider = await registerProvider();
    const parent = await registerParent();
    await setBusinessProfile(provider.token);
    const activityId = await makeActivity(provider.token);
    await makeEarnedBooking({
      activityId,
      parentId: parent.id,
      startsAt: new Date("2024-05-05T10:00:00Z"),
      creditsSpent: 2,
    });

    const res = await request(app)
      .post("/admin/payouts/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerId: provider.id, periodStart: "2024-05-01", periodEnd: "2024-06-01" });
    return { provider, statement: res.body.statement };
  }

  it("refuses to execute when the provider hasn't finished Connect onboarding", async () => {
    const { statement } = await generateStatement();
    const res = await request(app)
      .post(`/admin/payouts/${statement.id}/execute`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Stripe Connect/i);
    expect(transfersCreateMock).not.toHaveBeenCalled();
  });

  it("transfers the net amount and marks the statement PAID once Connect is enabled", async () => {
    const { provider, statement } = await generateStatement();
    await prisma.user.update({
      where: { id: provider.id },
      data: { stripeConnectAccountId: "acct_test_123", connectPayoutsEnabled: true },
    });
    transfersCreateMock.mockResolvedValue({ id: "tr_test_123" });

    const res = await request(app)
      .post(`/admin/payouts/${statement.id}/execute`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.statement.status).toBe("PAID");
    expect(res.body.statement.stripeTransferId).toBe("tr_test_123");
    expect(transfersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: statement.netAmountGbp, currency: "gbp", destination: "acct_test_123" }),
    );
  });

  it("marks the statement FAILED (not a 500) when the Stripe transfer errors", async () => {
    const { provider, statement } = await generateStatement();
    await prisma.user.update({
      where: { id: provider.id },
      data: { stripeConnectAccountId: "acct_test_456", connectPayoutsEnabled: true },
    });
    transfersCreateMock.mockRejectedValue(new Error("insufficient available balance"));

    const res = await request(app)
      .post(`/admin/payouts/${statement.id}/execute`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.statement.status).toBe("FAILED");
    expect(res.body.statement.failureReason).toMatch(/insufficient available balance/);
  });

  it("refuses to re-execute a statement that isn't PENDING", async () => {
    const { provider, statement } = await generateStatement();
    await prisma.user.update({
      where: { id: provider.id },
      data: { stripeConnectAccountId: "acct_test_789", connectPayoutsEnabled: true },
    });
    transfersCreateMock.mockResolvedValue({ id: "tr_test_789" });

    const first = await request(app)
      .post(`/admin/payouts/${statement.id}/execute`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(first.body.statement.status).toBe("PAID");

    const second = await request(app)
      .post(`/admin/payouts/${statement.id}/execute`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(second.status).toBe(400);
  });
});

describe("PATCH /admin/payouts/settings", () => {
  it("requires ADMIN", async () => {
    const provider = await registerProvider();
    const res = await request(app)
      .patch("/admin/payouts/settings")
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ commissionRatePercent: 20 });
    expect(res.status).toBe(403);
  });

  it("updates the commission rate and credit value", async () => {
    const res = await request(app)
      .patch("/admin/payouts/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ commissionRatePercent: 12, creditValueGbp: 300 });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ commissionRatePercent: 12, creditValueGbp: 300 });
  });
});
