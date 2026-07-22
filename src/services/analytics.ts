import { prisma } from "../lib/prisma";
import { getCreditBalance } from "./creditBalance";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;
const HOLDING_OR_ATTENDED_STATUSES = ["CONFIRMED", "ATTENDED", "NO_SHOW"] as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- Parent ---

export interface ParentAnalytics {
  balance: number;
  plan: { id: string; name: string; monthlyCredits: number } | null;
  currentPeriodEnd: Date | null;
  creditsUsedLast30Days: number;
  spendingByCategory: { category: string; creditsSpent: number }[];
  childrenAttendance: {
    childId: string;
    firstName: string;
    lastName: string;
    attended: number;
    noShow: number;
    upcoming: number;
  }[];
  upcomingBookings: { id: string; activityTitle: string; childFirstName: string; startsAt: Date }[];
}

export async function getParentAnalytics(parentId: string): Promise<ParentAnalytics> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const now = new Date();

  const [balance, subscription, children, bookings, creditsUsedResult] = await Promise.all([
    getCreditBalance(parentId),
    prisma.subscription.findUnique({
      where: { userId: parentId },
      include: { plan: { select: { id: true, name: true, monthlyCredits: true } } },
    }),
    prisma.child.findMany({ where: { parentId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.booking.findMany({
      where: { parentId },
      select: {
        id: true,
        status: true,
        creditsSpent: true,
        childId: true,
        child: { select: { firstName: true } },
        session: { select: { startsAt: true, activity: { select: { title: true, category: true } } } },
      },
    }),
    prisma.creditTransaction.aggregate({
      where: { userId: parentId, reason: "BOOKING", createdAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);

  const childrenAttendance = children.map((child) => {
    const childBookings = bookings.filter((b) => b.childId === child.id);
    return {
      childId: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      attended: childBookings.filter((b) => b.status === "ATTENDED").length,
      noShow: childBookings.filter((b) => b.status === "NO_SHOW").length,
      upcoming: childBookings.filter((b) => b.status === "CONFIRMED" && b.session.startsAt > now).length,
    };
  });

  const spendingByCategoryMap = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === "CONFIRMED" || booking.status === "ATTENDED") {
      const category = booking.session.activity.category;
      spendingByCategoryMap.set(category, (spendingByCategoryMap.get(category) ?? 0) + booking.creditsSpent);
    }
  }
  const spendingByCategory = Array.from(spendingByCategoryMap.entries())
    .map(([category, creditsSpent]) => ({ category, creditsSpent }))
    .sort((a, b) => b.creditsSpent - a.creditsSpent);

  const upcomingBookings = bookings
    .filter((b) => b.status === "CONFIRMED" && b.session.startsAt > now)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime())
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      activityTitle: b.session.activity.title,
      childFirstName: b.child.firstName,
      startsAt: b.session.startsAt,
    }));

  return {
    balance,
    plan: subscription?.plan ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    creditsUsedLast30Days: Math.abs(creditsUsedResult._sum.amount ?? 0),
    spendingByCategory,
    childrenAttendance,
    upcomingBookings,
  };
}

// --- Provider ---

export interface ProviderAnalytics {
  totalActivities: number;
  bookingsByStatus: Record<string, number>;
  attendanceRatePercent: number | null;
  avgCapacityUtilizationPercent: number | null;
  avgApprovalResponseMinutes: number | null;
  repeatBookingRatePercent: number | null;
  topActivities: { activityId: string; title: string; bookingsCount: number }[];
}

export async function getProviderAnalytics(providerId: string): Promise<ProviderAnalytics> {
  const activities = await prisma.activity.findMany({
    where: { providerId },
    select: { id: true, title: true },
  });
  const activityIds = activities.map((a) => a.id);

  if (activityIds.length === 0) {
    return {
      totalActivities: 0,
      bookingsByStatus: {},
      attendanceRatePercent: null,
      avgCapacityUtilizationPercent: null,
      avgApprovalResponseMinutes: null,
      repeatBookingRatePercent: null,
      topActivities: [],
    };
  }

  const bookings = await prisma.booking.findMany({
    where: { session: { activityId: { in: activityIds } } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      parentId: true,
      sessionId: true,
      session: { select: { activityId: true, capacity: true } },
    },
  });

  const bookingsByStatus: Record<string, number> = {};
  for (const b of bookings) {
    bookingsByStatus[b.status] = (bookingsByStatus[b.status] ?? 0) + 1;
  }

  const attended = bookingsByStatus.ATTENDED ?? 0;
  const noShow = bookingsByStatus.NO_SHOW ?? 0;
  const attendanceRatePercent =
    attended + noShow > 0 ? round1((attended / (attended + noShow)) * 100) : null;

  const sessionCounts = new Map<string, { count: number; capacity: number }>();
  for (const b of bookings) {
    if ((HOLDING_OR_ATTENDED_STATUSES as readonly string[]).includes(b.status)) {
      const entry = sessionCounts.get(b.sessionId) ?? { count: 0, capacity: b.session.capacity };
      entry.count += 1;
      sessionCounts.set(b.sessionId, entry);
    }
  }
  const utilizations = Array.from(sessionCounts.values()).map((s) => s.count / s.capacity);
  const avgCapacityUtilizationPercent =
    utilizations.length > 0
      ? round1((utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length) * 100)
      : null;

  const decided = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "REJECTED");
  const avgApprovalResponseMinutes =
    decided.length > 0
      ? round1(
          decided.reduce((sum, b) => sum + (b.updatedAt.getTime() - b.createdAt.getTime()), 0) /
            decided.length /
            60_000,
        )
      : null;

  const parentCounts = new Map<string, number>();
  for (const b of bookings) {
    parentCounts.set(b.parentId, (parentCounts.get(b.parentId) ?? 0) + 1);
  }
  const distinctParents = parentCounts.size;
  const repeatParents = Array.from(parentCounts.values()).filter((c) => c > 1).length;
  const repeatBookingRatePercent = distinctParents > 0 ? round1((repeatParents / distinctParents) * 100) : null;

  const activityBookingCounts = new Map<string, number>();
  for (const b of bookings) {
    activityBookingCounts.set(b.session.activityId, (activityBookingCounts.get(b.session.activityId) ?? 0) + 1);
  }
  const topActivities = activities
    .map((a) => ({ activityId: a.id, title: a.title, bookingsCount: activityBookingCounts.get(a.id) ?? 0 }))
    .sort((a, b) => b.bookingsCount - a.bookingsCount)
    .slice(0, 5);

  return {
    totalActivities: activities.length,
    bookingsByStatus,
    attendanceRatePercent,
    avgCapacityUtilizationPercent,
    avgApprovalResponseMinutes,
    repeatBookingRatePercent,
    topActivities,
  };
}

// --- Admin ---

export interface AdminAnalytics {
  users: { parents: number; providers: number; admins: number };
  newSignupsLast30Days: { parents: number; providers: number };
  pendingProvidersCount: number;
  avgProviderApprovalHours: number | null;
  bookingsByStatus: Record<string, number>;
  activeSubscriptions: number;
  flaggedActivitiesCount: number;
  featuredActivitiesCount: number;
  auditLogVolumeLast30Days: number;
  topCategories: { category: string; activityCount: number }[];
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    totalParents,
    totalProviders,
    totalAdmins,
    newParents,
    newProviders,
    pendingProviders,
    bookingsGrouped,
    activeSubscriptions,
    flaggedActivities,
    featuredActivities,
    auditLogCount,
    categoryGroups,
    approvalAudits,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "PARENT" } }),
    prisma.user.count({ where: { role: "PROVIDER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "PARENT", createdAt: { gte: since } } }),
    prisma.user.count({ where: { role: "PROVIDER", createdAt: { gte: since } } }),
    prisma.user.count({ where: { role: "PROVIDER", verificationStatus: "PENDING" } }),
    prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.activity.count({ where: { isFlagged: true } }),
    prisma.activity.count({ where: { isFeatured: true } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.activity.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { action: { in: ["PROVIDER_APPROVED", "PROVIDER_REJECTED"] } },
      select: { targetId: true, createdAt: true },
    }),
  ]);

  const bookingsByStatus: Record<string, number> = {};
  for (const g of bookingsGrouped) bookingsByStatus[g.status] = g._count._all;

  const topCategories = categoryGroups
    .map((g) => ({ category: g.category, activityCount: g._count._all }))
    .sort((a, b) => b.activityCount - a.activityCount)
    .slice(0, 5);

  let avgProviderApprovalHours: number | null = null;
  if (approvalAudits.length > 0) {
    const providerIds = approvalAudits.map((a) => a.targetId);
    const providers = await prisma.user.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, createdAt: true },
    });
    const providerCreatedAt = new Map(providers.map((p) => [p.id, p.createdAt]));
    const diffsMs = approvalAudits
      .map((a) => {
        const createdAt = providerCreatedAt.get(a.targetId);
        return createdAt ? a.createdAt.getTime() - createdAt.getTime() : null;
      })
      .filter((d): d is number => d !== null);
    if (diffsMs.length > 0) {
      avgProviderApprovalHours = round1(diffsMs.reduce((sum, d) => sum + d, 0) / diffsMs.length / 3_600_000);
    }
  }

  return {
    users: { parents: totalParents, providers: totalProviders, admins: totalAdmins },
    newSignupsLast30Days: { parents: newParents, providers: newProviders },
    pendingProvidersCount: pendingProviders,
    avgProviderApprovalHours,
    bookingsByStatus,
    activeSubscriptions,
    flaggedActivitiesCount: flaggedActivities,
    featuredActivitiesCount: featuredActivities,
    auditLogVolumeLast30Days: auditLogCount,
    topCategories,
  };
}
