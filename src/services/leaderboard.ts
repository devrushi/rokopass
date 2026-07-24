import { prisma } from "../lib/prisma";

export interface LeaderboardEntry {
  displayName: string;
  attendedCount: number;
  photoUrl: string | null;
}

/**
 * Opt-in only (Child.isOnLeaderboard) and deliberately minimal: first name + last-initial only
 * (plus an optional parent-uploaded photo — never the full name, id, or parent), ranked by
 * attendance (rewards showing up, not spending more credits). See AGENTS.md for the
 * safeguarding reasoning — public leaderboards of children by full name are a real risk, not
 * just a UX preference.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const children = await prisma.child.findMany({
    where: { isOnLeaderboard: true },
    select: {
      firstName: true,
      lastName: true,
      photoUrl: true,
      _count: { select: { bookings: { where: { status: "ATTENDED" } } } },
    },
  });

  return children
    .map((child) => ({
      displayName: `${child.firstName} ${child.lastName.charAt(0).toUpperCase()}.`,
      attendedCount: child._count.bookings,
      photoUrl: child.photoUrl,
    }))
    .filter((entry) => entry.attendedCount > 0)
    .sort((a, b) => b.attendedCount - a.attendedCount)
    .slice(0, 20);
}
