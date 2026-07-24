import { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { syncConnectAccountFromWebhook } from "../lib/stripeConnect";
import { AppError } from "../middleware/errorHandler";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  syncSubscriptionFromStripe,
} from "../services/subscriptionSync";

export const webhooksRouter = Router();

// Mounted with express.raw() in app.ts — Stripe's signature verification needs the exact raw
// request body bytes, which express.json() would have already parsed/mutated by this point.
webhooksRouter.post("/stripe", async (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return next(new AppError("Missing Stripe-Signature header", 400));
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return next(new AppError(`Webhook signature verification failed: ${(err as Error).message}`, 400));
  }

  try {
    const alreadyProcessed = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
    if (alreadyProcessed) {
      res.json({ received: true, duplicate: true });
      return;
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscriptionFromStripe(event.data.object);
        break;
      case "account.updated":
        await syncConnectAccountFromWebhook(event.data.object as Stripe.Account);
        break;
      default:
        // Unhandled event types are expected — we only act on what this platform needs.
        break;
    }

    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});
