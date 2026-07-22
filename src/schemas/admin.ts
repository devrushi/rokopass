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
