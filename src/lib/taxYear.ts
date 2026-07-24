// UK tax year runs 6 April to 5 April, not the calendar year — HMRC's Self Assessment and
// income-record-keeping requirements are both scoped to it. `taxYear` here means the year the
// period *starts* in (e.g. taxYear 2025 -> 6 Apr 2025 to 5 Apr 2026, "the 2025/26 tax year").
export function getTaxYearRange(taxYear: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(taxYear, 3, 6, 0, 0, 0));
  const end = new Date(Date.UTC(taxYear + 1, 3, 6, 0, 0, 0));
  return { start, end };
}

export function getCurrentTaxYear(now: Date = new Date()): number {
  const aprilSixthThisCalendarYear = new Date(Date.UTC(now.getUTCFullYear(), 3, 6, 0, 0, 0));
  return now >= aprilSixthThisCalendarYear ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
