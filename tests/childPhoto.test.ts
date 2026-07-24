import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { UPLOAD_ROOT } from "../src/lib/upload";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@childphoto.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function registerParent(label: string) {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(label),
    password: "Password123",
    firstName: "Test",
    lastName: label,
    role: "PARENT",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

async function makeChild(token: string) {
  const res = await request(app)
    .post("/children")
    .set("Authorization", `Bearer ${token}`)
    .send({ firstName: "Kid", lastName: "Testerson", dateOfBirth: "2019-01-01" });
  return res.body.child.id as string;
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.child.deleteMany({ where: { parentId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("POST /children/:id/photo", () => {
  it("uploads a photo for the parent's own child", async () => {
    const { token } = await registerParent("owner");
    const childId = await makeChild(token);

    const res = await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "kid.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.child.photoUrl).toMatch(/^\/uploads\/children\/.+\.png$/);

    const filePath = path.join(UPLOAD_ROOT, res.body.child.photoUrl.replace(/^\/uploads\//, ""));
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("rejects uploading a photo for another parent's child", async () => {
    const { token: ownerToken } = await registerParent("owner2");
    const childId = await makeChild(ownerToken);
    const { token: otherToken } = await registerParent("intruder");

    const res = await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${otherToken}`)
      .attach("file", TINY_PNG, { filename: "kid.png", contentType: "image/png" });

    expect(res.status).toBe(403);
  });

  it("rejects a non-image file", async () => {
    const { token } = await registerParent("badfile");
    const childId = await makeChild(token);

    const res = await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("not an image"), { filename: "kid.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
  });

  it("replaces an existing photo and removes the old file", async () => {
    const { token } = await registerParent("replacer");
    const childId = await makeChild(token);

    const first = await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "first.png", contentType: "image/png" });
    const firstPath = path.join(UPLOAD_ROOT, first.body.child.photoUrl.replace(/^\/uploads\//, ""));

    const second = await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "second.png", contentType: "image/png" });

    expect(second.body.child.photoUrl).not.toBe(first.body.child.photoUrl);
    // Give the async fs.rm a moment before checking.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fs.existsSync(firstPath)).toBe(false);
  });
});

describe("DELETE /children/:id/photo", () => {
  it("clears the child's photo", async () => {
    const { token } = await registerParent("deleter");
    const childId = await makeChild(token);
    await request(app)
      .post(`/children/${childId}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", TINY_PNG, { filename: "kid.png", contentType: "image/png" });

    const res = await request(app).delete(`/children/${childId}/photo`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.child.photoUrl).toBeNull();
  });
});
