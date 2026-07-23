import { describe, expect, it } from "vitest";
import { envSchema } from "../src/config/env";

const validEnv = {
  NODE_ENV: "development",
  PORT: "3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  CORS_ORIGIN: "*",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_fake",
  ANTHROPIC_API_KEY: "sk-ant-fake",
};

describe("envSchema", () => {
  it("accepts a fully specified valid environment", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("coerces PORT to a number", () => {
    const result = envSchema.parse(validEnv);
    expect(result.PORT).toBe(3000);
  });

  it("defaults NODE_ENV, PORT, CORS_ORIGIN, and CLIENT_URL when omitted", () => {
    const {
      DATABASE_URL,
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      ANTHROPIC_API_KEY,
    } = validEnv;
    const result = envSchema.parse({
      DATABASE_URL,
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
      ANTHROPIC_API_KEY,
    });
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(3000);
    expect(result.CORS_ORIGIN).toBe("*");
    expect(result.JWT_ACCESS_EXPIRES_IN).toBe("15m");
    expect(result.JWT_REFRESH_EXPIRES_IN).toBe("30d");
    expect(result.CLIENT_URL).toBe("http://localhost:5173");
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_ACCESS_SECRET: "too-short" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid NODE_ENV value", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric PORT", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "not-a-number" });
    expect(result.success).toBe(false);
  });
});
