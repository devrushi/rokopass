import { z } from "zod";

export const createBookingSchema = z.object({
  childId: z.string().uuid("Must select a valid child"),
  sessionId: z.string().uuid("Must select a valid session"),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(["ATTENDED", "NO_SHOW"]),
});
