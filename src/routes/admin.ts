import { Prisma } from "@prisma/client";
import { Router } from "express";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  activitySearchSchema,
  bookingSearchSchema,
  childSearchSchema,
  moderateActivitySchema,
  parentSearchSchema,
  planCreateSchema,
  planUpdateSchema,
  rejectProviderSchema,
} from "../schemas/admin";
import { serializeUser } from "../lib/serializeUser";
import { getAdminInsights } from "../services/aiInsights";
import { getAdminAnalytics } from "../services/analytics";
import { grantCharityCredits, getCharityPoolStats } from "../services/charity";
import { grantSchema } from "../schemas/charity";
import {
  adminStatementSearchSchema,
  generatePayoutSchema,
  generatePayoutsForAllSchema,
  platformSettingsUpdateSchema,
} from "../schemas/accounting";
import { getPlatformSettings, updatePlatformSettings } from "../services/platformSettings";
import { executePayoutStatement, generatePayoutStatement, loadOwnedStatement } from "../services/payouts";

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
    const role = req.query.role === "SCHOOL" ? "SCHOOL" : "PROVIDER";

    const providers = await prisma.user.findMany({
      where: { role, verificationStatus: status as "PENDING" | "APPROVED" | "REJECTED" },
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
    if (!provider || (provider.role !== "PROVIDER" && provider.role !== "SCHOOL")) {
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
    if (!provider || (provider.role !== "PROVIDER" && provider.role !== "SCHOOL")) {
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

// --- Plans (CRUD) ---

// Plan has two unique columns (name, stripePriceId); a P2002 on either previously got
// reported as "name already exists" regardless of which one actually conflicted, which
// was misleading whenever a reused Stripe price ID was the real cause.
function planUniqueConflictMessage(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  if (fields.includes("stripePriceId")) {
    return "A plan with that Stripe price ID already exists";
  }
  return "A plan with that name already exists";
}

adminRouter.get("/plans", async (req, res, next) => {
  try {
    const audience = typeof req.query.audience === "string" ? req.query.audience : undefined;
    if (audience && !["PARENT", "PROVIDER"].includes(audience)) {
      throw new AppError("Invalid audience filter", 400);
    }

    const plans = await prisma.plan.findMany({
      where: audience ? { audience: audience as "PARENT" | "PROVIDER" } : {},
      orderBy: [{ audience: "asc" }, { priceGbp: "asc" }],
    });

    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/plans", async (req, res, next) => {
  try {
    const parsed = planCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid plan data", 400);
    }

    const plan = await prisma.plan.create({ data: parsed.data });
    res.status(201).json({ plan });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(planUniqueConflictMessage(err), 409));
      return;
    }
    next(err);
  }
});

adminRouter.patch("/plans/:id", async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: param(req.params.id) } });
    if (!plan) {
      throw new AppError("Plan not found", 404);
    }

    const parsed = planUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid plan data", 400);
    }

    const updated = await prisma.plan.update({ where: { id: plan.id }, data: parsed.data });
    res.json({ plan: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      next(new AppError(planUniqueConflictMessage(err), 409));
      return;
    }
    next(err);
  }
});

adminRouter.delete("/plans/:id", async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: param(req.params.id) } });
    if (!plan) {
      throw new AppError("Plan not found", 404);
    }

    await prisma.plan.delete({ where: { id: plan.id } });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      next(new AppError("Can't delete a plan that has subscriptions — deactivate it instead", 409));
      return;
    }
    next(err);
  }
});

// --- Parents ---

adminRouter.get("/parents", async (req, res, next) => {
  try {
    const parsed = parentSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const { search, page, limit } = parsed.data;

    const where = {
      role: "PARENT" as const,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [parents, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          _count: { select: { children: true, bookings: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ parents, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// --- Children ---

adminRouter.get("/children", async (req, res, next) => {
  try {
    const parsed = childSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const { search, parentId, page, limit } = parsed.data;

    const where = {
      ...(parentId ? { parentId } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [children, total] = await Promise.all([
      prisma.child.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          createdAt: true,
          parent: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.child.count({ where }),
    ]);

    res.json({ children, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// --- Bookings ---

adminRouter.get("/bookings", async (req, res, next) => {
  try {
    const parsed = bookingSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const { search, status, page, limit } = parsed.data;

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { child: { firstName: { contains: search, mode: "insensitive" as const } } },
              { child: { lastName: { contains: search, mode: "insensitive" as const } } },
              { parent: { email: { contains: search, mode: "insensitive" as const } } },
              { session: { activity: { title: { contains: search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        select: {
          id: true,
          status: true,
          creditsSpent: true,
          createdAt: true,
          child: { select: { id: true, firstName: true, lastName: true } },
          parent: { select: { id: true, firstName: true, lastName: true, email: true } },
          session: {
            select: {
              id: true,
              startsAt: true,
              activity: { select: { id: true, title: true, providerId: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({ bookings, total, page, limit });
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

// --- Analytics ---

adminRouter.get("/analytics", async (_req, res, next) => {
  try {
    const data = await getAdminAnalytics();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/analytics/insights", async (_req, res, next) => {
  try {
    const analytics = await getAdminAnalytics();
    const insights = await getAdminInsights(analytics);
    res.json({ insights });
  } catch (err) {
    next(err);
  }
});

// --- Community fund (charity) ---

adminRouter.get("/charity", async (_req, res, next) => {
  try {
    const stats = await getCharityPoolStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/charity/grant", async (req, res, next) => {
  try {
    const parsed = grantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid grant request", 400);
    }

    const recipient = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!recipient || recipient.role !== "PARENT") {
      throw new AppError("No parent found with that email", 404);
    }

    const result = await grantCharityCredits({
      adminId: req.user!.sub,
      recipientId: recipient.id,
      amount: parsed.data.amount,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Provider payouts & accounting settings ---

adminRouter.get("/payouts/settings", async (_req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/payouts/settings", async (req, res, next) => {
  try {
    const parsed = platformSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid settings", 400);
    }
    const settings = await updatePlatformSettings(parsed.data);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/payouts", async (req, res, next) => {
  try {
    const parsed = adminStatementSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid query", 400);
    }
    const { providerId, status, page, limit } = parsed.data;

    const where = {
      ...(providerId ? { providerId } : {}),
      ...(status ? { status } : {}),
    };

    const [statements, total] = await Promise.all([
      prisma.payoutStatement.findMany({
        where,
        include: { provider: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payoutStatement.count({ where }),
    ]);

    res.json({ statements, total, page, limit });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/payouts/:id", async (req, res, next) => {
  try {
    const statement = await loadOwnedStatement(param(req.params.id), req.user!.sub, "ADMIN");
    res.json({ statement });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/payouts/generate", async (req, res, next) => {
  try {
    const parsed = generatePayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }
    const statement = await generatePayoutStatement(parsed.data);
    res.status(201).json({ statement });
  } catch (err) {
    next(err);
  }
});

// Runs generatePayoutStatement across every approved provider, skipping (not failing) any
// provider with no eligible bookings or no business profile yet — a bulk "close out the month"
// action, not an all-or-nothing batch.
adminRouter.post("/payouts/generate-all", async (req, res, next) => {
  try {
    const parsed = generatePayoutsForAllSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }
    const { periodStart, periodEnd } = parsed.data;

    const providers = await prisma.user.findMany({
      where: { role: "PROVIDER", verificationStatus: "APPROVED" },
      select: { id: true },
    });

    const generated: Awaited<ReturnType<typeof generatePayoutStatement>>[] = [];
    const skipped: { providerId: string; reason: string }[] = [];

    for (const provider of providers) {
      try {
        const statement = await generatePayoutStatement({ providerId: provider.id, periodStart, periodEnd });
        generated.push(statement);
      } catch (err) {
        skipped.push({
          providerId: provider.id,
          reason: err instanceof AppError ? err.message : "Unknown error",
        });
      }
    }

    res.status(201).json({ generated, skipped });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/payouts/:id/execute", async (req, res, next) => {
  try {
    const statement = await executePayoutStatement(param(req.params.id));
    res.json({ statement });
  } catch (err) {
    next(err);
  }
});
