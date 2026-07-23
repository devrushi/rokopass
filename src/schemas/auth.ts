import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["PARENT", "PROVIDER", "SCHOOL"]).default("PARENT"),
});

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

const urlField = z.string().url("Must be a valid URL").nullable().optional();

export const updateProfileSchema = z
  .object({
    // Loose E.164-ish check (leading +, 8-15 digits) — good enough to catch typos without being
    // a full phone-number validation library. Used to build a wa.me deep link, not for
    // SMS/calling.
    whatsappNumber: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Must be in international format, e.g. +441234567890")
      .nullable()
      .optional(),
    instagramUrl: urlField,
    facebookUrl: urlField,
    tiktokUrl: urlField,
    dbsCertificateNumber: z.string().min(1).max(100).nullable().optional(),
    dbsCertificateExpiresAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
