import { z } from "zod";

export const createActivitySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  ageGroupId: z.string().uuid("Must select a valid age group"),
  location: z.string().min(1, "Location is required"),
  capacity: z.coerce.number().int().positive("Capacity must be a positive number"),
  creditCost: z.coerce.number().int().positive("Credit cost must be a positive number"),
  isSendFriendly: z.boolean().optional(),
});

export const updateActivitySchema = createActivitySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createScheduleSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0, "dayOfWeek must be 0-6").max(6, "dayOfWeek must be 0-6"),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "startTime must be in HH:mm 24-hour format"),
  durationMinutes: z.coerce.number().int().positive("durationMinutes must be positive"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY"]).default("WEEKLY"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
});

export const updateSessionSchema = z
  .object({
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    isCancelled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });
