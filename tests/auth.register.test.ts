import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@test.rokidspass.local";
const uniqueEmail = () => `register-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

const validPayload = () => ({
  email: uniqueEmail(),
  password: "Password123",
  firstName: "Ada",
  lastName: "Lovelace",
});

describe("POST /auth/register", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  });

  it("creates a user and returns tokens without exposing the password hash", async () => {
    const payload = validPayload();
    const res = await request(app).post("/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: "PARENT",
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("stores a bcrypt hash, not the plaintext password", async () => {
    const payload = validPayload();
    await request(app).post("/auth/register").send(payload);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: payload.email } });
    expect(stored.passwordHash).not.toBe(payload.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a duplicate email with 409", async () => {
    const payload = validPayload();
    await request(app).post("/auth/register").send(payload).expect(201);

    const res = await request(app).post("/auth/register").send(payload);
    expect(res.status).toBe(409);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validPayload(), email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects a password without a number with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validPayload(), password: "nonumberhere" });
    expect(res.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validPayload(), password: "sh0rt" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing firstName with 400", async () => {
    const { firstName: _omit, ...rest } = validPayload();
    const res = await request(app).post("/auth/register").send(rest);
    expect(res.status).toBe(400);
  });

  it("logs the newly registered user in with the returned access token", async () => {
    const payload = validPayload();
    const registerRes = await request(app).post("/auth/register").send(payload);

    const meRes = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${registerRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(payload.email);
  });
});
