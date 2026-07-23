import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

/**
 * The community fund has no balance column of its own — it's computed on read from the credit
 * ledger, same "ledger over mutable counter" reasoning as a user's own credit balance. Donation
 * amounts are stored negative on the donor's row (credits leaving circulation into the pool);
 * grant amounts are stored positive on the recipient's row (credits leaving the pool into
 * circulation). Available pool balance = total donated - total granted.
 */
export async function getCharityPoolStats() {
  const [donated, granted, recentDonations, recentGrants] = await Promise.all([
    prisma.creditTransaction.aggregate({ where: { reason: "CHARITY_DONATION" }, _sum: { amount: true } }),
    prisma.creditTransaction.aggregate({ where: { reason: "CHARITY_GRANT" }, _sum: { amount: true } }),
    prisma.creditTransaction.findMany({
      where: { reason: "CHARITY_DONATION" },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.creditTransaction.findMany({
      where: { reason: "CHARITY_GRANT" },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const totalDonated = Math.abs(donated._sum.amount ?? 0);
  const totalGranted = granted._sum.amount ?? 0;

  return {
    poolBalance: totalDonated - totalGranted,
    totalDonated,
    totalGranted,
    recentDonations: recentDonations.map((d) => ({
      id: d.id,
      amount: Math.abs(d.amount),
      createdAt: d.createdAt,
      donorFirstName: d.user.firstName,
      donorLastName: d.user.lastName,
    })),
    recentGrants: recentGrants.map((g) => ({
      id: g.id,
      amount: g.amount,
      createdAt: g.createdAt,
      recipientFirstName: g.user.firstName,
      recipientLastName: g.user.lastName,
    })),
  };
}

export async function donateCredits(parentId: string, amount: number): Promise<{ balance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError("Donation amount must be a positive whole number of credits", 400);
  }

  return prisma.$transaction(async (tx) => {
    const balanceResult = await tx.creditTransaction.aggregate({
      where: { userId: parentId },
      _sum: { amount: true },
    });
    const currentBalance = balanceResult._sum.amount ?? 0;
    if (currentBalance < amount) {
      throw new AppError("You don't have enough credits to donate that many", 400);
    }

    await tx.creditTransaction.create({
      data: { userId: parentId, amount: -amount, reason: "CHARITY_DONATION" },
    });

    return { balance: currentBalance - amount };
  });
}

export async function grantCharityCredits(params: {
  adminId: string;
  recipientId: string;
  amount: number;
}): Promise<{ poolBalance: number }> {
  const { adminId, recipientId, amount } = params;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError("Grant amount must be a positive whole number of credits", 400);
  }

  return prisma.$transaction(async (tx) => {
    const [donated, granted] = await Promise.all([
      tx.creditTransaction.aggregate({ where: { reason: "CHARITY_DONATION" }, _sum: { amount: true } }),
      tx.creditTransaction.aggregate({ where: { reason: "CHARITY_GRANT" }, _sum: { amount: true } }),
    ]);
    const poolBalance = Math.abs(donated._sum.amount ?? 0) - (granted._sum.amount ?? 0);
    if (poolBalance < amount) {
      throw new AppError("The community fund doesn't have enough credits for that grant", 400);
    }

    await tx.creditTransaction.create({
      data: { userId: recipientId, amount, reason: "CHARITY_GRANT" },
    });
    await tx.auditLog.create({
      data: {
        adminId,
        action: "CHARITY_GRANT_ISSUED",
        targetType: "User",
        targetId: recipientId,
        metadata: { amount },
      },
    });

    return { poolBalance: poolBalance - amount };
  });
}
