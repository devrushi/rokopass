import { RecurrenceFrequency } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface SchedulePattern {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  frequency: RecurrenceFrequency;
  startDate: Date;
  endDate: Date | null;
}

export interface SessionOccurrence {
  startsAt: Date;
  endsAt: Date;
}

// How far ahead concrete sessions get materialized from a recurring pattern. Providers/admins
// should re-run the generator periodically (a scheduled job, not built yet) to keep this window
// rolling forward — see AGENTS.md.
export const ROLLING_WINDOW_DAYS = 56;

export function generateOccurrences(
  pattern: SchedulePattern,
  windowStart: Date,
  windowEnd: Date,
): SessionOccurrence[] {
  const [hours, minutes] = pattern.startTime.split(":").map(Number);
  const stepDays = pattern.frequency === "BIWEEKLY" ? 14 : 7;

  // Loop bound at day granularity — generous on purpose, precise filtering happens below against
  // the actual startsAt instant (so "today" isn't wrongly excluded just because midnight-today
  // is earlier than the current moment; what matters is whether the class's start time has
  // already passed).
  const loopEnd = pattern.endDate && pattern.endDate < windowEnd ? pattern.endDate : windowEnd;

  // Anchor the cadence to the pattern's own startDate so BIWEEKLY stays aligned to the original
  // pattern rather than resetting whenever the generation window happens to start.
  const cursor = new Date(pattern.startDate);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getDay() !== pattern.dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1);
  }

  const occurrences: SessionOccurrence[] = [];
  while (cursor <= loopEnd) {
    const startsAt = new Date(cursor);
    startsAt.setHours(hours, minutes, 0, 0);
    const endsAt = new Date(startsAt.getTime() + pattern.durationMinutes * 60_000);

    if (startsAt >= windowStart && startsAt <= windowEnd) {
      occurrences.push({ startsAt, endsAt });
    }
    cursor.setDate(cursor.getDate() + stepDays);
  }

  return occurrences;
}

/**
 * Materializes ClassSession rows for a RecurringSchedule across the rolling window.
 * Existing sessions (including ones a provider has manually edited or cancelled) are left
 * untouched — this only fills in occurrences that don't exist yet.
 */
export async function syncSessionsForSchedule(scheduleId: string): Promise<void> {
  const schedule = await prisma.recurringSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: { activity: { select: { capacity: true } } },
  });

  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + ROLLING_WINDOW_DAYS * 24 * 60 * 60_000);
  const occurrences = generateOccurrences(schedule, windowStart, windowEnd);

  for (const occurrence of occurrences) {
    await prisma.classSession.upsert({
      where: {
        recurringScheduleId_startsAt: {
          recurringScheduleId: scheduleId,
          startsAt: occurrence.startsAt,
        },
      },
      update: {},
      create: {
        activityId: schedule.activityId,
        recurringScheduleId: scheduleId,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        capacity: schedule.activity.capacity,
      },
    });
  }
}
