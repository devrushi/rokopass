import { z } from "zod";

export const createChildSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.coerce.date(),
  allergyInfo: z.string().max(2000).nullable().optional(),
  isOnLeaderboard: z.boolean().optional(),
});

export const updateChildSchema = createChildSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
