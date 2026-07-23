import { z } from "zod";

export const donateSchema = z.object({
  amount: z.coerce.number().int().positive("Amount must be a positive number of credits"),
});

export const grantSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  amount: z.coerce.number().int().positive("Amount must be a positive number of credits"),
});
