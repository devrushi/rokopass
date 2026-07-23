import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@leaderboard.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let ageGroupId: string;

async function makeUser(label: string, role: "PARENT" | "PROVIDER") {
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

async function makeAttendedBooking(parentId: string, activityId: string, childId: string) {
  const session = await prisma.classSession.create({
    data: {
      activityId,
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() - 82_800_000),
      capacity: 5,
    },
  });
  await prisma.booking.create({
    data: { childId, sessionId: session.id, parentId, status: "ATTENDED", creditsSpent: 1 },
  });
}

beforeAll(async () => {
  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.booking.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.child.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GET /leaderboard", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/leaderboard");
    expect(res.status).toBe(401);
  });

  it("only shows opted-in children with a pseudonymized display name, ranked by attendance", async () => {
    const { user: provider } = await makeUser("provider", "PROVIDER");
    const activity = await prisma.activity.create({
      data: {
        providerId: provider.id,
        ageGroupId,
        title: "Leaderboard Test Activity",
        description: "d",
        category: "Art",
        location: "L",
        capacity: 10,
        creditCost: 1,
      },
    });

    const { user: parent, token } = await makeUser("parent", "PARENT");

    const optedInMostAttended = await prisma.child.create({
      data: {
        parentId: parent.id,
        firstName: "TopKid",
        lastName: "Winnerson",
        dateOfBirth: new Date("2018-01-01"),
        isOnLeaderboard: true,
      },
    });
    const optedInFewerAttended = await prisma.child.create({
      data: {
        parentId: parent.id,
        firstName: "SecondKid",
        lastName: "Runnerup",
        dateOfBirth: new Date("2018-01-01"),
        isOnLeaderboard: true,
      },
    });
    const optedOut = await prisma.child.create({
      data: {
        parentId: parent.id,
        firstName: "PrivateKid",
        lastName: "Hidden",
        dateOfBirth: new Date("2018-01-01"),
        isOnLeaderboard: false,
      },
    });
    const optedInNoAttendance = await prisma.child.create({
      data: {
        parentId: parent.id,
        firstName: "NewKid",
        lastName: "Zero",
        dateOfBirth: new Date("2018-01-01"),
        isOnLeaderboard: true,
      },
    });

    await makeAttendedBooking(parent.id, activity.id, optedInMostAttended.id);
    await makeAttendedBooking(parent.id, activity.id, optedInMostAttended.id);
    await makeAttendedBooking(parent.id, activity.id, optedInFewerAttended.id);
    await makeAttendedBooking(parent.id, activity.id, optedOut.id);

    const res = await request(app).get("/leaderboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const names = res.body.entries.map((e: { displayName: string }) => e.displayName);
    expect(names).toContain("TopKid W.");
    expect(names).toContain("SecondKid R.");
    expect(names).not.toContain("PrivateKid H.");
    expect(names.some((n: string) => n.startsWith("NewKid"))).toBe(false);
    // No full last names anywhere in the response.
    expect(JSON.stringify(res.body)).not.toContain("Winnerson");
    expect(JSON.stringify(res.body)).not.toContain("Hidden");

    const topEntry = res.body.entries.find((e: { displayName: string }) => e.displayName === "TopKid W.");
    const secondEntry = res.body.entries.find((e: { displayName: string }) => e.displayName === "SecondKid R.");
    expect(topEntry.attendedCount).toBe(2);
    expect(secondEntry.attendedCount).toBe(1);
    expect(res.body.entries.indexOf(topEntry)).toBeLessThan(res.body.entries.indexOf(secondEntry));
  });
});

describe("PATCH /children/:id (leaderboard opt-in)", () => {
  it("lets a parent toggle their own child's leaderboard opt-in", async () => {
    const { user: parent, token } = await makeUser("toggle-parent", "PARENT");
    const child = await prisma.child.create({
      data: { parentId: parent.id, firstName: "Toggle", lastName: "Kid", dateOfBirth: new Date("2019-01-01") },
    });

    const res = await request(app)
      .patch(`/children/${child.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isOnLeaderboard: true });

    expect(res.status).toBe(200);
    expect(res.body.child.isOnLeaderboard).toBe(true);
  });

  it("rejects toggling another parent's child", async () => {
    const { user: owner } = await makeUser("owner", "PARENT");
    const { token: otherToken } = await makeUser("other", "PARENT");
    const child = await prisma.child.create({
      data: { parentId: owner.id, firstName: "Owned", lastName: "Kid", dateOfBirth: new Date("2019-01-01") },
    });

    const res = await request(app)
      .patch(`/children/${child.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ isOnLeaderboard: true });

    expect(res.status).toBe(403);
  });
});
