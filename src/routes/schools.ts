import { Router } from "express";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { schoolApprovalSchema } from "../schemas/schools";

export const schoolsRouter = Router();

schoolsRouter.use(requireAuth, requireRole("SCHOOL", "ADMIN"));

// A directory of RokidsPass-verified providers, each annotated with this school's own vetting
// decision (if any) — the platform's own verification/DBS status is the starting signal that
// reduces the school's own admin burden of vetting a provider from scratch; the school still
// records its own approve/shortlist/reject call, scoped to just this school.
schoolsRouter.get("/providers", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const providers = await prisma.user.findMany({
      where: {
        role: "PROVIDER",
        verificationStatus: "APPROVED",
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        whatsappNumber: true,
        dbsCertificateNumber: true,
        dbsCertificateExpiresAt: true,
        activities: {
          where: { isActive: true },
          select: { category: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const approvals = await prisma.schoolProviderApproval.findMany({
      where: { schoolId: req.user!.sub, providerId: { in: providers.map((p) => p.id) } },
    });
    const approvalByProviderId = new Map(approvals.map((a) => [a.providerId, a]));

    const results = providers.map((provider) => {
      const approval = approvalByProviderId.get(provider.id);
      return {
        id: provider.id,
        firstName: provider.firstName,
        lastName: provider.lastName,
        email: provider.email,
        whatsappNumber: provider.whatsappNumber,
        dbsCertificateNumber: provider.dbsCertificateNumber,
        dbsCertificateExpiresAt: provider.dbsCertificateExpiresAt,
        categories: [...new Set(provider.activities.map((a) => a.category))],
        activeActivitiesCount: provider.activities.length,
        schoolStatus: approval?.status ?? null,
        schoolNotes: approval?.notes ?? null,
      };
    });

    res.json({ providers: results });
  } catch (err) {
    next(err);
  }
});

schoolsRouter.put("/providers/:providerId/approval", async (req, res, next) => {
  try {
    const providerId = param(req.params.providerId);
    const provider = await prisma.user.findUnique({ where: { id: providerId } });
    if (!provider || provider.role !== "PROVIDER") {
      throw new AppError("Provider not found", 404);
    }

    const parsed = schoolApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid approval data", 400);
    }

    const approval = await prisma.schoolProviderApproval.upsert({
      where: { schoolId_providerId: { schoolId: req.user!.sub, providerId } },
      update: { status: parsed.data.status, notes: parsed.data.notes },
      create: {
        schoolId: req.user!.sub,
        providerId,
        status: parsed.data.status,
        notes: parsed.data.notes,
      },
    });

    res.json({ approval });
  } catch (err) {
    next(err);
  }
});
