import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/email", () => ({ sendEmail: sendEmailMock }));

import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { getCreditBalance } from "../src/services/creditBalance";

const app = createApp();

const EMAIL_SUFFIX = "@bookings.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let providerToken: string;
let otherProviderToken: string;
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

async function makeParentWithCredits(amount: number) {
  const { token, id } = await registerUser("parent", "PARENT");
  if (amount > 0) {
    await prisma.creditTransaction.create({
      data: { userId: id, amount, reason: "ADMIN_ADJUSTMENT" },
    });
  }
  const childRes = await request(app)
    .post("/children")
    .set("Authorization", `Bearer ${token}`)
    .send({ firstName: "Kid", lastName: "One", dateOfBirth: "2020-01-01" });
  return { token, id, childId: childRes.body.child.id as string };
}

async function makeActivityWithSession(opts: { capacity: number; creditCost: number; dayOffset?: number }) {
  const activityRes = await request(app)
    .post("/activities")
    .set("Authorization", `Bearer ${providerToken}`)
    .send({
      title: "Booking Test Activity",
      description: "d",
      category: "Swimming",
      ageGroupId,
      location: "L",
      capacity: opts.capacity,
      creditCost: opts.creditCost,
    });
  if (activityRes.status !== 201) {
    throw new Error(`Failed to create test activity: ${activityRes.status} ${JSON.stringify(activityRes.body)}`);
  }
  const activityId = activityRes.body.activity.id as string;

  const startDate = new Date(Date.now() + (opts.dayOffset ?? 1) * 24 * 60 * 60_000);
  const scheduleRes = await request(app)
    .post(`/activities/${activityId}/schedules`)
    .set("Authorization", `Bearer ${providerToken}`)
    .send({
      dayOfWeek: startDate.getDay(),
      startTime: "10:00",
      durationMinutes: 60,
      frequency: "WEEKLY",
      startDate: startDate.toISOString(),
    });
  if (scheduleRes.status !== 201) {
    throw new Error(`Failed to create test schedule: ${scheduleRes.status} ${JSON.stringify(scheduleRes.body)}`);
  }

  const sessionsRes = await request(app).get(`/activities/${activityId}/sessions`);
  if (sessionsRes.status !== 200 || !sessionsRes.body.sessions?.length) {
    throw new Error(
      `Expected at least one generated session: ${sessionsRes.status} ${JSON.stringify(sessionsRes.body)}`,
    );
  }
  const sessionId = sessionsRes.body.sessions[0].id as string;
  return { activityId, sessionId };
}

beforeAll(async () => {
  const provider = await registerUser("provider", "PROVIDER");
  providerToken = provider.token;

  const otherProvider = await registerUser("other-provider", "PROVIDER");
  otherProviderToken = otherProvider.token;

  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.booking.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.child.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("POST /bookings", () => {
  it("books a child, deducts credits, and sends a confirmation email", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 3 });

    sendEmailMock.mockClear();
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({ status: "PENDING_APPROVAL", creditsSpent: 3 });
    expect(res.body.balance).toBe(2);

    // Confirmation email is sent after the transaction commits, not inside it — wait briefly.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].subject).toContain("Booking Test Activity");
  });

  it("rejects when the parent has insufficient credits", async () => {
    const { token, childId } = await makeParentWithCredits(1);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 3 });

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(res.status).toBe(402);
    expect(await getCreditBalance((await prisma.child.findUniqueOrThrow({ where: { id: childId } })).parentId)).toBe(
      1,
    );
  });

  it("rejects double-booking the same child into the same session", async () => {
    const { token, childId } = await makeParentWithCredits(10);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 2 });

    await request(app).post("/bookings").set("Authorization", `Bearer ${token}`).send({ childId, sessionId });
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(res.status).toBe(409);
  });

  it("rejects booking a child that isn't the requester's own", async () => {
    const { token: parentAToken } = await makeParentWithCredits(10);
    const { childId: childBId } = await makeParentWithCredits(10);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({ childId: childBId, sessionId });

    expect(res.status).toBe(404);
  });

  it("rejects booking a full class", async () => {
    const { sessionId } = await makeActivityWithSession({ capacity: 1, creditCost: 1 });
    const parentA = await makeParentWithCredits(5);
    const parentB = await makeParentWithCredits(5);

    const first = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${parentA.token}`)
      .send({ childId: parentA.childId, sessionId });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${parentB.token}`)
      .send({ childId: parentB.childId, sessionId });
    expect(second.status).toBe(409);
  });

  it("under concurrent requests for the last spot, exactly one booking succeeds", async () => {
    const { sessionId } = await makeActivityWithSession({ capacity: 1, creditCost: 1 });
    const parentA = await makeParentWithCredits(5);
    const parentB = await makeParentWithCredits(5);

    const [resA, resB] = await Promise.all([
      request(app)
        .post("/bookings")
        .set("Authorization", `Bearer ${parentA.token}`)
        .send({ childId: parentA.childId, sessionId }),
      request(app)
        .post("/bookings")
        .set("Authorization", `Bearer ${parentB.token}`)
        .send({ childId: parentB.childId, sessionId }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const holdingCount = await prisma.booking.count({
      where: { sessionId, status: { in: ["PENDING_APPROVAL", "CONFIRMED"] } },
    });
    expect(holdingCount).toBe(1);
  });

  it("rejects booking a cancelled session", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });
    await prisma.classSession.update({ where: { id: sessionId }, data: { isCancelled: true } });

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(res.status).toBe(400);
  });

  it("rejects booking a session that has already started", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });
    await prisma.classSession.update({
      where: { id: sessionId },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /bookings/:id (cancel)", () => {
  it("refunds credits on cancellation of a still-pending request", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 3 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    expect(bookRes.body.balance).toBe(2);

    const cancelRes = await request(app)
      .delete(`/bookings/${bookRes.body.booking.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.booking.status).toBe("CANCELLED");
    expect(cancelRes.body.booking.refunded).toBe(true);
    expect(cancelRes.body.balance).toBe(5);
  });

  it("refunds a confirmed booking cancelled well outside the free-cancellation window", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    // dayOffset defaults to 1 (~24h out) — comfortably outside the 4-hour cutoff.
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 3 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);

    const cancelRes = await request(app)
      .delete(`/bookings/${bookRes.body.booking.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.booking.refunded).toBe(true);
    expect(cancelRes.body.balance).toBe(5);
  });

  it("forfeits credits when a confirmed booking is cancelled inside the free-cancellation window", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 3 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);

    // Pull the session in to 2 hours from now — inside the 4-hour cutoff — without needing to
    // fight the recurring-schedule generator for a precisely-timed session.
    await prisma.classSession.update({
      where: { id: sessionId },
      data: { startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
    });

    const cancelRes = await request(app)
      .delete(`/bookings/${bookRes.body.booking.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.booking.status).toBe("CANCELLED");
    expect(cancelRes.body.booking.refunded).toBe(false);
    expect(cancelRes.body.booking.creditsForfeited).toBe(3);
    expect(cancelRes.body.balance).toBe(2); // unchanged — no refund credited
  });

  it("allows re-booking the same child into the same session after cancelling", async () => {
    const { token, childId } = await makeParentWithCredits(10);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 2 });

    const first = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    await request(app).delete(`/bookings/${first.body.booking.id}`).set("Authorization", `Bearer ${token}`);

    const second = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    expect(second.status).toBe(201);
  });
});

describe("booking approval workflow", () => {
  it("lists a provider's pending bookings, scoped to their own activities", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    const ownRes = await request(app)
      .get("/bookings/pending-approval")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.bookings.some((b: { id: string }) => b.id === bookRes.body.booking.id)).toBe(true);

    const otherRes = await request(app)
      .get("/bookings/pending-approval")
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(otherRes.body.bookings.some((b: { id: string }) => b.id === bookRes.body.booking.id)).toBe(false);
  });

  it("approving a booking confirms it without touching credits", async () => {
    const { token, childId, id: parentId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 2 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    expect(await getCreditBalance(parentId)).toBe(3);

    const approveRes = await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.booking.status).toBe("CONFIRMED");
    expect(await getCreditBalance(parentId)).toBe(3);
  });

  it("rejecting a booking refunds the credits", async () => {
    const { token, childId, id: parentId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 2 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    expect(await getCreditBalance(parentId)).toBe(3);

    const rejectRes = await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/reject`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.booking.status).toBe("REJECTED");
    expect(await getCreditBalance(parentId)).toBe(5);
  });

  it("forbids a non-owning provider from approving or rejecting", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });
    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    const approveRes = await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(approveRes.status).toBe(403);

    const rejectRes = await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/reject`)
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(rejectRes.status).toBe(403);
  });

  it("cannot approve or reject a booking that isn't pending", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });
    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });
    await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);

    const res = await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /sessions/:id/attendees and attendance status", () => {
  it("shows pending and confirmed bookings on the roster, and only lets attendance be marked once approved", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });

    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    const rosterRes = await request(app)
      .get(`/sessions/${sessionId}/attendees`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(rosterRes.status).toBe(200);
    expect(rosterRes.body.bookings).toHaveLength(1);
    expect(rosterRes.body.bookings[0]).toMatchObject({ status: "PENDING_APPROVAL" });

    const attendedTooEarlyRes = await request(app)
      .patch(`/bookings/${bookRes.body.booking.id}/status`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ status: "ATTENDED" });
    expect(attendedTooEarlyRes.status).toBe(400);

    await request(app)
      .post(`/bookings/${bookRes.body.booking.id}/approve`)
      .set("Authorization", `Bearer ${providerToken}`);

    const statusRes = await request(app)
      .patch(`/bookings/${bookRes.body.booking.id}/status`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ status: "ATTENDED" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.booking.status).toBe("ATTENDED");
  });

  it("forbids a non-owning provider from viewing the roster or marking attendance", async () => {
    const { token, childId } = await makeParentWithCredits(5);
    const { sessionId } = await makeActivityWithSession({ capacity: 5, creditCost: 1 });
    const bookRes = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, sessionId });

    const rosterRes = await request(app)
      .get(`/sessions/${sessionId}/attendees`)
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(rosterRes.status).toBe(403);

    const statusRes = await request(app)
      .patch(`/bookings/${bookRes.body.booking.id}/status`)
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .send({ status: "ATTENDED" });
    expect(statusRes.status).toBe(403);
  });
});
