import { Router } from "express";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { chatSchema } from "../schemas/ai";
import { chatWithAssistant } from "../services/aiChat";

export const aiRouter = Router();

aiRouter.post("/chat", requireAuth, requireRole("PARENT", "PROVIDER"), async (req, res, next) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid chat request", 400);
    }

    const { reply, recommendedActivities } = await chatWithAssistant(
      req.user!.sub,
      req.user!.role,
      parsed.data.messages,
    );
    res.json({ reply, recommendedActivities });
  } catch (err) {
    next(err);
  }
});
