import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getLeaderboard } from "../services/leaderboard";

export const leaderboardRouter = Router();

// Authenticated (not fully public) — reduces scraping of even pseudonymized children's data,
// consistent with how the rest of the app treats anything child-related as more guarded than
// general activity/provider data.
leaderboardRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const entries = await getLeaderboard();
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});
