import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

const app = createApp();

const EMAIL_SUFFIX = "@schools.test.rokidspass.local";
const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}${EMAIL_SUFFIX}`;

let ageGroupId: string;

async function registerUser(label: string, role: "PARENT" | "PROVIDER" | "SCHOOL") {
  const res = await request(app).post("/auth/register").send({
    email: uniqueEmail(label),
    password: "Password123",
    firstName: "Test",
    lastName: label,
    role,
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string, body: res.body };
}

async function loginAsAdmin(): Promise<string> {
  const email = uniqueEmail("admin");
  const passwordHash = await hashPassword("Password123");
  await prisma.user.create({ data: { email, passwordHash, firstName: "Ad", lastName: "Min", role: "ADMIN" } });
  const res = await request(app).post("/auth/login").send({ email, password: "Password123" });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const ageGroup = await prisma.ageGroup.findFirstOrThrow();
  ageGroupId = ageGroup.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
  const userIds = users.map((u) => u.id);
  await prisma.schoolProviderApproval.deleteMany({
    where: { OR: [{ schoolId: { in: userIds } }, { providerId: { in: userIds } }] },
  });
  await prisma.activity.deleteMany({ where: { providerId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("SCHOOL registration and admin approval", () => {
  it("registers a school as PENDING, invisible to schools/providers until approved", async () => {
    const { body } = await registerUser("school", "SCHOOL");
    expect(body.user.role).toBe("SCHOOL");
    expect(body.user.verificationStatus).toBe("PENDING");
  });

  it("lists pending schools separately from pending providers, and lets admin approve a school", async () => {
    const adminToken = await loginAsAdmin();
    const { id: schoolId } = await registerUser("pending-school", "SCHOOL");
    const { id: providerId } = await registerUser("pending-provider", "PROVIDER");

    const pendingSchools = await request(app)
      .get("/admin/providers?status=PENDING&role=SCHOOL")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pendingSchools.status).toBe(200);
    expect(pendingSchools.body.providers.some((p: { id: string }) => p.id === schoolId)).toBe(true);
    expect(pendingSchools.body.providers.some((p: { id: string }) => p.id === providerId)).toBe(false);

    const approveRes = await request(app)
      .post(`/admin/providers/${schoolId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.provider.verificationStatus).toBe("APPROVED");
  });
});

describe("GET /schools/providers", () => {
  it("requires a SCHOOL or ADMIN role", async () => {
    const { token: parentToken } = await registerUser("plain-parent", "PARENT");
    const res = await request(app).get("/schools/providers").set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("lists only APPROVED providers with categories and DBS info, annotated per-school", async () => {
    const adminToken = await loginAsAdmin();
    const { id: providerId, token: providerToken } = await registerUser("directory-provider", "PROVIDER");
    await request(app)
      .post(`/admin/providers/${providerId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    await prisma.user.update({
      where: { id: providerId },
      data: { dbsCertificateNumber: "DBS-12345", dbsCertificateExpiresAt: new Date(Date.now() + 31_536_000_000) },
    });
    await request(app).post("/activities").set("Authorization", `Bearer ${providerToken}`).send({
      title: "School Directory Test Activity",
      description: "d",
      category: "Chess",
      ageGroupId,
      location: "L",
      capacity: 10,
      creditCost: 1,
    });

    const { token: schoolToken } = await registerUser("directory-school", "SCHOOL");

    const listRes = await request(app).get("/schools/providers").set("Authorization", `Bearer ${schoolToken}`);
    expect(listRes.status).toBe(200);
    const entry = listRes.body.providers.find((p: { id: string }) => p.id === providerId);
    expect(entry).toBeDefined();
    expect(entry.categories).toContain("Chess");
    expect(entry.dbsCertificateNumber).toBe("DBS-12345");
    expect(entry.schoolStatus).toBeNull();
  });

  it("scopes approval decisions per-school and rejects unknown providers", async () => {
    const adminToken = await loginAsAdmin();
    const { id: providerId } = await registerUser("scoped-provider", "PROVIDER");
    await request(app)
      .post(`/admin/providers/${providerId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const { token: schoolAToken } = await registerUser("school-a", "SCHOOL");
    const { token: schoolBToken } = await registerUser("school-b", "SCHOOL");

    const approveRes = await request(app)
      .put(`/schools/providers/${providerId}/approval`)
      .set("Authorization", `Bearer ${schoolAToken}`)
      .send({ status: "APPROVED", notes: "Great references" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approval.status).toBe("APPROVED");

    const listAsSchoolA = await request(app)
      .get("/schools/providers")
      .set("Authorization", `Bearer ${schoolAToken}`);
    expect(listAsSchoolA.body.providers.find((p: { id: string }) => p.id === providerId).schoolStatus).toBe(
      "APPROVED",
    );

    const listAsSchoolB = await request(app)
      .get("/schools/providers")
      .set("Authorization", `Bearer ${schoolBToken}`);
    expect(listAsSchoolB.body.providers.find((p: { id: string }) => p.id === providerId).schoolStatus).toBeNull();

    const unknownRes = await request(app)
      .put("/schools/providers/00000000-0000-0000-0000-000000000000/approval")
      .set("Authorization", `Bearer ${schoolAToken}`)
      .send({ status: "APPROVED" });
    expect(unknownRes.status).toBe(404);
  });
});
