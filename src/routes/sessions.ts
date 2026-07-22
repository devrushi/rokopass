import { Router } from "express";
import { prisma } from "../lib/prisma";
import { param } from "../lib/requestParams";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { updateSessionSchema } from "../schemas/activity";

export const sessionsRouter = Router();

sessionsRouter.patch("/:id", requireAuth, requireRole("PROVIDER", "ADMIN"), async (req, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({
      where: { id: param(req.params.id) },
      include: { activity: { select: { providerId: true } } },
    });
    if (!session) {
      throw new AppError("Session not found", 404);
    }
    if (req.user!.role !== "ADMIN" && session.activity.providerId !== req.user!.sub) {
      throw new AppError("You do not have permission to modify this session", 403);
    }

    const parsed = updateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid session data", 400);
    }

    const updated = await prisma.classSession.update({
      where: { id: session.id },
      data: parsed.data,
    });

    res.json({ session: updated });
  } catch (err) {
    next(err);
  }
});
