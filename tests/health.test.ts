import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const app = createApp();

describe("GET /health", () => {
  it("returns 200 ok without touching the database", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /health/db", () => {
  it("returns 200 with a live database connection", async () => {
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "connected" });
  });
});

describe("unknown routes", () => {
  it("returns a JSON 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("GET /does-not-exist");
  });
});
