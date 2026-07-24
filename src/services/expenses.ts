import type { ExpenseCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getTaxYearRange } from "../lib/taxYear";
import { AppError } from "../middleware/errorHandler";

export async function listExpenses(
  providerId: string,
  params: { taxYear?: number; category?: ExpenseCategory } = {},
) {
  const { taxYear, category } = params;
  const range = taxYear !== undefined ? getTaxYearRange(taxYear) : undefined;

  return prisma.providerExpense.findMany({
    where: {
      providerId,
      ...(category ? { category } : {}),
      ...(range ? { incurredOn: { gte: range.start, lt: range.end } } : {}),
    },
    orderBy: { incurredOn: "desc" },
  });
}

export async function loadOwnedExpense(expenseId: string, providerId: string, role: string) {
  const expense = await prisma.providerExpense.findUnique({ where: { id: expenseId } });
  if (!expense) {
    throw new AppError("Expense not found", 404);
  }
  if (role !== "ADMIN" && expense.providerId !== providerId) {
    throw new AppError("You do not have permission to modify this expense", 403);
  }
  return expense;
}
