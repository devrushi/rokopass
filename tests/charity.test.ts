import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@charity.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

async function makeUser(label: string, role: "PARENT" | "ADMIN") {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(label),
      passwordHash: "not-a-real-hash",
      firstName: label,
      lastName: "Test",
      role,
    },
  });
  return { user, token: signAccessToken({ sub: user.id, email: user.email, role }) };
}

async function grantRawCredits(userId: string, amount: number) {
  await prisma.creditTransaction.create({ data: { userId, amount, reason: "ADMIN_ADJUSTMENT" } });
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("POST /billing/charity/donate", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/billing/charity/donate").send({ amount: 1 });
    expect(res.status).toBe(401);
  });

  it("rejects donating more credits than the balance", async () => {
    const { token } = await makeUser("poor-donor", "PARENT");
    const res = await request(app)
      .post("/billing/charity/donate")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 5 });
    expect(res.status).toBe(400);
  });

  it("moves credits from the donor's balance into the pool", async () => {
    const { user, token } = await makeUser("donor", "PARENT");
    await grantRawCredits(user.id, 10);

    const donateRes = await request(app)
      .post("/billing/charity/donate")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 4 });

    expect(donateRes.status).toBe(200);
    expect(donateRes.body.balance).toBe(6);

    const poolRes = await request(app).get("/billing/charity").set("Authorization", `Bearer ${token}`);
    expect(poolRes.status).toBe(200);
    expect(poolRes.body.poolBalance).toBeGreaterThanOrEqual(4);
    expect(poolRes.body.recentDonations.some((d: { amount: number }) => d.amount === 4)).toBe(true);
  });
});

describe("POST /admin/charity/grant", () => {
  it("requires admin", async () => {
    const { token } = await makeUser("not-admin", "PARENT");
    const res = await request(app)
      .post("/admin/charity/grant")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "someone@example.com", amount: 1 });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown recipient email", async () => {
    const { token } = await makeUser("admin", "ADMIN");
    const res = await request(app)
      .post("/admin/charity/grant")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "nobody-here@charity.test.rokidspass.local", amount: 1 });
    expect(res.status).toBe(404);
  });

  it("rejects a grant larger than the available pool", async () => {
    const { token: adminToken } = await makeUser("admin2", "ADMIN");
    const { user: recipient } = await makeUser("recipient-too-much", "PARENT");

    const res = await request(app)
      .post("/admin/charity/grant")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: recipient.email, amount: 1_000_000 });

    expect(res.status).toBe(400);
  });

  it("grants pooled credits to a parent and writes an audit log entry", async () => {
    const { user: donor, token: donorToken } = await makeUser("donor2", "PARENT");
    await grantRawCredits(donor.id, 10);
    await request(app)
      .post("/billing/charity/donate")
      .set("Authorization", `Bearer ${donorToken}`)
      .send({ amount: 5 });

    const { user: admin, token: adminToken } = await makeUser("admin3", "ADMIN");
    const { user: recipient } = await makeUser("recipient", "PARENT");

    const grantRes = await request(app)
      .post("/admin/charity/grant")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: recipient.email, amount: 3 });

    expect(grantRes.status).toBe(200);

    const recipientBalance = await prisma.creditTransaction.aggregate({
      where: { userId: recipient.id },
      _sum: { amount: true },
    });
    expect(recipientBalance._sum.amount).toBe(3);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { adminId: admin.id, action: "CHARITY_GRANT_ISSUED", targetId: recipient.id },
    });
    expect(auditEntry).not.toBeNull();
    expect((auditEntry?.metadata as { amount: number } | null)?.amount).toBe(3);
  });
});
