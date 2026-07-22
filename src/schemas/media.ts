import { z } from "zod";

export const uploadMediaSchema = z.object({
  type: z.enum(["ACTIVITY_PHOTO", "STAFF_PHOTO"]),
  caption: z.string().max(200).optional(),
});
