import { prisma } from "../lib/prisma";

/**
 * A user's credit balance is derived from the CreditTransaction ledger, not stored as a mutable
 * counter — summing on read avoids lost updates under concurrent writes (e.g. a booking
 * deduction racing a subscription renewal grant) and keeps every grant/deduction auditable.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const result = await prisma.creditTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export interface CreditSummary {
  balance: number;
  plan: { id: string; name: string; monthlyCredits: number } | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
}

export async function getCreditSummary(userId: string): Promise<CreditSummary> {
  const [balance, subscription] = await Promise.all([
    getCreditBalance(userId),
    prisma.subscription.findUnique({
      where: { userId },
      include: { plan: { select: { id: true, name: true, monthlyCredits: true } } },
    }),
  ]);

  return {
    balance,
    plan: subscription?.plan ?? null,
    subscriptionStatus: subscription?.status ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  };
}
