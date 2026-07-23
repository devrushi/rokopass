import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}));

vi.mock("../src/lib/anthropic", () => ({
  anthropic: { messages: { create: messagesCreateMock } },
  AI_MODEL: "claude-haiku-4-5-20251001",
}));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@ai.test.rokidspass.local";
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

function mockTextResponse(text: string) {
  messagesCreateMock.mockResolvedValueOnce({ content: [{ type: "text", text }] });
}

beforeAll(async () => {
  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterEach(() => {
  messagesCreateMock.mockReset();
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("AI analytics insights", () => {
  it("returns AI-generated insights for a parent", async () => {
    const { token } = await makeUser("parent", "PARENT");
    mockTextResponse("- You've used 2 credits this month.\n- Keep it up!");

    const res = await request(app)
      .post("/analytics/parent/insights")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.insights).toContain("credits");
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });

  it("returns AI-generated insights for a provider", async () => {
    const { token } = await makeUser("provider", "PROVIDER");
    mockTextResponse("- Your attendance rate looks solid.");

    const res = await request(app)
      .post("/analytics/provider/insights")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.insights).toContain("attendance");
  });

  it("returns AI-generated insights for admin", async () => {
    const { token } = await makeUser("admin", "ADMIN");
    mockTextResponse("- Platform signups are steady.");

    const res = await request(app).post("/admin/analytics/insights").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.insights).toContain("signups");
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/analytics/parent/insights");
    expect(res.status).toBe(401);
  });

  it("returns 502 when the AI call fails", async () => {
    const { token } = await makeUser("parent-fail", "PARENT");
    messagesCreateMock.mockRejectedValueOnce(new Error("upstream error"));

    const res = await request(app)
      .post("/analytics/parent/insights")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(502);
  });
});

describe("POST /ai/chat", () => {
  it("lets a parent chat and injects the real activity catalogue", async () => {
    const provider = await makeUser("chat-provider", "PROVIDER");
    await prisma.activity.create({
      data: {
        providerId: provider.user.id,
        ageGroupId,
        title: "Unique Chat Test Swimming",
        description: "test",
        category: "Swimming",
        location: "Test Pool",
        capacity: 10,
        creditCost: 2,
      },
    });

    const { token } = await makeUser("parent", "PARENT");
    mockTextResponse("Try Unique Chat Test Swimming!");

    const res = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "Looking for swimming for my 6 year old" }] });

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("Swimming");

    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.system).toContain("Unique Chat Test Swimming");
  });

  it("lets a provider chat and gets platform-help context, not activity data", async () => {
    const { token } = await makeUser("provider", "PROVIDER");
    mockTextResponse("Go to Provider Dashboard > New activity.");

    const res = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "How do I list an activity?" }] });

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("New activity");

    const call = messagesCreateMock.mock.calls[0][0];
    expect(call.system).toContain("platform-help assistant");
  });

  it("rejects admin (not in scope for this feature)", async () => {
    const { token } = await makeUser("admin", "ADMIN");

    const res = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [{ role: "user", content: "hello" }] });

    expect(res.status).toBe(403);
  });

  it("rejects an empty messages array", async () => {
    const { token } = await makeUser("parent-bad", "PARENT");

    const res = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ messages: [] });

    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/ai/chat")
      .send({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
  });
});
