import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { stripe } from "../src/lib/stripe";

const prisma = new PrismaClient();

// Dev-only bootstrap credential — there is no public way to create an ADMIN account (by
// design, registration only allows PARENT/PROVIDER). Change this password before using these
// credentials anywhere but a local/throwaway environment.
const ADMIN_EMAIL = "admin@rokidspass.local";
const ADMIN_PASSWORD = "AdminPassword123";

// Dev-only demo accounts backing the "Quick login" buttons on the login page (client only
// renders those buttons in dev builds — see Login.tsx). Same throwaway-credential caveat as
// the admin account above.
const DEMO_PARENT_EMAIL = "demo.parent@rokidspass.local";
const DEMO_PARENT_PASSWORD = "DemoParent123";
const DEMO_PROVIDER_EMAIL = "demo.provider@rokidspass.local";
const DEMO_PROVIDER_PASSWORD = "DemoProvider123";

const AGE_GROUPS = [
  { label: "Toddlers (1-2)", minAge: 1, maxAge: 2 },
  { label: "Preschool (3-4)", minAge: 3, maxAge: 4 },
  { label: "Junior (5-7)", minAge: 5, maxAge: 7 },
  { label: "Middle (8-11)", minAge: 8, maxAge: 11 },
  { label: "Teen (12-15)", minAge: 12, maxAge: 15 },
];

interface PlanSeed {
  name: string;
  description: string;
  monthlyCredits: number;
  priceGbp: number;
  lookupKey: string;
}

const PLANS: PlanSeed[] = [
  {
    name: "Starter",
    description: "4 credits a month — perfect for one weekly class.",
    monthlyCredits: 4,
    priceGbp: 1999,
    lookupKey: "rokidspass_starter_monthly",
  },
  {
    name: "Family",
    description: "8 credits a month — mix and match across activities.",
    monthlyCredits: 8,
    priceGbp: 3499,
    lookupKey: "rokidspass_family_monthly",
  },
  {
    name: "Unlimited",
    description: "16 credits a month for families who never miss a class.",
    monthlyCredits: 16,
    priceGbp: 5999,
    lookupKey: "rokidspass_unlimited_monthly",
  },
];

async function seedAgeGroups() {
  for (const group of AGE_GROUPS) {
    await prisma.ageGroup.upsert({
      where: { label: group.label },
      update: {},
      create: group,
    });
  }
}

/**
 * Creates (or reuses) a Stripe Product + recurring Price per plan, keyed by a stable
 * `lookup_key` so re-running the seed never creates duplicates, then upserts our own Plan row
 * pointing at the resulting Stripe Price ID.
 *
 * In test/CI, this skips the real Stripe API calls (no network dependency, no Stripe secret
 * needed as a CI credential) and fabricates a deterministic fake price ID instead — anything
 * that needs to exercise real Stripe behavior does so via mocks/unit tests or manual
 * verification with the Stripe CLI, not by hitting the live API during `prisma db seed`.
 */
async function seedPlans() {
  const useLiveStripe = process.env.NODE_ENV !== "test";

  for (const plan of PLANS) {
    let stripePriceId: string;

    if (useLiveStripe) {
      const existingPrices = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
      let price = existingPrices.data[0];

      if (!price) {
        const product = await stripe.products.create({ name: `RokidsPass ${plan.name}` });
        price = await stripe.prices.create({
          product: product.id,
          currency: "gbp",
          unit_amount: plan.priceGbp,
          recurring: { interval: "month" },
          lookup_key: plan.lookupKey,
        });
      }
      stripePriceId = price.id;
    } else {
      stripePriceId = `price_test_${plan.lookupKey}`;
    }

    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        description: plan.description,
        monthlyCredits: plan.monthlyCredits,
        priceGbp: plan.priceGbp,
        stripePriceId,
      },
      create: {
        name: plan.name,
        description: plan.description,
        monthlyCredits: plan.monthlyCredits,
        priceGbp: plan.priceGbp,
        stripePriceId,
      },
    });
  }
}

async function seedAdmin() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
    },
  });
  console.log(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (dev only — do not use in production)`);
}

async function seedDemoAccounts() {
  const parentPasswordHash = await hashPassword(DEMO_PARENT_PASSWORD);
  await prisma.user.upsert({
    where: { email: DEMO_PARENT_EMAIL },
    update: {},
    create: {
      email: DEMO_PARENT_EMAIL,
      passwordHash: parentPasswordHash,
      firstName: "Demo",
      lastName: "Parent",
      role: "PARENT",
    },
  });

  const providerPasswordHash = await hashPassword(DEMO_PROVIDER_PASSWORD);
  await prisma.user.upsert({
    where: { email: DEMO_PROVIDER_EMAIL },
    update: {},
    create: {
      email: DEMO_PROVIDER_EMAIL,
      passwordHash: providerPasswordHash,
      firstName: "Demo",
      lastName: "Provider",
      role: "PROVIDER",
      // Pre-approved so the demo login can exercise the full provider flow (visible to parents
      // browsing activities) without an admin having to approve it first.
      verificationStatus: "APPROVED",
    },
  });

  console.log(`Seeded demo parent: ${DEMO_PARENT_EMAIL} / ${DEMO_PARENT_PASSWORD} (dev only)`);
  console.log(`Seeded demo provider: ${DEMO_PROVIDER_EMAIL} / ${DEMO_PROVIDER_PASSWORD} (dev only)`);
}

async function main() {
  // Order matters: seedPlans() needs live Stripe credentials and is the one seed step that can
  // fail in an environment without real keys configured — run it last so a Stripe failure
  // doesn't prevent the (Stripe-independent) age groups and demo/admin users from being seeded.
  await seedAgeGroups();
  await seedAdmin();
  await seedDemoAccounts();
  await seedPlans();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
