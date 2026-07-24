import { prisma } from "../lib/prisma";
import { getTaxYearRange } from "../lib/taxYear";

/**
 * A provider's income/expense summary for one UK tax year (6 Apr–5 Apr), on an accruals basis —
 * income is counted for the period a payout statement's bookings were delivered in (its
 * periodStart), not when Stripe actually transferred the money. This mirrors how a UK sole
 * trader normally reports turnover from a gig/marketplace platform: gross earnings (turnover) as
 * income, and the platform's own commission (+ VAT on it) as an allowable business expense,
 * alongside whatever other expenses the provider has logged themselves. Not tax advice — a
 * starting point for the provider's own Self Assessment or their accountant.
 */
export async function getProviderTaxYearSummary(providerId: string, taxYear: number) {
  const { start, end } = getTaxYearRange(taxYear);

  const [statementTotals, expenseTotals, expenseByCategory] = await Promise.all([
    prisma.payoutStatement.aggregate({
      where: { providerId, periodStart: { gte: start }, periodEnd: { lte: end } },
      _sum: { grossAmountGbp: true, commissionAmountGbp: true, commissionVatGbp: true, netAmountGbp: true },
      _count: true,
    }),
    prisma.providerExpense.aggregate({
      where: { providerId, incurredOn: { gte: start, lt: end } },
      _sum: { amountGbp: true },
    }),
    prisma.providerExpense.groupBy({
      by: ["category"],
      where: { providerId, incurredOn: { gte: start, lt: end } },
      _sum: { amountGbp: true },
    }),
  ]);

  const grossIncomeGbp = statementTotals._sum.grossAmountGbp ?? 0;
  const platformFeesGbp = (statementTotals._sum.commissionAmountGbp ?? 0) + (statementTotals._sum.commissionVatGbp ?? 0);
  const otherExpensesGbp = expenseTotals._sum.amountGbp ?? 0;
  const totalExpensesGbp = platformFeesGbp + otherExpensesGbp;
  const netProfitGbp = grossIncomeGbp - totalExpensesGbp;

  return {
    taxYear,
    periodStart: start,
    periodEnd: end,
    statementCount: statementTotals._count,
    grossIncomeGbp,
    platformFeesGbp,
    otherExpensesGbp,
    totalExpensesGbp,
    netProfitGbp,
    netPaidOutGbp: statementTotals._sum.netAmountGbp ?? 0,
    expensesByCategory: expenseByCategory.map((row) => ({
      category: row.category,
      amountGbp: row._sum.amountGbp ?? 0,
    })),
  };
}
