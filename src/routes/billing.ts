import { Router } from "express";
import { env } from "../config/env";
import { param } from "../lib/requestParams";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { AppError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/requireAuth";
import { checkoutSessionSchema } from "../schemas/billing";
import { getCreditSummary } from "../services/creditBalance";

export const billingRouter = Router();

billingRouter.get("/plans", async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true, audience: "PARENT" },
      orderBy: { priceGbp: "asc" },
    });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

// Informational only — provider tiers aren't Stripe-billed yet (see AGENTS.md), so this just
// lists what's available for a provider to see on their dashboard.
billingRouter.get("/provider-plans", async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true, audience: "PROVIDER" },
      orderBy: { priceGbp: "asc" },
    });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

billingRouter.get("/credits", requireAuth, async (req, res, next) => {
  try {
    const summary = await getCreditSummary(req.user!.sub);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

billingRouter.post("/checkout-session", requireAuth, async (req, res, next) => {
  try {
    const parsed = checkoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid checkout request", 400);
    }

    const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
    if (!plan || !plan.isActive || plan.audience !== "PARENT" || !plan.stripePriceId) {
      throw new AppError("Plan not found", 404);
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      ui_mode: "embedded_page",
      return_url: `${env.CLIENT_URL}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { userId: user.id, planId: plan.id },
      subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    });

    res.status(201).json({ clientSecret: session.client_secret });
  } catch (err) {
    next(err);
  }
});

// Used by the frontend's post-checkout return page to confirm how the embedded session ended.
billingRouter.get("/checkout-session/:sessionId/status", requireAuth, async (req, res, next) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(param(req.params.sessionId));
    res.json({ status: session.status, paymentStatus: session.payment_status });
  } catch (err) {
    next(err);
  }
});
