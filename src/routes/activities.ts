import { Router } from "express";
import { activityMediaPublicUrl, activityMediaUpload, deleteActivityMediaFile } from "../lib/upload";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  createActivitySchema,
  createScheduleSchema,
  updateActivitySchema,
} from "../schemas/activity";
import { uploadMediaSchema } from "../schemas/media";
import { syncSessionsForSchedule } from "../services/scheduleGenerator";

export const activitiesRouter = Router();

async function loadOwnedActivity(activityId: string, userId: string, role: string) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) {
    throw new AppError("Activity not found", 404);
  }
  if (role !== "ADMIN" && activity.providerId !== userId) {
    throw new AppError("You do not have permission to modify this activity", 403);
  }
  return activity;
}

activitiesRouter.get("/", async (req, res, next) => {
  try {
    const sendFriendly = req.query.sendFriendly === "true";

    const activities = await prisma.activity.findMany({
      where: {
        isActive: true,
        isFlagged: false,
        ...(sendFriendly ? { isSendFriendly: true } : {}),
        // Public listing only shows activities from verified providers (or admin-created ones,
        // which have no verificationStatus to check). Providers still see their own pending
        // activities via GET /activities/mine while awaiting approval — this only hides them
        // from other visitors, it doesn't block creation/management.
        provider: { OR: [{ role: "ADMIN" }, { verificationStatus: "APPROVED" }] },
      },
      include: {
        ageGroup: true,
        media: true,
        provider: { select: { id: true, firstName: true, lastName: true } },
        // Just enough to render a "Sat 10:00 · 45 min" summary on the Browse card — the full
        // session calendar lives on the activity detail page, this is a lightweight preview.
        recurringSchedules: {
          select: { dayOfWeek: true, startTime: true, durationMinutes: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.get("/mine", requireAuth, requireRole("PROVIDER", "ADMIN"), async (req, res, next) => {
  try {
    const activities = await prisma.activity.findMany({
      where: { providerId: req.user!.sub },
      include: {
        ageGroup: true,
        media: true,
        recurringSchedules: {
          select: { dayOfWeek: true, startTime: true, durationMinutes: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.get("/:id", async (req, res, next) => {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: param(req.params.id) },
      include: {
        ageGroup: true,
        media: true,
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            whatsappNumber: true,
            instagramUrl: true,
            facebookUrl: true,
            tiktokUrl: true,
          },
        },
      },
    });
    if (!activity) {
      throw new AppError("Activity not found", 404);
    }
    res.json({ activity });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.post("/", requireAuth, requireRole("PROVIDER", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid activity data", 400);
    }

    const ageGroup = await prisma.ageGroup.findUnique({ where: { id: parsed.data.ageGroupId } });
    if (!ageGroup) {
      throw new AppError("Unknown age group", 400);
    }

    const activity = await prisma.activity.create({
      data: { ...parsed.data, providerId: req.user!.sub },
      include: { ageGroup: true, media: true },
    });

    res.status(201).json({ activity });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.patch("/:id", requireAuth, requireRole("PROVIDER", "ADMIN"), async (req, res, next) => {
  try {
    const activity = await loadOwnedActivity(param(req.params.id), req.user!.sub, req.user!.role);

    const parsed = updateActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid activity data", 400);
    }

    if (parsed.data.ageGroupId) {
      const ageGroup = await prisma.ageGroup.findUnique({ where: { id: parsed.data.ageGroupId } });
      if (!ageGroup) {
        throw new AppError("Unknown age group", 400);
      }
    }

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data: parsed.data,
      include: { ageGroup: true, media: true },
    });

    res.json({ activity: updated });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.post(
  "/:id/schedules",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const activity = await loadOwnedActivity(param(req.params.id), req.user!.sub, req.user!.role);

      const parsed = createScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? "Invalid schedule data", 400);
      }

      const schedule = await prisma.recurringSchedule.create({
        data: { ...parsed.data, activityId: activity.id },
      });

      await syncSessionsForSchedule(schedule.id);

      res.status(201).json({ schedule });
    } catch (err) {
      next(err);
    }
  },
);

activitiesRouter.get("/:id/sessions", async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(from.getTime() + 28 * 24 * 60 * 60_000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppError("Invalid from/to date", 400);
    }

    const sessions = await prisma.classSession.findMany({
      where: { activityId: param(req.params.id), startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
    });

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

activitiesRouter.post(
  "/:id/media",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  (req, res, next) => {
    const activityId = param(req.params.id);

    loadOwnedActivity(activityId, req.user!.sub, req.user!.role)
      .then(() => {
        activityMediaUpload.single("file")(req, res, async (uploadErr) => {
          try {
            if (uploadErr) {
              throw new AppError(uploadErr.message || "Upload failed", 400);
            }
            if (!req.file) {
              throw new AppError("No file uploaded", 400);
            }

            const parsed = uploadMediaSchema.safeParse(req.body);
            if (!parsed.success) {
              deleteActivityMediaFile(req.file.filename);
              throw new AppError(parsed.error.issues[0]?.message ?? "Invalid media data", 400);
            }

            const media = await prisma.activityMedia.create({
              data: {
                activityId,
                type: parsed.data.type,
                caption: parsed.data.caption,
                url: activityMediaPublicUrl(req.file.filename),
              },
            });

            res.status(201).json({ media });
          } catch (err) {
            next(err);
          }
        });
      })
      .catch(next);
  },
);

activitiesRouter.delete(
  "/:id/media/:mediaId",
  requireAuth,
  requireRole("PROVIDER", "ADMIN"),
  async (req, res, next) => {
    try {
      const activity = await loadOwnedActivity(param(req.params.id), req.user!.sub, req.user!.role);

      const media = await prisma.activityMedia.findUnique({ where: { id: param(req.params.mediaId) } });
      if (!media || media.activityId !== activity.id) {
        throw new AppError("Media not found", 404);
      }

      await prisma.activityMedia.delete({ where: { id: media.id } });
      deleteActivityMediaFile(media.url);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
