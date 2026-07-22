import { SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    default:
      // incomplete, incomplete_expired, trialing, paused
      return "INCOMPLETE";
  }
}

// `current_period_end` moved off the top-level Subscription object onto each SubscriptionItem
// in newer Stripe API versions — this SDK reflects that, so we read it from the first item.
function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  return item ? new Date(item.current_period_end * 1000) : null;
}

/**
 * Handles `checkout.session.completed` for a subscription-mode session: links the Stripe
 * subscription to our Subscription row and grants the plan's initial monthly credits.
 * The initial invoice's `invoice.paid` event is intentionally NOT used to grant credits
 * (billing_reason "subscription_create") to avoid a double-grant — see handleInvoicePaid.
 */
export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!userId || !planId || !stripeSubscriptionId) {
    console.error("checkout.session.completed missing expected metadata", {
      sessionId: session.id,
      userId,
      planId,
      stripeSubscriptionId,
    });
    return;
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.monthlyCredits === null) {
    console.error("checkout.session.completed referenced an unknown or non-credit plan", { planId });
    return;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId,
      stripeSubscriptionId,
      status: mapStripeStatus(stripeSubscription.status),
      currentPeriodEnd: periodEndOf(stripeSubscription),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
    update: {
      planId,
      stripeSubscriptionId,
      status: mapStripeStatus(stripeSubscription.status),
      currentPeriodEnd: periodEndOf(stripeSubscription),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      amount: plan.monthlyCredits,
      reason: "SUBSCRIPTION_INITIAL",
    },
  });
}

/** Grants a fresh month of credits on each billing-cycle renewal (not the initial invoice). */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.billing_reason !== "subscription_cycle") {
    return;
  }

  const stripeSubscriptionId = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof stripeSubscriptionId === "string" ? stripeSubscriptionId : stripeSubscriptionId?.id;
  if (!subscriptionId) {
    return;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { plan: true },
  });
  if (!subscription || subscription.plan.monthlyCredits === null) {
    console.error("invoice.paid for an unknown or non-credit subscription", { subscriptionId });
    return;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: mapStripeStatus(stripeSubscription.status),
      currentPeriodEnd: periodEndOf(stripeSubscription),
    },
  });

  await prisma.creditTransaction.create({
    data: {
      userId: subscription.userId,
      subscriptionId: subscription.id,
      amount: subscription.plan.monthlyCredits,
      reason: "SUBSCRIPTION_RENEWAL",
    },
  });
}

/** Keeps our status/period/cancellation flag in sync for updates and cancellations. */
export async function syncSubscriptionFromStripe(stripeSubscription: Stripe.Subscription): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });
  if (!existing) {
    return;
  }

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status: mapStripeStatus(stripeSubscription.status),
      currentPeriodEnd: periodEndOf(stripeSubscription),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    },
  });
}
