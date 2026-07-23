import { prisma } from "../lib/prisma";

export interface LeaderboardEntry {
  displayName: string;
  attendedCount: number;
}

/**
 * Opt-in only (Child.isOnLeaderboard) and deliberately minimal: first name + last-initial only,
 * ranked by attendance (rewards showing up, not spending more credits), never exposes the
 * child's id, parent, or any other identifying detail. See AGENTS.md for the safeguarding
 * reasoning — public leaderboards of children by full name are a real risk, not just a UX
 * preference.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const children = await prisma.child.findMany({
    where: { isOnLeaderboard: true },
    select: {
      firstName: true,
      lastName: true,
      _count: { select: { bookings: { where: { status: "ATTENDED" } } } },
    },
  });

  return children
    .map((child) => ({
      displayName: `${child.firstName} ${child.lastName.charAt(0).toUpperCase()}.`,
      attendedCount: child._count.bookings,
    }))
    .filter((entry) => entry.attendedCount > 0)
    .sort((a, b) => b.attendedCount - a.attendedCount)
    .slice(0, 20);
}
