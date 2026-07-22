import { Prisma } from "@prisma/client";
import { Router } from "express";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { activitySearchSchema, moderateActivitySchema, rejectProviderSchema } from "../schemas/admin";
import { serializeUser } from "../lib/serializeUser";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

function writeAuditLog(params: {
  adminId: string;
  action:
    | "PROVIDER_APPROVED"
    | "PROVIDER_REJECTED"
    | "ACTIVITY_FLAGGED"
    | "ACTIVITY_UNFLAGGED"
    | "ACTIVITY_FEATURED"
    | "ACTIVITY_UNFEATURED";
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

// --- Provider verification ---

adminRouter.get("/providers", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      throw new AppError("Invalid status filter", 400);
    }

    const providers = await prisma.user.findMany({
      where: { role: "PROVIDER", verificationStatus: status as "PENDING" | "APPROVED" | "REJECTED" },
      orderBy: { createdAt: "asc" },
    });

    res.json({ providers: providers.map(serializeUser) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/providers/:id/approve", async (req, res, next) => {
  try {
    const provider = await prisma.user.findUnique({ where: { id: param(req.params.id) } });
    if (!provider || provider.role !== "PROVIDER") {
      throw new AppError("Provider not found", 404);
    }

    const updated = await prisma.user.update({
      where: { id: provider.id },
      data: { verificationStatus: "APPROVED" },
    });

    await writeAuditLog({
      adminId: req.user!.sub,
      action: "PROVIDER_APPROVED",
      targetType: "User",
      targetId: provider.id,
    });

    res.json({ provider: serializeUser(updated) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/providers/:id/reject", async (req, res, next) => {
  try {
    const provider = await prisma.user.findUnique({ where: { id: param(req.params.id) } });
    if (!provider || provider.role !== "PROVIDER") {
      throw new AppError("Provider not found", 404);
    }

    const parsed = rejectProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }

    const updated = await prisma.user.update({
      where: { id: provider.id },
      data: { verificationStatus: "REJECTED" },
    });

    await writeAuditLog({
      adminId: req.user!.sub,
      action: "PROVIDER_REJECTED",
      targetType: "User",
      targetId: provider.id,
      metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
    });

    res.json({ provider: serializeUser(updated) });
  } catch (err) {
    next(err);
  }
});

// --- Activity moderation ---

adminRouter.get("/activities", async (req, res, next) => {
  try {
    const parsed = activitySearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const { search, category, ageGroupId, providerId, isFlagged, isFeatured, page, limit } = parsed.data;

    const where = {
      ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
      ...(category ? { category } : {}),
      ...(ageGroupId ? { ageGroupId } : {}),
      ...(providerId ? { providerId } : {}),
      ...(isFlagged !== undefined ? { isFlagged } : {}),
      ...(isFeatured !== undefined ? { isFeatured } : {}),
    };

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          ageGroup: true,
          provider: { select: { id: true, firstName: true, lastName: true, verificationStatus: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({ activities, total, page, limit });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/activities/:id/moderation", async (req, res, next) => {
  try {
    const activity = await prisma.activity.findUnique({ where: { id: param(req.params.id) } });
    if (!activity) {
      throw new AppError("Activity not found", 404);
    }

    const parsed = moderateActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }

    const updated = await prisma.activity.update({
      where: { id: activity.id },
      data: parsed.data,
      include: { ageGroup: true },
    });

    if (parsed.data.isFlagged !== undefined && parsed.data.isFlagged !== activity.isFlagged) {
      await writeAuditLog({
        adminId: req.user!.sub,
        action: parsed.data.isFlagged ? "ACTIVITY_FLAGGED" : "ACTIVITY_UNFLAGGED",
        targetType: "Activity",
        targetId: activity.id,
      });
    }
    if (parsed.data.isFeatured !== undefined && parsed.data.isFeatured !== activity.isFeatured) {
      await writeAuditLog({
        adminId: req.user!.sub,
        action: parsed.data.isFeatured ? "ACTIVITY_FEATURED" : "ACTIVITY_UNFEATURED",
        targetType: "Activity",
        targetId: activity.id,
      });
    }

    res.json({ activity: updated });
  } catch (err) {
    next(err);
  }
});

// --- Audit log ---

adminRouter.get("/audit-log", async (req, res, next) => {
  try {
    const targetType = typeof req.query.targetType === "string" ? req.query.targetType : undefined;
    const targetId = typeof req.query.targetId === "string" ? req.query.targetId : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const entries = await prisma.auditLog.findMany({
      where: {
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      },
      include: { admin: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ entries });
  } catch (err) {
    next(err);
  }
});
