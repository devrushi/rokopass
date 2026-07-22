import { z } from "zod";

export const rejectProviderSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const moderateActivitySchema = z
  .object({
    isFlagged: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  })
  .refine((data) => data.isFlagged !== undefined || data.isFeatured !== undefined, {
    message: "No fields to update",
  });

export const activitySearchSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  ageGroupId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  isFlagged: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const parentSearchSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const childSearchSchema = z.object({
  search: z.string().optional(),
  parentId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const planCreateSchema = z
  .object({
    audience: z.enum(["PARENT", "PROVIDER"]),
    name: z.string().min(1),
    description: z.string().min(1),
    priceGbp: z.coerce.number().int().nonnegative(),
    monthlyCredits: z.coerce.number().int().positive().optional(),
    maxActiveActivities: z.coerce.number().int().positive().optional(),
    stripePriceId: z.string().min(1).optional(),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.audience !== "PARENT" || data.monthlyCredits !== undefined, {
    message: "monthlyCredits is required for PARENT plans",
    path: ["monthlyCredits"],
  });

export const planUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    priceGbp: z.coerce.number().int().nonnegative().optional(),
    monthlyCredits: z.coerce.number().int().positive().nullable().optional(),
    maxActiveActivities: z.coerce.number().int().positive().nullable().optional(),
    stripePriceId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export const bookingSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["PENDING_APPROVAL", "CONFIRMED", "CANCELLED", "REJECTED", "ATTENDED", "NO_SHOW"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
