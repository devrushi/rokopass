import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { getParentAnalytics, getProviderAnalytics } from "../services/analytics";

export const analyticsRouter = Router();

analyticsRouter.get("/parent", requireAuth, requireRole("PARENT", "ADMIN"), async (req, res, next) => {
  try {
    const data = await getParentAnalytics(req.user!.sub);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/provider", requireAuth, requireRole("PROVIDER", "ADMIN"), async (req, res, next) => {
  try {
    const data = await getProviderAnalytics(req.user!.sub);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
