import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@media.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

// A valid, minimal 1x1 pixel PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

async function makeActivity(token: string) {
  const res = await request(app)
    .post("/activities")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Media Test Activity",
      description: "d",
      category: "Art",
      ageGroupId,
      location: "L",
      capacity: 5,
      creditCost: 1,
    });
  return res.body.activity.id as string;
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
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("POST /activities/:id/media", () => {
  it("uploads an activity photo for the owning provider", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "ACTIVITY_PHOTO")
      .field("caption", "Kids at play")
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.media).toMatchObject({ type: "ACTIVITY_PHOTO", caption: "Kids at play" });
    expect(res.body.media.url).toMatch(/^\/uploads\/activities\/.+\.png$/);

    const activityRes = await request(app).get(`/activities/${activityId}`);
    expect(activityRes.body.activity.media).toHaveLength(1);
  });

  it("uploads a staff photo without a caption", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "STAFF_PHOTO")
      .attach("file", TINY_PNG, { filename: "staff.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.media.type).toBe("STAFF_PHOTO");
    expect(res.body.media.caption).toBeNull();
  });

  it("rejects a non-image file", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "ACTIVITY_PHOTO")
      .attach("file", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid media type", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "NOT_A_TYPE")
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(400);
  });

  it("rejects an upload with no file", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "ACTIVITY_PHOTO");

    expect(res.status).toBe(400);
  });

  it("forbids a non-owning provider from uploading", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${otherProviderToken}`)
      .field("type", "ACTIVITY_PHOTO")
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /activities/:id/media/:mediaId", () => {
  it("removes the media row for the owning provider", async () => {
    const activityId = await makeActivity(providerToken);
    const uploadRes = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "ACTIVITY_PHOTO")
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const deleteRes = await request(app)
      .delete(`/activities/${activityId}/media/${uploadRes.body.media.id}`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(deleteRes.status).toBe(204);

    const activityRes = await request(app).get(`/activities/${activityId}`);
    expect(activityRes.body.activity.media).toHaveLength(0);
  });

  it("forbids a non-owning provider from deleting", async () => {
    const activityId = await makeActivity(providerToken);
    const uploadRes = await request(app)
      .post(`/activities/${activityId}/media`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("type", "ACTIVITY_PHOTO")
      .attach("file", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    const res = await request(app)
      .delete(`/activities/${activityId}/media/${uploadRes.body.media.id}`)
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(res.status).toBe(403);
  });

  it("404s for an unknown media id", async () => {
    const activityId = await makeActivity(providerToken);

    const res = await request(app)
      .delete(`/activities/${activityId}/media/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(404);
  });
});
