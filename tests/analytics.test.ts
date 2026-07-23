import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@analytics.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let ageGroupId: string;

async function makeUser(label: string, role: "PARENT" | "PROVIDER" | "ADMIN") {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(label),
      passwordHash: "not-a-real-hash",
      firstName: label,
      lastName: "Test",
      role,
      verificationStatus: role === "PROVIDER" ? "APPROVED" : null,
    },
  });
  return { user, token: signAccessToken({ sub: user.id, email: user.email, role }) };
}

beforeAll(async () => {
  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.booking.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.child.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GET /analytics/parent", () => {
  it("computes balance, spending by category, attendance, and upcoming bookings", async () => {
    const { user: parent, token } = await makeUser("parent", "PARENT");
    const { user: provider } = await makeUser("provider", "PROVIDER");

    const activity = await prisma.activity.create({
      data: {
        providerId: provider.id,
        ageGroupId,
        title: "Swim Class",
        description: "d",
        category: "Swimming",
        location: "L",
        capacity: 10,
        creditCost: 1,
      },
    });
    const child = await prisma.child.create({
      data: { parentId: parent.id, firstName: "Kid", lastName: "One", dateOfBirth: new Date("2019-01-01") },
    });

    const futureSession = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), capacity: 5 },
    });
    const pastSessionAttended = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 82_800_000), capacity: 5 },
    });
    const pastSessionNoShow = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 169_200_000), capacity: 5 },
    });

    await prisma.creditTransaction.create({ data: { userId: parent.id, amount: 10, reason: "ADMIN_ADJUSTMENT" } });

    const bookingConfirmed = await prisma.booking.create({
      data: { childId: child.id, sessionId: futureSession.id, parentId: parent.id, status: "CONFIRMED", creditsSpent: 2 },
    });
    await prisma.creditTransaction.create({
      data: { userId: parent.id, bookingId: bookingConfirmed.id, amount: -2, reason: "BOOKING" },
    });

    const bookingAttended = await prisma.booking.create({
      data: { childId: child.id, sessionId: pastSessionAttended.id, parentId: parent.id, status: "ATTENDED", creditsSpent: 3 },
    });
    await prisma.creditTransaction.create({
      data: { userId: parent.id, bookingId: bookingAttended.id, amount: -3, reason: "BOOKING" },
    });

    const bookingNoShow = await prisma.booking.create({
      data: { childId: child.id, sessionId: pastSessionNoShow.id, parentId: parent.id, status: "NO_SHOW", creditsSpent: 1 },
    });
    await prisma.creditTransaction.create({
      data: { userId: parent.id, bookingId: bookingNoShow.id, amount: -1, reason: "BOOKING" },
    });

    const res = await request(app).get("/analytics/parent").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(4); // 10 - 2 - 3 - 1
    expect(res.body.creditsUsedLast30Days).toBe(6); // 2 + 3 + 1
    expect(res.body.spendingByCategory).toEqual([{ category: "Swimming", creditsSpent: 5 }]); // 2 + 3 (CONFIRMED + ATTENDED only)
    expect(res.body.childrenAttendance).toEqual([
      { childId: child.id, firstName: "Kid", lastName: "One", attended: 1, noShow: 1, upcoming: 1 },
    ]);
    expect(res.body.upcomingBookings).toHaveLength(1);
    expect(res.body.upcomingBookings[0]).toMatchObject({ activityTitle: "Swim Class", childFirstName: "Kid" });
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/analytics/parent");
    expect(res.status).toBe(401);
  });
});

describe("GET /analytics/provider", () => {
  it("computes booking mix, attendance rate, capacity utilization, and repeat rate", async () => {
    const { user: provider, token } = await makeUser("provider2", "PROVIDER");
    const { user: parentA } = await makeUser("parentA", "PARENT");
    const { user: parentB } = await makeUser("parentB", "PARENT");
    const { user: parentC } = await makeUser("parentC", "PARENT");

    const activity = await prisma.activity.create({
      data: {
        providerId: provider.id,
        ageGroupId,
        title: "Dance Class",
        description: "d",
        category: "Dance",
        location: "L",
        capacity: 2,
        creditCost: 1,
      },
    });

    const childA1 = await prisma.child.create({
      data: { parentId: parentA.id, firstName: "A1", lastName: "K", dateOfBirth: new Date("2019-01-01") },
    });
    const childA2 = await prisma.child.create({
      data: { parentId: parentA.id, firstName: "A2", lastName: "K", dateOfBirth: new Date("2019-01-01") },
    });
    const childB = await prisma.child.create({
      data: { parentId: parentB.id, firstName: "B", lastName: "K", dateOfBirth: new Date("2019-01-01") },
    });
    const childC = await prisma.child.create({
      data: { parentId: parentC.id, firstName: "C", lastName: "K", dateOfBirth: new Date("2019-01-01") },
    });

    const sessionA = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), capacity: 2 },
    });
    const sessionB = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 82_800_000), capacity: 2 },
    });
    const sessionC = await prisma.classSession.create({
      data: { activityId: activity.id, startsAt: new Date(Date.now() + 172_800_000), endsAt: new Date(Date.now() + 176_400_000), capacity: 2 },
    });

    const now = new Date();

    // parentA books twice (repeat parent): sessionA (CONFIRMED, decided in 60 min) and sessionB (ATTENDED)
    await prisma.booking.create({
      data: {
        childId: childA1.id,
        sessionId: sessionA.id,
        parentId: parentA.id,
        status: "CONFIRMED",
        creditsSpent: 1,
        createdAt: new Date(now.getTime() - 60 * 60_000),
        updatedAt: now,
      },
    });
    await prisma.booking.create({
      data: { childId: childA2.id, sessionId: sessionB.id, parentId: parentA.id, status: "ATTENDED", creditsSpent: 1 },
    });

    // parentB: one NO_SHOW on sessionB (fills its capacity to 2/2)
    await prisma.booking.create({
      data: { childId: childB.id, sessionId: sessionB.id, parentId: parentB.id, status: "NO_SHOW", creditsSpent: 1 },
    });

    // parentC: one REJECTED on sessionC, decided in 30 min
    await prisma.booking.create({
      data: {
        childId: childC.id,
        sessionId: sessionC.id,
        parentId: parentC.id,
        status: "REJECTED",
        creditsSpent: 1,
        createdAt: new Date(now.getTime() - 30 * 60_000),
        updatedAt: now,
      },
    });

    const res = await request(app).get("/analytics/provider").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalActivities).toBe(1);
    expect(res.body.bookingsByStatus).toEqual({ CONFIRMED: 1, ATTENDED: 1, NO_SHOW: 1, REJECTED: 1 });
    expect(res.body.attendanceRatePercent).toBeCloseTo(50, 5); // 1 attended / (1 attended + 1 no-show)
    expect(res.body.avgCapacityUtilizationPercent).toBeCloseTo(75, 5); // sessionA 1/2=50%, sessionB 2/2=100% -> avg 75%
    expect(res.body.avgApprovalResponseMinutes).toBeCloseTo(45, 0); // (60 + 30) / 2
    expect(res.body.repeatBookingRatePercent).toBeCloseTo(100 / 3, 1); // 1 repeat / 3 distinct parents
    expect(res.body.topActivities).toEqual([{ activityId: activity.id, title: "Dance Class", bookingsCount: 4 }]);
  });

  it("returns empty-shaped analytics for a provider with no activities", async () => {
    const { token } = await makeUser("provider-empty", "PROVIDER");
    const res = await request(app).get("/analytics/provider").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalActivities: 0,
      attendanceRatePercent: null,
      avgCapacityUtilizationPercent: null,
      avgApprovalResponseMinutes: null,
      repeatBookingRatePercent: null,
      topActivities: [],
    });
  });

  it("forbids a parent from accessing provider analytics", async () => {
    const { token } = await makeUser("parent-forbidden", "PARENT");
    const res = await request(app).get("/analytics/provider").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/analytics", () => {
  it("requires ADMIN", async () => {
    const { token } = await makeUser("not-admin", "PARENT");
    const res = await request(app).get("/admin/analytics").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("reflects new signups, pending providers, and flagged/featured counts as deltas", async () => {
    const { token: adminToken } = await makeUser("admin", "ADMIN");

    const before = await request(app).get("/admin/analytics").set("Authorization", `Bearer ${adminToken}`);
    expect(before.status).toBe(200);

    const { user: newParent } = await makeUser("delta-parent", "PARENT");
    const { user: newProvider } = await makeUser("delta-provider", "PROVIDER");
    await prisma.user.update({ where: { id: newProvider.id }, data: { verificationStatus: "PENDING" } });

    const { user: activityProvider } = await makeUser("delta-activity-provider", "PROVIDER");
    const activity = await prisma.activity.create({
      data: {
        providerId: activityProvider.id,
        ageGroupId,
        title: "Delta Activity",
        description: "d",
        category: "Art",
        location: "L",
        capacity: 5,
        creditCost: 1,
        isFlagged: true,
        isFeatured: true,
      },
    });

    const after = await request(app).get("/admin/analytics").set("Authorization", `Bearer ${adminToken}`);
    expect(after.status).toBe(200);

    // >= rather than === : these are genuinely global, platform-wide counts, and other test
    // files running in parallel (e.g. tests/ai.test.ts creating PROVIDER fixtures) can land
    // inside this before/after window and add to the same counters. Asserting "at least what
    // this test itself contributed" is still a meaningful check without being flaky under
    // concurrency — see AGENTS.md's note on this test's known fragility.
    expect(after.body.users.parents - before.body.users.parents).toBeGreaterThanOrEqual(1);
    expect(after.body.users.providers - before.body.users.providers).toBeGreaterThanOrEqual(2);
    expect(after.body.pendingProvidersCount - before.body.pendingProvidersCount).toBeGreaterThanOrEqual(1);
    expect(after.body.flaggedActivitiesCount - before.body.flaggedActivitiesCount).toBeGreaterThanOrEqual(1);
    expect(after.body.featuredActivitiesCount - before.body.featuredActivitiesCount).toBeGreaterThanOrEqual(1);

    expect(newParent.role).toBe("PARENT");
    expect(activity.isFlagged).toBe(true);
  });

  it("avgProviderApprovalHours reflects the gap between provider signup and approval decision", async () => {
    const { token: adminToken } = await makeUser("admin2", "ADMIN");
    const { user: provider } = await makeUser("approval-timing-provider", "PROVIDER");
    await prisma.user.update({
      where: { id: provider.id },
      data: { verificationStatus: "PENDING", createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });

    const approveRes = await request(app)
      .post(`/admin/providers/${provider.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);

    const res = await request(app).get("/admin/analytics").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.avgProviderApprovalHours).not.toBeNull();
    expect(res.body.avgProviderApprovalHours).toBeGreaterThan(0);
  });
});
