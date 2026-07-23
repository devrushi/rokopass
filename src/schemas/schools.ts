import { z } from "zod";

export const schoolApprovalSchema = z.object({
  status: z.enum(["SHORTLISTED", "APPROVED", "REJECTED"]),
  notes: z.string().max(1000).nullable().optional(),
});
