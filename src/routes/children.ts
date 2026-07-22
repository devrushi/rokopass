import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { createChildSchema } from "../schemas/children";

export const childrenRouter = Router();

childrenRouter.get("/mine", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const children = await prisma.child.findMany({
      where: { parentId: req.user!.sub },
      orderBy: { createdAt: "asc" },
    });
    res.json({ children });
  } catch (err) {
    next(err);
  }
});

childrenRouter.post("/", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = createChildSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid child data", 400);
    }

    const child = await prisma.child.create({
      data: { ...parsed.data, parentId: req.user!.sub },
    });

    res.status(201).json({ child });
  } catch (err) {
    next(err);
  }
});
