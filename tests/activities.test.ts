import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

// Scoped to this file — see the comment in auth.register.test.ts on why test files must not
// share an email suffix once rows have foreign keys between them.
const EMAIL_SUFFIX = "@activities.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let providerToken: string;
let providerId: string;
let otherProviderToken: string;
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

beforeAll(async () => {
  const provider = await registerUser("provider", "PROVIDER");
  providerToken = provider.token;
  providerId = provider.id;

  const otherProvider = await registerUser("other-provider", "PROVIDER");
  otherProviderToken = otherProvider.token;

  const parent = await registerUser("parent", "PARENT");
  parentToken = parent.token;

  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;

  // The public listing (GET /activities) only shows activities from APPROVED providers as of
  // the Final Step's moderation gating — approve both test providers so the pre-existing tests
  // in this file keep testing what they intended. See admin.test.ts for coverage of the
  // PENDING-provider-hidden behavior itself.
  await prisma.user.updateMany({
    where: { id: { in: [provider.id, otherProvider.id] } },
    data: { verificationStatus: "APPROVED" },
  });
});

afterAll(async () => {
  await prisma.activity.deleteMany({ where: { provider: { email: { endsWith: EMAIL_SUFFIX } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
});

const validActivity = () => ({
  title: "Saturday Swimming",
  description: "Beginner swim lessons",
  category: "Swimming",
  ageGroupId,
  location: "Leicester Leisure Centre",
  capacity: 12,
  creditCost: 4,
});

describe("POST /activities", () => {
  it("rejects a PARENT trying to create an activity", async () => {
    const res = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${parentToken}`)
      .send(validActivity());
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/activities").send(validActivity());
    expect(res.status).toBe(401);
  });

  it("creates an activity for a PROVIDER", async () => {
    const res = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send(validActivity());

    expect(res.status).toBe(201);
    expect(res.body.activity).toMatchObject({
      title: "Saturday Swimming",
      providerId,
    });
    expect(res.body.activity.ageGroup.id).toBe(ageGroupId);
  });

  it("rejects an unknown ageGroupId", async () => {
    const res = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ ...validActivity(), ageGroupId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing title", async () => {
    const { title: _omit, ...rest } = validActivity();
    const res = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send(rest);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /activities/:id", () => {
  it("lets the owning provider update their activity", async () => {
    const createRes = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send(validActivity());
    const activityId = createRes.body.activity.id;

    const res = await request(app)
      .patch(`/activities/${activityId}`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ capacity: 20 });

    expect(res.status).toBe(200);
    expect(res.body.activity.capacity).toBe(20);
  });

  it("forbids a different provider from updating the activity", async () => {
    const createRes = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send(validActivity());
    const activityId = createRes.body.activity.id;

    const res = await request(app)
      .patch(`/activities/${activityId}`)
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .send({ capacity: 99 });

    expect(res.status).toBe(403);
  });
});

describe("GET /activities", () => {
  it("lists activities without authentication", async () => {
    await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send(validActivity());

    const res = await request(app).get("/activities");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.activities.length).toBeGreaterThan(0);
  });

  it("GET /activities/mine only returns the requesting provider's activities", async () => {
    await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .send(validActivity());

    const res = await request(app).get("/activities/mine").set("Authorization", `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
    for (const activity of res.body.activities) {
      expect(activity.providerId).toBe(providerId);
    }
  });

  it("filters by category", async () => {
    const createRes = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ ...validActivity(), title: "Category Filter Football Test", category: "Football" });
    const footballId = createRes.body.activity.id as string;

    const res = await request(app).get("/activities?category=Football");
    expect(res.status).toBe(200);
    expect(res.body.activities.some((a: { id: string }) => a.id === footballId)).toBe(true);
    for (const activity of res.body.activities) {
      expect(activity.category).toBe("Football");
    }
  });
});

describe("recurring schedules and sessions", () => {
  async function createActivity(token: string) {
    const res = await request(app)
      .post("/activities")
      .set("Authorization", `Bearer ${token}`)
      .send(validActivity());
    return res.body.activity.id as string;
  }

  it("creates a recurring schedule and materializes sessions", async () => {
    const activityId = await createActivity(providerToken);

    const scheduleRes = await request(app)
      .post(`/activities/${activityId}/schedules`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        dayOfWeek: 6,
        startTime: "10:00",
        durationMinutes: 60,
        frequency: "WEEKLY",
        startDate: new Date().toISOString(),
      });

    expect(scheduleRes.status).toBe(201);

    const sessionsRes = await request(app).get(`/activities/${activityId}/sessions`);
    expect(sessionsRes.status).toBe(200);
    expect(sessionsRes.body.sessions.length).toBeGreaterThan(0);
    for (const session of sessionsRes.body.sessions) {
      expect(new Date(session.startsAt).getDay()).toBe(6);
    }
  });

  it("forbids a non-owning provider from adding a schedule", async () => {
    const activityId = await createActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/schedules`)
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .send({
        dayOfWeek: 1,
        startTime: "09:00",
        durationMinutes: 30,
        startDate: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
  });

  it("lets the owning provider cancel a single session", async () => {
    const activityId = await createActivity(providerToken);
    await request(app)
      .post(`/activities/${activityId}/schedules`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        dayOfWeek: 6,
        startTime: "11:00",
        durationMinutes: 45,
        startDate: new Date().toISOString(),
      });

    const sessionsRes = await request(app).get(`/activities/${activityId}/sessions`);
    const sessionId = sessionsRes.body.sessions[0].id;

    const cancelRes = await request(app)
      .patch(`/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ isCancelled: true });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.session.isCancelled).toBe(true);
  });

  it("forbids a non-owning provider from editing a session", async () => {
    const activityId = await createActivity(providerToken);
    await request(app)
      .post(`/activities/${activityId}/schedules`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        dayOfWeek: 6,
        startTime: "12:00",
        durationMinutes: 45,
        startDate: new Date().toISOString(),
      });

    const sessionsRes = await request(app).get(`/activities/${activityId}/sessions`);
    const sessionId = sessionsRes.body.sessions[0].id;

    const res = await request(app)
      .patch(`/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .send({ isCancelled: true });

    expect(res.status).toBe(403);
  });
});
