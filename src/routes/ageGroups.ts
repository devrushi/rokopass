import { Router } from "express";
import { prisma } from "../lib/prisma";

export const ageGroupsRouter = Router();

ageGroupsRouter.get("/", async (_req, res, next) => {
  try {
    const ageGroups = await prisma.ageGroup.findMany({ orderBy: { minAge: "asc" } });
    res.json({ ageGroups });
  } catch (err) {
    next(err);
  }
});
