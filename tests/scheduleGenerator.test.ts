import { describe, expect, it } from "vitest";
import { generateOccurrences } from "../src/services/scheduleGenerator";

// Wednesday 2026-01-07
const START_DATE = new Date(2026, 0, 7);

describe("generateOccurrences", () => {
  it("generates one occurrence per week for a WEEKLY pattern", () => {
    const windowStart = new Date(2026, 0, 1);
    const windowEnd = new Date(2026, 1, 1); // one month window

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3, // Wednesday
        startTime: "16:30",
        durationMinutes: 45,
        frequency: "WEEKLY",
        startDate: START_DATE,
        endDate: null,
      },
      windowStart,
      windowEnd,
    );

    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    for (const occ of occurrences) {
      expect(occ.startsAt.getDay()).toBe(3);
      expect(occ.startsAt.getHours()).toBe(16);
      expect(occ.startsAt.getMinutes()).toBe(30);
      expect(occ.endsAt.getTime() - occ.startsAt.getTime()).toBe(45 * 60_000);
    }

    const daysBetween =
      (occurrences[1].startsAt.getTime() - occurrences[0].startsAt.getTime()) / (24 * 60 * 60_000);
    expect(daysBetween).toBe(7);
  });

  it("generates one occurrence every two weeks for a BIWEEKLY pattern, anchored to startDate", () => {
    const windowStart = new Date(2026, 0, 1);
    const windowEnd = new Date(2026, 2, 1);

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3,
        startTime: "09:00",
        durationMinutes: 60,
        frequency: "BIWEEKLY",
        startDate: START_DATE,
        endDate: null,
      },
      windowStart,
      windowEnd,
    );

    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    const daysBetween =
      (occurrences[1].startsAt.getTime() - occurrences[0].startsAt.getTime()) / (24 * 60 * 60_000);
    expect(daysBetween).toBe(14);
    // Every occurrence should fall on a multiple of 14 days from the anchor.
    const anchorMidnight = new Date(START_DATE).setHours(0, 0, 0, 0);
    for (const occ of occurrences) {
      const occMidnight = new Date(occ.startsAt).setHours(0, 0, 0, 0);
      const diffDays = Math.round((occMidnight - anchorMidnight) / (24 * 60 * 60_000));
      expect(diffDays % 14).toBe(0);
    }
  });

  it("stops generating after endDate", () => {
    const windowStart = new Date(2026, 0, 1);
    const windowEnd = new Date(2026, 3, 1);
    const endDate = new Date(2026, 0, 21);

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3,
        startTime: "10:00",
        durationMinutes: 30,
        frequency: "WEEKLY",
        startDate: START_DATE,
        endDate,
      },
      windowStart,
      windowEnd,
    );

    const endDateMidnight = new Date(endDate).setHours(0, 0, 0, 0);
    for (const occ of occurrences) {
      const occMidnight = new Date(occ.startsAt).setHours(0, 0, 0, 0);
      expect(occMidnight).toBeLessThanOrEqual(endDateMidnight);
    }
    expect(occurrences.length).toBe(3); // Jan 7, 14, 21 (endDate is inclusive of its calendar day)
  });

  it("doesn't generate occurrences before the window start", () => {
    const windowStart = new Date(2026, 0, 15);
    const windowEnd = new Date(2026, 1, 1);

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3,
        startTime: "10:00",
        durationMinutes: 30,
        frequency: "WEEKLY",
        startDate: START_DATE,
        endDate: null,
      },
      windowStart,
      windowEnd,
    );

    for (const occ of occurrences) {
      expect(occ.startsAt.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
    }
  });

  it("includes today's occurrence when its start time is still ahead of windowStart", () => {
    // Regression test: windowStart used to be compared against a bare midnight cursor, which
    // meant "today" was always excluded even if the scheduled time was still hours away.
    const now = new Date(2026, 0, 7, 9, 0, 0); // Wednesday 09:00, same day as START_DATE
    const windowEnd = new Date(2026, 1, 1);

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3,
        startTime: "16:00", // later today
        durationMinutes: 60,
        frequency: "WEEKLY",
        startDate: START_DATE,
        endDate: null,
      },
      now,
      windowEnd,
    );

    const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
    const firstOccurrenceMidnight = new Date(occurrences[0].startsAt).setHours(0, 0, 0, 0);
    expect(firstOccurrenceMidnight).toBe(todayMidnight);
  });

  it("excludes today's occurrence when its start time has already passed", () => {
    const now = new Date(2026, 0, 7, 20, 0, 0); // Wednesday 20:00, after the 16:00 class
    const windowEnd = new Date(2026, 1, 1);

    const occurrences = generateOccurrences(
      {
        dayOfWeek: 3,
        startTime: "16:00",
        durationMinutes: 60,
        frequency: "WEEKLY",
        startDate: START_DATE,
        endDate: null,
      },
      now,
      windowEnd,
    );

    const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
    const firstOccurrenceMidnight = new Date(occurrences[0].startsAt).setHours(0, 0, 0, 0);
    expect(firstOccurrenceMidnight).toBeGreaterThan(todayMidnight);
  });
});
