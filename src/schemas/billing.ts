import { z } from "zod";

export const checkoutSessionSchema = z.object({
  planId: z.string().uuid("Must select a valid plan"),
});
