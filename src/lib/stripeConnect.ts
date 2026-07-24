import { env } from "../config/env";
import { prisma } from "./prisma";
import { stripe } from "./stripe";

/**
 * Stripe Connect Express — the lightest-touch way to get a provider real bank payouts without
 * this platform ever handling KYC/identity verification itself (Stripe's own hosted flow does
 * that). An Express account is created lazily on first onboarding-link request; payoutsEnabled /
 * detailsSubmitted are never set directly by this app — they're synced from Stripe's own
 * `account.updated` webhook (see src/routes/webhooks.ts), since Stripe is the source of truth
 * for whether an account has actually cleared onboarding.
 */
export async function getOrCreateConnectAccountId(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeConnectAccountId) {
    return user.stripeConnectAccountId;
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "GB",
    email,
    business_type: "individual",
    capabilities: {
      transfers: { requested: true },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeConnectAccountId: account.id },
  });

  return account.id;
}

export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${env.CLIENT_URL}/provider/accounting?connect=refresh`,
    return_url: `${env.CLIENT_URL}/provider/accounting?connect=return`,
  });
  return link.url;
}

/**
 * Reads live status straight from Stripe rather than our own (possibly stale) mirrored columns —
 * used by the "status" endpoint so a provider sees the truth even if a webhook delivery is
 * delayed or was missed.
 */
export async function fetchConnectAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    detailsSubmitted: account.details_submitted ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
  };
}

/**
 * Handles the `account.updated` webhook — the source of truth for whether a provider's Connect
 * account has actually cleared onboarding, since that can change asynchronously (Stripe running
 * further verification) well after the provider closes the onboarding tab.
 */
export async function syncConnectAccountFromWebhook(account: {
  id: string;
  details_submitted?: boolean | null;
  payouts_enabled?: boolean | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { stripeConnectAccountId: account.id } });
  if (!user) {
    // Not one of ours (or the account was created directly in the Stripe dashboard) — ignore.
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      connectDetailsSubmitted: account.details_submitted ?? false,
      connectPayoutsEnabled: account.payouts_enabled ?? false,
    },
  });
}
