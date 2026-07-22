import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

const app = createApp();

const EMAIL_SUFFIX = "@admin.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let adminToken: string;
let parentToken: string;
let ageGroupId: string;

async function registerUser(label: string, role: "PARENT" | "PROVIDER") {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(label),
    password: "Password123",
    firstName: "Test",
    lastName: label,
    role,
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function loginAsAdmin(): Promise<string> {
  // No public way to create an ADMIN account (by design) — create one directly for the test,
  // same as prisma/seed.ts's dev bootstrap admin.
  const email = uniqueEmail("admin");
  const passwordHash = await hashPassword("Password123");
  await prisma.user.create({
    data: { email, passwordHash, firstName: "Ad", lastName: "Min", role: "ADMIN" },
  });
  const res = await request(app).post("/auth/login").send({ email, password: "Password123" });
  return res.body.accessToken as string;
}

async function makeActivity(token: string, overrides: Partial<Record<string, unknown>> = {}) {
  const res = await request(app)
    .post("/activities")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Admin Test Activity",
      description: "d",
      category: "Swimming",
      ageGroupId,
      location: "L",
      capacity: 10,
      creditCost: 2,
      ...overrides,
    });
  return res.body.activity;
}

beforeAll(async () => {
  adminToken = await loginAsAdmin();

  const parent = await registerUser("parent", "PARENT");
  parentToken = parent.token;

  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("admin authorization", () => {
  it("rejects a non-admin from any /admin route", async () => {
    const res = await request(app).get("/admin/providers").set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/admin/providers");
    expect(res.status).toBe(401);
  });
});

describe("provider verification workflow", () => {
  it("lists PENDING providers by default and hides their activities from the public listing", async () => {
    const provider = await registerUser("pending-provider", "PROVIDER");
    const activity = await makeActivity(provider.token);

    const pendingRes = await request(app)
      .get("/admin/providers")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.providers.some((p: { id: string }) => p.id === provider.id)).toBe(true);

    const publicRes = await request(app).get("/activities");
    expect(publicRes.body.activities.some((a: { id: string }) => a.id === activity.id)).toBe(false);
  });

  it("approving a provider makes their activities publicly visible and writes an audit log", async () => {
    const provider = await registerUser("to-approve", "PROVIDER");
    const activity = await makeActivity(provider.token);

    const approveRes = await request(app)
      .post(`/admin/providers/${provider.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.provider.verificationStatus).toBe("APPROVED");

    const publicRes = await request(app).get("/activities");
    expect(publicRes.body.activities.some((a: { id: string }) => a.id === activity.id)).toBe(true);

    const auditRes = await request(app)
      .get(`/admin/audit-log?targetType=User&targetId=${provider.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(auditRes.body.entries).toHaveLength(1);
    expect(auditRes.body.entries[0].action).toBe("PROVIDER_APPROVED");
  });

  it("rejecting a provider records a reason in the audit log", async () => {
    const provider = await registerUser("to-reject", "PROVIDER");

    const rejectRes = await request(app)
      .post(`/admin/providers/${provider.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Incomplete safeguarding info" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.provider.verificationStatus).toBe("REJECTED");

    const auditRes = await request(app)
      .get(`/admin/audit-log?targetType=User&targetId=${provider.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(auditRes.body.entries[0]).toMatchObject({
      action: "PROVIDER_REJECTED",
      metadata: { reason: "Incomplete safeguarding info" },
    });
  });
});

describe("activity moderation", () => {
  it("flags an activity, hiding it from the public listing", async () => {
    const provider = await registerUser("flag-provider", "PROVIDER");
    await request(app)
      .post(`/admin/providers/${provider.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    const activity = await makeActivity(provider.token);

    const flagRes = await request(app)
      .patch(`/admin/activities/${activity.id}/moderation`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isFlagged: true });
    expect(flagRes.status).toBe(200);
    expect(flagRes.body.activity.isFlagged).toBe(true);

    const publicRes = await request(app).get("/activities");
    expect(publicRes.body.activities.some((a: { id: string }) => a.id === activity.id)).toBe(false);

    const auditRes = await request(app)
      .get(`/admin/audit-log?targetType=Activity&targetId=${activity.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(auditRes.body.entries[0].action).toBe("ACTIVITY_FLAGGED");
  });

  it("features an activity so it sorts first in the public listing", async () => {
    const provider = await registerUser("feature-provider", "PROVIDER");
    await request(app)
      .post(`/admin/providers/${provider.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    await makeActivity(provider.token, { title: "Ordinary Activity" });
    const featured = await makeActivity(provider.token, { title: "Special Activity" });

    await request(app)
      .patch(`/admin/activities/${featured.id}/moderation`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isFeatured: true });

    const publicRes = await request(app).get("/activities");
    expect(publicRes.body.activities[0].id).toBe(featured.id);
  });

  it("searches and filters activities for moderation", async () => {
    const provider = await registerUser("search-provider", "PROVIDER");
    await makeActivity(provider.token, { title: "Unique Ballet Class", category: "Dance" });

    const res = await request(app)
      .get("/admin/activities?search=Unique Ballet&category=Dance")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
    for (const activity of res.body.activities) {
      expect(activity.title).toContain("Unique Ballet");
      expect(activity.category).toBe("Dance");
    }
  });

  it("admin activity search includes activities from PENDING providers (unlike the public listing)", async () => {
    const provider = await registerUser("pending-search-provider", "PROVIDER");
    const activity = await makeActivity(provider.token, { title: "Hidden From Public Search" });

    const res = await request(app)
      .get("/admin/activities?search=Hidden From Public")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.activities.some((a: { id: string }) => a.id === activity.id)).toBe(true);
  });
});
