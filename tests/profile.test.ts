import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@profile.test.rokidspass.local";
const uniqueEmail = () => `profile-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
});

async function registerProvider() {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(),
    password: "Password123",
    firstName: "Test",
    lastName: "Provider",
    role: "PROVIDER",
  });
  return res.body.accessToken as string;
}

describe("PATCH /auth/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).patch("/auth/me").send({ whatsappNumber: "+441234567890" });
    expect(res.status).toBe(401);
  });

  it("sets a WhatsApp number in international format", async () => {
    const token = await registerProvider();
    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ whatsappNumber: "+441234567890" });

    expect(res.status).toBe(200);
    expect(res.body.user.whatsappNumber).toBe("+441234567890");
  });

  it("rejects a number not in international format", async () => {
    const token = await registerProvider();
    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ whatsappNumber: "01234567890" });

    expect(res.status).toBe(400);
  });

  it("allows clearing the number by sending null", async () => {
    const token = await registerProvider();
    await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ whatsappNumber: "+441234567890" });

    const res = await request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ whatsappNumber: null });

    expect(res.status).toBe(200);
    expect(res.body.user.whatsappNumber).toBeNull();
  });
});
