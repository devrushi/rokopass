import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { getTaxYearRange } from "../lib/taxYear";
import { AppError } from "../middleware/errorHandler";
import { getPlatformSettings } from "./platformSettings";
import { formatBusinessAddress } from "./providerBusiness";

// Credits are only irrecoverably "earned" by a provider once the outcome of a booking is final
// and no refund follows it. ATTENDED is the obvious case; NO_SHOW is included too — the provider
// held the capacity and the credit was not refunded to the parent, so the same revenue has been
// realized on the provider's side either way. PENDING_APPROVAL/CONFIRMED haven't happened yet;
// REJECTED is always refunded (see src/services/booking.ts) and never earns anything. CANCELLED
// is the one status that can go either way: a parent cancelling inside the free-cancellation
// window gets refunded (never earns), but a late cancellation past that window forfeits the
// credit exactly like a NO_SHOW does — so it's included here too, determined by whether a
// BOOKING_REFUND transaction actually exists for that booking (see the query below) rather than
// by status alone.
const EARNED_STATUSES = ["ATTENDED", "NO_SHOW"] as const;

async function nextStatementNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.payoutStatement.count();
  const year = new Date().getUTCFullYear();
  return `STMT-${year}-${String(count + 1).padStart(6, "0")}`;
}

interface GeneratePayoutParams {
  providerId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Builds one payout statement for a provider covering every earned booking (ATTENDED, NO_SHOW,
 * or a late/forfeited CANCELLED — see EARNED_STATUSES above) in the period that hasn't already
 * been included in an earlier statement (PayoutStatementLine.bookingId is unique, so this is
 * enforced at the DB level too, not just by this query). All money and identity fields on the
 * resulting statement are snapshotted now — see the schema comment on PayoutStatement for why.
 */
export async function generatePayoutStatement({ providerId, periodStart, periodEnd }: GeneratePayoutParams) {
  const provider = await prisma.user.findUnique({ where: { id: providerId } });
  if (!provider || (provider.role !== "PROVIDER" && provider.role !== "SCHOOL")) {
    throw new AppError("Provider not found", 404);
  }

  const businessProfile = await prisma.providerBusinessProfile.findUnique({ where: { providerId } });
  if (!businessProfile) {
    throw new AppError(
      "This provider hasn't completed their business profile yet — a payout statement can't be generated without it",
      400,
    );
  }

  const settings = await getPlatformSettings();

  const eligibleBookings = await prisma.booking.findMany({
    where: {
      payoutStatementLine: null,
      session: {
        activity: { providerId },
        startsAt: { gte: periodStart, lt: periodEnd },
      },
      OR: [
        { status: { in: [...EARNED_STATUSES] } },
        { status: "CANCELLED", creditTransactions: { none: { reason: "BOOKING_REFUND" } } },
      ],
    },
    select: {
      id: true,
      creditsSpent: true,
      child: { select: { firstName: true, lastName: true } },
      session: { select: { startsAt: true, activity: { select: { title: true } } } },
    },
    orderBy: { session: { startsAt: "asc" } },
  });

  if (eligibleBookings.length === 0) {
    throw new AppError("No eligible bookings for this period — nothing to pay out", 400);
  }

  const creditsRedeemed = eligibleBookings.reduce((sum, b) => sum + b.creditsSpent, 0);
  const grossAmountGbp = creditsRedeemed * settings.creditValueGbp;
  const commissionAmountGbp = Math.round((grossAmountGbp * settings.commissionRatePercent) / 100);
  const commissionVatGbp = settings.platformVatRegistered
    ? Math.round((commissionAmountGbp * settings.platformVatRatePercent) / 100)
    : 0;
  const netAmountGbp = grossAmountGbp - commissionAmountGbp - commissionVatGbp;

  return prisma.$transaction(async (tx) => {
    const statementNumber = await nextStatementNumber(tx);

    const statement = await tx.payoutStatement.create({
      data: {
        providerId,
        statementNumber,
        periodStart,
        periodEnd,
        creditsRedeemed,
        creditValueGbpSnapshot: settings.creditValueGbp,
        grossAmountGbp,
        commissionRatePercentSnapshot: settings.commissionRatePercent,
        commissionAmountGbp,
        commissionVatGbp,
        netAmountGbp,
        providerLegalName: businessProfile.legalBusinessName,
        providerAddress: formatBusinessAddress(businessProfile),
        providerVatNumber: businessProfile.isVatRegistered ? businessProfile.vatNumber : null,
        platformLegalName: settings.platformLegalName,
        platformAddress: settings.platformAddress,
        platformVatNumber: settings.platformVatRegistered ? settings.platformVatNumber : null,
        lines: {
          create: eligibleBookings.map((booking) => ({
            bookingId: booking.id,
            activityTitle: booking.session.activity.title,
            sessionStartsAt: booking.session.startsAt,
            childInitials: `${booking.child.firstName} ${booking.child.lastName.charAt(0).toUpperCase()}.`,
            creditsSpent: booking.creditsSpent,
            amountGbp: booking.creditsSpent * settings.creditValueGbp,
          })),
        },
      },
      include: { lines: true },
    });

    return statement;
  });
}

/**
 * Executes the actual bank transfer for a PENDING statement via Stripe Connect. Money for
 * transfers comes from the platform's own Stripe balance (parents pay via subscriptions, an
 * unrelated flow) — this is Stripe's "separate charges and transfers" Connect pattern, not a
 * destination charge, since there's no single originating charge per booking to attach a
 * transfer to.
 */
export async function executePayoutStatement(statementId: string) {
  const statement = await prisma.payoutStatement.findUnique({ where: { id: statementId } });
  if (!statement) {
    throw new AppError("Payout statement not found", 404);
  }
  if (statement.status !== "PENDING") {
    throw new AppError(`Only PENDING statements can be executed (this one is ${statement.status})`, 400);
  }

  const provider = await prisma.user.findUniqueOrThrow({ where: { id: statement.providerId } });
  if (!provider.stripeConnectAccountId || !provider.connectPayoutsEnabled) {
    throw new AppError(
      "This provider hasn't finished Stripe Connect onboarding yet — payouts aren't enabled on their account",
      400,
    );
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: statement.netAmountGbp,
      currency: "gbp",
      destination: provider.stripeConnectAccountId,
      transfer_group: statement.id,
      description: `RokidsPass payout statement ${statement.statementNumber}`,
      metadata: { payoutStatementId: statement.id, statementNumber: statement.statementNumber },
    });

    return prisma.payoutStatement.update({
      where: { id: statement.id },
      data: { status: "PAID", stripeTransferId: transfer.id, paidAt: new Date(), failureReason: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed";
    return prisma.payoutStatement.update({
      where: { id: statement.id },
      data: { status: "FAILED", failureReason: message },
    });
  }
}

export async function listProviderStatements(providerId: string, params: { taxYear?: number } = {}) {
  const { taxYear } = params;
  if (taxYear === undefined) {
    return prisma.payoutStatement.findMany({ where: { providerId }, orderBy: { periodStart: "desc" } });
  }

  const { start, end } = getTaxYearRange(taxYear);
  return prisma.payoutStatement.findMany({
    where: { providerId, periodStart: { gte: start }, periodEnd: { lte: end } },
    orderBy: { periodStart: "desc" },
  });
}

export async function loadOwnedStatement(statementId: string, providerId: string, role: string) {
  const statement = await prisma.payoutStatement.findUnique({
    where: { id: statementId },
    include: { lines: { orderBy: { sessionStartsAt: "asc" } } },
  });
  if (!statement) {
    throw new AppError("Payout statement not found", 404);
  }
  if (role !== "ADMIN" && statement.providerId !== providerId) {
    throw new AppError("You do not have permission to view this statement", 403);
  }
  return statement;
}
