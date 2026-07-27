/**
 * Pitch-day demo data — a richer, more realistic dataset layered on top of prisma/seed.ts's
 * minimal baseline (age groups, admin, quick-login accounts, plans). Run with:
 *
 *   npx tsx prisma/seed-demo.ts
 *
 * Safe to re-run: every user/activity/school is upserted by a stable unique key (email or
 * title), so running it twice updates rather than duplicates. Bookings/credit transactions are
 * the exception — they're cleared and rebuilt each run (see wipeTransactionalDemoData) so the
 * story (who attended what, who's pending, who's on the leaderboard) stays consistent rather
 * than accumulating duplicate history across runs.
 *
 * All seeded accounts share one password: see DEMO_PASSWORD below. This is dummy data for a
 * live walkthrough, not anything resembling production credentials.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { generateActivityPhoto, generateKidPhoto, generateStaffAvatar } from "./demo-assets";

const DEMO_PASSWORD = "PitchDemo123";
const DAY_MS = 24 * 60 * 60_000;

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function getAgeGroupId(label: string): Promise<string> {
  const group = await prisma.ageGroup.findUniqueOrThrow({ where: { label } });
  return group.id;
}

async function getPlanId(name: string): Promise<string> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { name } });
  return plan.id;
}

// --- Providers ---

interface ProviderSeed {
  email: string;
  firstName: string;
  lastName: string;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  whatsappNumber?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  dbsCertificateNumber?: string;
  dbsExpiresInDays?: number; // negative = already expired
}

const PROVIDERS: ProviderSeed[] = [
  {
    email: "hello@leicesterswimacademy.example.com",
    firstName: "Rachel",
    lastName: "Ferris",
    verificationStatus: "APPROVED",
    whatsappNumber: "+447700900101",
    instagramUrl: "https://instagram.com/leicesterswimacademy",
    dbsCertificateNumber: "001987654321",
    dbsExpiresInDays: 320,
  },
  {
    email: "coach@kickstartfootball.example.com",
    firstName: "Marcus",
    lastName: "Webb",
    verificationStatus: "APPROVED",
    whatsappNumber: "+447700900102",
    dbsCertificateNumber: "001987654322",
    dbsExpiresInDays: 210,
  },
  {
    email: "studio@twinkletoesdance.example.com",
    firstName: "Chloe",
    lastName: "Bennett",
    verificationStatus: "APPROVED",
    instagramUrl: "https://instagram.com/twinkletoesdance",
    facebookUrl: "https://facebook.com/twinkletoesdance",
    dbsCertificateNumber: "001987654323",
    dbsExpiresInDays: 400,
  },
  {
    email: "studio@littlepicassos.example.com",
    firstName: "Imogen",
    lastName: "Hart",
    verificationStatus: "APPROVED",
    // Deliberately no DBS on file — a realistic gap even among approved providers, worth
    // surfacing in the demo (admin/school views both flag this).
  },
  {
    email: "sensei@dragonwarriors.example.com",
    firstName: "Kenji",
    lastName: "Okafor",
    verificationStatus: "APPROVED",
    whatsappNumber: "+447700900105",
    dbsCertificateNumber: "001987654325",
    dbsExpiresInDays: -14, // expired two weeks ago — the other realistic gap to demo
  },
  {
    email: "hello@melodymakers.example.com",
    firstName: "Grace",
    lastName: "Lindqvist",
    verificationStatus: "PENDING", // sits in the admin approval queue for the demo
  },
  {
    email: "info@quickkidsgymnastics.example.com",
    firstName: "Dean",
    lastName: "Sallow",
    verificationStatus: "REJECTED", // shows the full moderation lifecycle, not just the happy path
  },
];

interface ActivitySeed {
  providerEmail: string;
  title: string;
  description: string;
  category: string;
  ageGroupLabel: string;
  location: string;
  capacity: number;
  creditCost: number;
  isFlagged?: boolean;
  isFeatured?: boolean;
  isSendFriendly?: boolean;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}

const ACTIVITIES: ActivitySeed[] = [
  {
    providerEmail: "hello@leicesterswimacademy.example.com",
    title: "Beginner Splashers",
    description: "Water-confidence sessions in a warm, shallow pool for our youngest swimmers.",
    category: "Swimming",
    ageGroupLabel: "Preschool (3-4)",
    location: "Leicester Sports Village",
    capacity: 12,
    creditCost: 2,
    dayOfWeek: 2,
    startTime: "16:00",
    durationMinutes: 45,
  },
  {
    providerEmail: "hello@leicesterswimacademy.example.com",
    title: "Junior Swim Squad",
    description: "Stroke technique and endurance training for confident young swimmers.",
    category: "Swimming",
    ageGroupLabel: "Junior (5-7)",
    location: "Leicester Sports Village",
    capacity: 10,
    creditCost: 3,
    isFeatured: true,
    dayOfWeek: 4,
    startTime: "17:00",
    durationMinutes: 60,
  },
  {
    providerEmail: "coach@kickstartfootball.example.com",
    title: "Mini Kickers",
    description: "Fun, football-themed games building coordination and teamwork.",
    category: "Football",
    ageGroupLabel: "Preschool (3-4)",
    location: "Aylestone Playing Fields",
    capacity: 16,
    creditCost: 2,
    dayOfWeek: 6,
    startTime: "10:00",
    durationMinutes: 45,
  },
  {
    providerEmail: "coach@kickstartfootball.example.com",
    title: "Junior Football League",
    description: "Structured coaching and small-sided matches for growing footballers.",
    category: "Football",
    ageGroupLabel: "Junior (5-7)",
    location: "Aylestone Playing Fields",
    capacity: 20,
    creditCost: 2,
    dayOfWeek: 6,
    startTime: "11:00",
    durationMinutes: 60,
  },
  {
    providerEmail: "studio@twinkletoesdance.example.com",
    title: "Ballet Basics",
    description: "A gentle introduction to ballet, adapted to each child's pace and needs.",
    category: "Dance",
    ageGroupLabel: "Preschool (3-4)",
    location: "Clarendon Park Studio",
    capacity: 14,
    creditCost: 2,
    isSendFriendly: true,
    dayOfWeek: 3,
    startTime: "15:30",
    durationMinutes: 45,
  },
  {
    providerEmail: "studio@twinkletoesdance.example.com",
    title: "Street Dance Crew",
    description: "High-energy street dance choreography for confident movers.",
    category: "Dance",
    ageGroupLabel: "Middle (8-11)",
    location: "Clarendon Park Studio",
    capacity: 18,
    creditCost: 2,
    dayOfWeek: 3,
    startTime: "17:00",
    durationMinutes: 60,
  },
  {
    providerEmail: "studio@littlepicassos.example.com",
    title: "Creative Art Explorers",
    description: "Painting, collage and sculpture projects exploring a new theme each week.",
    category: "Art",
    ageGroupLabel: "Junior (5-7)",
    location: "Highfields Community Centre",
    capacity: 10,
    creditCost: 1,
    isFlagged: true, // under admin review in the demo — a parent complaint about a past session
    dayOfWeek: 5,
    startTime: "16:00",
    durationMinutes: 60,
  },
  {
    providerEmail: "sensei@dragonwarriors.example.com",
    title: "Karate Kids",
    description: "Discipline, focus and fundamental karate technique in a supportive environment.",
    category: "Martial Arts",
    ageGroupLabel: "Junior (5-7)",
    location: "Belgrave Sports Hall",
    capacity: 15,
    creditCost: 2,
    dayOfWeek: 1,
    startTime: "17:30",
    durationMinutes: 45,
  },
  {
    providerEmail: "hello@melodymakers.example.com",
    title: "Piano for Beginners",
    description: "One-to-one style small-group piano tuition for absolute beginners.",
    category: "Music",
    ageGroupLabel: "Junior (5-7)",
    location: "Evington Music Rooms",
    capacity: 8,
    creditCost: 2,
    dayOfWeek: 2,
    startTime: "16:30",
    durationMinutes: 30,
  },
];

interface ParentSeed {
  email: string;
  firstName: string;
  lastName: string;
  planName: "Starter" | "Family" | "Unlimited" | null;
  children: {
    firstName: string;
    lastName: string;
    ageGroupLabel: string;
    allergyInfo?: string;
    isOnLeaderboard?: boolean;
  }[];
}

const PARENTS: ParentSeed[] = [
  {
    email: "sarah.johnson@example.com",
    firstName: "Sarah",
    lastName: "Johnson",
    planName: "Family",
    children: [
      { firstName: "Olivia", lastName: "Johnson", ageGroupLabel: "Junior (5-7)" },
      {
        firstName: "Jack",
        lastName: "Johnson",
        ageGroupLabel: "Preschool (3-4)",
        allergyInfo: "Peanut allergy — carries an EpiPen at all times",
      },
    ],
  },
  {
    email: "james.patel@example.com",
    firstName: "James",
    lastName: "Patel",
    planName: "Starter",
    children: [{ firstName: "Aisha", lastName: "Patel", ageGroupLabel: "Junior (5-7)", isOnLeaderboard: true }],
  },
  {
    email: "emily.clarke@example.com",
    firstName: "Emily",
    lastName: "Clarke",
    planName: "Unlimited",
    children: [
      { firstName: "Noah", lastName: "Clarke", ageGroupLabel: "Middle (8-11)", isOnLeaderboard: true },
      { firstName: "Sophie", lastName: "Clarke", ageGroupLabel: "Junior (5-7)" },
    ],
  },
  {
    email: "michael.osei@example.com",
    firstName: "Michael",
    lastName: "Osei",
    planName: "Family",
    children: [{ firstName: "Daniel", lastName: "Osei", ageGroupLabel: "Junior (5-7)" }],
  },
  {
    email: "priya.sharma@example.com",
    firstName: "Priya",
    lastName: "Sharma",
    planName: "Starter",
    children: [
      {
        firstName: "Anaya",
        lastName: "Sharma",
        ageGroupLabel: "Preschool (3-4)",
        allergyInfo: "Severe tree nut allergy — school has a care plan on file",
      },
    ],
  },
  {
    email: "tom.wright@example.com",
    firstName: "Tom",
    lastName: "Wright",
    planName: null, // no active subscription — funded only by a Community Fund grant
    children: [{ firstName: "Leo", lastName: "Wright", ageGroupLabel: "Junior (5-7)" }],
  },
  {
    email: "aisha.khan@example.com",
    firstName: "Aisha",
    lastName: "Khan",
    planName: "Family",
    children: [
      { firstName: "Zainab", lastName: "Khan", ageGroupLabel: "Middle (8-11)", isOnLeaderboard: true },
      { firstName: "Yusuf", lastName: "Khan", ageGroupLabel: "Preschool (3-4)" },
    ],
  },
  {
    email: "david.brown@example.com",
    firstName: "David",
    lastName: "Brown",
    planName: "Unlimited",
    children: [{ firstName: "Ruby", lastName: "Brown", ageGroupLabel: "Middle (8-11)", isOnLeaderboard: true }],
  },
];

interface SchoolSeed {
  email: string;
  firstName: string;
  lastName: string;
  verificationStatus: "PENDING" | "APPROVED";
  approvals?: { providerEmail: string; status: "SHORTLISTED" | "APPROVED"; notes?: string }[];
}

const SCHOOLS: SchoolSeed[] = [
  {
    email: "office@riversideprimary.example.com",
    firstName: "Helen",
    lastName: "Marsh",
    verificationStatus: "APPROVED",
    approvals: [
      {
        providerEmail: "hello@leicesterswimacademy.example.com",
        status: "APPROVED",
        notes: "Used for our Year 2 swimming programme — great communication.",
      },
      {
        providerEmail: "studio@twinkletoesdance.example.com",
        status: "APPROVED",
        notes: "Runs our after-school dance club.",
      },
      { providerEmail: "coach@kickstartfootball.example.com", status: "SHORTLISTED" },
    ],
  },
  {
    email: "admin@oakfieldacademy.example.com",
    firstName: "Robert",
    lastName: "Nunn",
    verificationStatus: "PENDING",
  },
];

async function seedUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const p of PROVIDERS) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {
        verificationStatus: p.verificationStatus,
        whatsappNumber: p.whatsappNumber ?? null,
        instagramUrl: p.instagramUrl ?? null,
        facebookUrl: p.facebookUrl ?? null,
        dbsCertificateNumber: p.dbsCertificateNumber ?? null,
        dbsCertificateExpiresAt: p.dbsExpiresInDays !== undefined ? daysFromNow(p.dbsExpiresInDays, 12) : null,
      },
      create: {
        email: p.email,
        passwordHash,
        firstName: p.firstName,
        lastName: p.lastName,
        role: "PROVIDER",
        verificationStatus: p.verificationStatus,
        whatsappNumber: p.whatsappNumber,
        instagramUrl: p.instagramUrl,
        facebookUrl: p.facebookUrl,
        dbsCertificateNumber: p.dbsCertificateNumber,
        dbsCertificateExpiresAt: p.dbsExpiresInDays !== undefined ? daysFromNow(p.dbsExpiresInDays, 12) : undefined,
      },
    });
  }

  for (const s of SCHOOLS) {
    await prisma.user.upsert({
      where: { email: s.email },
      update: { verificationStatus: s.verificationStatus },
      create: {
        email: s.email,
        passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        role: "SCHOOL",
        verificationStatus: s.verificationStatus,
      },
    });
  }

  for (const p of PARENTS) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        passwordHash,
        firstName: p.firstName,
        lastName: p.lastName,
        role: "PARENT",
      },
    });
  }

  console.log(`Seeded ${PROVIDERS.length} providers, ${SCHOOLS.length} schools, ${PARENTS.length} parents.`);
}

async function seedActivities() {
  for (const a of ACTIVITIES) {
    const provider = await prisma.user.findUniqueOrThrow({ where: { email: a.providerEmail } });
    const ageGroupId = await getAgeGroupId(a.ageGroupLabel);

    // No compound-unique constraint exists on Activity — upsert by hand (find by
    // providerId+title, then update or create).
    const existingActivity = await prisma.activity.findFirst({
      where: { providerId: provider.id, title: a.title },
    });
    const activity = existingActivity
      ? await prisma.activity.update({
          where: { id: existingActivity.id },
          data: {
            isFlagged: a.isFlagged ?? false,
            isFeatured: a.isFeatured ?? false,
            isSendFriendly: a.isSendFriendly ?? false,
          },
        })
      : await prisma.activity.create({
          data: {
            providerId: provider.id,
            ageGroupId,
            title: a.title,
            description: a.description,
            category: a.category,
            location: a.location,
            capacity: a.capacity,
            creditCost: a.creditCost,
            isFlagged: a.isFlagged ?? false,
            isFeatured: a.isFeatured ?? false,
            isSendFriendly: a.isSendFriendly ?? false,
          },
        });

    let schedule = await prisma.recurringSchedule.findFirst({ where: { activityId: activity.id } });
    if (!schedule) {
      schedule = await prisma.recurringSchedule.create({
        data: {
          activityId: activity.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          durationMinutes: a.durationMinutes,
          frequency: "WEEKLY",
          startDate: daysFromNow(-28, 0),
        },
      });
    }

    // Three past sessions (booking/attendance history) and three future sessions (confirmed /
    // pending demo material), a week apart, at the schedule's own time of day.
    const [hour, minute] = a.startTime.split(":").map(Number);
    const offsets = [-21, -14, -7, 7, 14, 21];
    for (const offsetDays of offsets) {
      const startsAt = daysFromNow(offsetDays, hour, minute);
      const endsAt = new Date(startsAt.getTime() + a.durationMinutes * 60_000);
      await prisma.classSession.upsert({
        where: { recurringScheduleId_startsAt: { recurringScheduleId: schedule.id, startsAt } },
        update: {},
        create: {
          activityId: activity.id,
          recurringScheduleId: schedule.id,
          startsAt,
          endsAt,
          capacity: a.capacity,
        },
      });
    }
  }

  console.log(`Seeded ${ACTIVITIES.length} activities with schedules and sessions.`);
}

/**
 * One activity photo per activity (a locally-generated, category-themed illustration — see
 * prisma/demo-assets.ts) and one "meet the instructor" staff photo per provider, reused across
 * all of that provider's activities. Old demo media (and its files on disk) is cleared first so
 * re-running this script doesn't pile up duplicate photos.
 */
async function seedMedia() {
  const providerEmails = PROVIDERS.map((p) => p.email);
  const providers = await prisma.user.findMany({ where: { email: { in: providerEmails } } });
  const activities = await prisma.activity.findMany({
    where: { providerId: { in: providers.map((p) => p.id) } },
  });
  const activityIds = activities.map((a) => a.id);

  const oldMedia = await prisma.activityMedia.findMany({ where: { activityId: { in: activityIds } } });
  for (const media of oldMedia) {
    const filePath = path.resolve(process.cwd(), media.url.replace(/^\//, ""));
    fs.rm(filePath, { force: true }, () => {});
  }
  await prisma.activityMedia.deleteMany({ where: { activityId: { in: activityIds } } });

  const staffAvatarByProvider = new Map<string, string>();
  for (const [index, provider] of providers.entries()) {
    staffAvatarByProvider.set(provider.id, await generateStaffAvatar(provider.firstName, provider.lastName, index));
  }

  for (const activity of activities) {
    const photoUrl = await generateActivityPhoto(activity.category);
    await prisma.activityMedia.create({
      data: { activityId: activity.id, type: "ACTIVITY_PHOTO", url: photoUrl, caption: activity.title },
    });

    const provider = providers.find((p) => p.id === activity.providerId)!;
    await prisma.activityMedia.create({
      data: {
        activityId: activity.id,
        type: "STAFF_PHOTO",
        url: staffAvatarByProvider.get(provider.id)!,
        caption: `${provider.firstName} ${provider.lastName}, Lead Instructor`,
      },
    });
  }

  console.log(`Seeded activity photos and instructor photos for ${activities.length} activities.`);
}

async function seedChildren() {
  let photoIndex = 0;
  for (const p of PARENTS) {
    const parent = await prisma.user.findUniqueOrThrow({ where: { email: p.email } });
    for (const c of p.children) {
      const existing = await prisma.child.findFirst({
        where: { parentId: parent.id, firstName: c.firstName, lastName: c.lastName },
      });
      const ageGroup = await prisma.ageGroup.findUniqueOrThrow({ where: { label: c.ageGroupLabel } });
      // Pick a birth date roughly in the middle of the age band, relative to today.
      const midAge = (ageGroup.minAge + ageGroup.maxAge) / 2;
      const dateOfBirth = new Date();
      dateOfBirth.setFullYear(dateOfBirth.getFullYear() - Math.round(midAge));

      if (existing) {
        await prisma.child.update({
          where: { id: existing.id },
          data: {
            allergyInfo: c.allergyInfo ?? null,
            isOnLeaderboard: c.isOnLeaderboard ?? false,
            // Only generate a photo if this child doesn't already have one — keeps re-runs from
            // needlessly regenerating/orphaning files for children that already look fine.
            photoUrl: existing.photoUrl ?? (await generateKidPhoto(photoIndex)),
          },
        });
      } else {
        await prisma.child.create({
          data: {
            parentId: parent.id,
            firstName: c.firstName,
            lastName: c.lastName,
            dateOfBirth,
            allergyInfo: c.allergyInfo,
            isOnLeaderboard: c.isOnLeaderboard ?? false,
            photoUrl: await generateKidPhoto(photoIndex),
          },
        });
      }
      photoIndex += 1;
    }
  }
  console.log("Seeded children with photos.");
}

/** Clears prior demo bookings/credit history so re-running this script doesn't pile up duplicates. */
async function wipeTransactionalDemoData() {
  const parentEmails = PARENTS.map((p) => p.email);
  const parents = await prisma.user.findMany({ where: { email: { in: parentEmails } } });
  const parentIds = parents.map((p) => p.id);

  await prisma.creditTransaction.deleteMany({ where: { userId: { in: parentIds } } });
  await prisma.booking.deleteMany({ where: { parentId: { in: parentIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: parentIds } } });

  const providerEmails = PROVIDERS.map((p) => p.email);
  const providers = await prisma.user.findMany({ where: { email: { in: providerEmails } } });
  await prisma.auditLog.deleteMany({
    where: { targetType: "User", targetId: { in: providers.map((p) => p.id) } },
  });
  const activityIds = (
    await prisma.activity.findMany({ where: { providerId: { in: providers.map((p) => p.id) } } })
  ).map((a) => a.id);
  await prisma.auditLog.deleteMany({ where: { targetType: "Activity", targetId: { in: activityIds } } });
}

async function grantCredits(email: string, amount: number, reason: "SUBSCRIPTION_INITIAL" | "ADMIN_ADJUSTMENT", subscriptionId?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.creditTransaction.create({
    data: { userId: user.id, amount, reason, subscriptionId },
  });
}

async function seedSubscriptions() {
  for (const p of PARENTS) {
    if (!p.planName) continue;
    const parent = await prisma.user.findUniqueOrThrow({ where: { email: p.email } });
    const planId = await getPlanId(p.planName);
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });

    const subscription = await prisma.subscription.create({
      data: {
        userId: parent.id,
        planId,
        stripeSubscriptionId: `sub_demo_${parent.id}`,
        status: "ACTIVE",
        currentPeriodEnd: daysFromNow(18, 9),
      },
    });

    await grantCredits(p.email, plan.monthlyCredits ?? 0, "SUBSCRIPTION_INITIAL", subscription.id);
    // A generous top-up so the demo's booking history (below) never dips negative regardless
    // of exactly how many sessions a child attends — same "grant demo credits directly" pattern
    // used earlier in this project for manual testing.
    await grantCredits(p.email, 12, "ADMIN_ADJUSTMENT");
  }
  console.log("Seeded subscriptions and starting credit balances.");
}

interface BookingSeed {
  parentEmail: string;
  childName: string;
  activityTitle: string;
  sessionOffsetDays: number;
  status: "ATTENDED" | "NO_SHOW" | "CONFIRMED" | "PENDING_APPROVAL" | "REJECTED" | "CANCELLED";
}

const BOOKINGS: BookingSeed[] = [
  // Ruby Brown — the leaderboard's top attendee.
  { parentEmail: "david.brown@example.com", childName: "Ruby", activityTitle: "Junior Swim Squad", sessionOffsetDays: -21, status: "ATTENDED" },
  { parentEmail: "david.brown@example.com", childName: "Ruby", activityTitle: "Junior Swim Squad", sessionOffsetDays: -14, status: "ATTENDED" },
  { parentEmail: "david.brown@example.com", childName: "Ruby", activityTitle: "Junior Swim Squad", sessionOffsetDays: -7, status: "ATTENDED" },
  { parentEmail: "david.brown@example.com", childName: "Ruby", activityTitle: "Junior Swim Squad", sessionOffsetDays: 7, status: "CONFIRMED" },

  // Zainab Khan.
  { parentEmail: "aisha.khan@example.com", childName: "Zainab", activityTitle: "Street Dance Crew", sessionOffsetDays: -21, status: "ATTENDED" },
  { parentEmail: "aisha.khan@example.com", childName: "Zainab", activityTitle: "Street Dance Crew", sessionOffsetDays: -14, status: "ATTENDED" },
  { parentEmail: "aisha.khan@example.com", childName: "Zainab", activityTitle: "Street Dance Crew", sessionOffsetDays: -7, status: "NO_SHOW" },
  { parentEmail: "aisha.khan@example.com", childName: "Zainab", activityTitle: "Street Dance Crew", sessionOffsetDays: 7, status: "CONFIRMED" },
  { parentEmail: "aisha.khan@example.com", childName: "Yusuf", activityTitle: "Mini Kickers", sessionOffsetDays: -14, status: "CANCELLED" },

  // Aisha Patel.
  { parentEmail: "james.patel@example.com", childName: "Aisha", activityTitle: "Junior Football League", sessionOffsetDays: -21, status: "ATTENDED" },
  { parentEmail: "james.patel@example.com", childName: "Aisha", activityTitle: "Junior Football League", sessionOffsetDays: -14, status: "ATTENDED" },
  { parentEmail: "james.patel@example.com", childName: "Aisha", activityTitle: "Junior Football League", sessionOffsetDays: 7, status: "PENDING_APPROVAL" },

  // Noah & Sophie Clarke.
  { parentEmail: "emily.clarke@example.com", childName: "Noah", activityTitle: "Karate Kids", sessionOffsetDays: -21, status: "ATTENDED" },
  { parentEmail: "emily.clarke@example.com", childName: "Noah", activityTitle: "Karate Kids", sessionOffsetDays: -14, status: "NO_SHOW" },
  { parentEmail: "emily.clarke@example.com", childName: "Noah", activityTitle: "Karate Kids", sessionOffsetDays: 7, status: "CONFIRMED" },
  { parentEmail: "emily.clarke@example.com", childName: "Sophie", activityTitle: "Creative Art Explorers", sessionOffsetDays: -14, status: "ATTENDED" },

  // Olivia & Jack Johnson.
  { parentEmail: "sarah.johnson@example.com", childName: "Olivia", activityTitle: "Junior Swim Squad", sessionOffsetDays: -14, status: "ATTENDED" },
  { parentEmail: "sarah.johnson@example.com", childName: "Olivia", activityTitle: "Junior Swim Squad", sessionOffsetDays: 14, status: "PENDING_APPROVAL" },
  { parentEmail: "sarah.johnson@example.com", childName: "Jack", activityTitle: "Mini Kickers", sessionOffsetDays: 7, status: "CONFIRMED" },

  // Daniel Osei.
  { parentEmail: "michael.osei@example.com", childName: "Daniel", activityTitle: "Karate Kids", sessionOffsetDays: 7, status: "CONFIRMED" },

  // Anaya Sharma — SEND-friendly + allergy info both visible on the same roster row.
  { parentEmail: "priya.sharma@example.com", childName: "Anaya", activityTitle: "Ballet Basics", sessionOffsetDays: 7, status: "CONFIRMED" },

  // Leo Wright — funded by the Community Fund grant below; one rejected, one pending.
  { parentEmail: "tom.wright@example.com", childName: "Leo", activityTitle: "Junior Football League", sessionOffsetDays: -7, status: "REJECTED" },
  { parentEmail: "tom.wright@example.com", childName: "Leo", activityTitle: "Junior Football League", sessionOffsetDays: 14, status: "PENDING_APPROVAL" },
];

async function seedBookings() {
  for (const b of BOOKINGS) {
    const parent = await prisma.user.findUniqueOrThrow({ where: { email: b.parentEmail } });
    const child = await prisma.child.findFirstOrThrow({
      where: { parentId: parent.id, firstName: b.childName },
    });
    const activity = await prisma.activity.findFirstOrThrow({ where: { title: b.activityTitle } });
    const [hour, minute] = ACTIVITIES.find((a) => a.title === b.activityTitle)!.startTime.split(":").map(Number);
    const startsAt = daysFromNow(b.sessionOffsetDays, hour, minute);
    const session = await prisma.classSession.findFirstOrThrow({
      where: { activityId: activity.id, startsAt },
    });

    // createdAt/updatedAt back-dated close to the session so approval-time analytics (average
    // response time, etc.) show something realistic rather than "decided the instant it was
    // created."
    const requestedAt = new Date(startsAt.getTime() - 4 * DAY_MS);
    const decidedAt = new Date(requestedAt.getTime() + 90 * 60_000);

    const booking = await prisma.booking.create({
      data: {
        childId: child.id,
        sessionId: session.id,
        parentId: parent.id,
        status: b.status,
        creditsSpent: activity.creditCost,
        createdAt: requestedAt,
        updatedAt: b.status === "PENDING_APPROVAL" ? requestedAt : decidedAt,
      },
    });

    await prisma.creditTransaction.create({
      data: {
        userId: parent.id,
        bookingId: booking.id,
        amount: -activity.creditCost,
        reason: "BOOKING",
        createdAt: requestedAt,
      },
    });

    if (b.status === "REJECTED" || b.status === "CANCELLED") {
      await prisma.creditTransaction.create({
        data: {
          userId: parent.id,
          bookingId: booking.id,
          amount: activity.creditCost,
          reason: "BOOKING_REFUND",
          createdAt: decidedAt,
        },
      });
    }
  }
  console.log(`Seeded ${BOOKINGS.length} bookings across every status.`);
}

async function seedSchoolApprovals() {
  for (const s of SCHOOLS) {
    if (!s.approvals) continue;
    const school = await prisma.user.findUniqueOrThrow({ where: { email: s.email } });
    for (const approval of s.approvals) {
      const provider = await prisma.user.findUniqueOrThrow({ where: { email: approval.providerEmail } });
      await prisma.schoolProviderApproval.upsert({
        where: { schoolId_providerId: { schoolId: school.id, providerId: provider.id } },
        update: { status: approval.status, notes: approval.notes },
        create: { schoolId: school.id, providerId: provider.id, status: approval.status, notes: approval.notes },
      });
    }
  }
  console.log("Seeded school provider approvals.");
}

async function seedCharity(adminId: string) {
  // Two parents donate spare credits into the pool...
  const donors = [
    { email: "michael.osei@example.com", amount: 3 },
    { email: "david.brown@example.com", amount: 2 },
  ];
  for (const donor of donors) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: donor.email } });
    await prisma.creditTransaction.create({
      data: { userId: user.id, amount: -donor.amount, reason: "CHARITY_DONATION" },
    });
  }

  // ...and an admin grants some of it to the one family without an active plan.
  const recipient = await prisma.user.findUniqueOrThrow({ where: { email: "tom.wright@example.com" } });
  await prisma.creditTransaction.create({
    data: { userId: recipient.id, amount: 3, reason: "CHARITY_GRANT" },
  });
  await prisma.auditLog.create({
    data: {
      adminId,
      action: "CHARITY_GRANT_ISSUED",
      targetType: "User",
      targetId: recipient.id,
      metadata: { amount: 3 },
    },
  });
  console.log("Seeded Community Fund donations and a grant.");
}

async function seedAuditLog(adminId: string) {
  for (const p of PROVIDERS) {
    if (p.verificationStatus === "PENDING") continue;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: p.email } });
    await prisma.auditLog.create({
      data: {
        adminId,
        action: p.verificationStatus === "APPROVED" ? "PROVIDER_APPROVED" : "PROVIDER_REJECTED",
        targetType: "User",
        targetId: user.id,
        metadata:
          p.verificationStatus === "REJECTED"
            ? { reason: "Unable to verify safeguarding documentation — resubmission welcome." }
            : undefined,
      },
    });
  }

  const riverside = await prisma.user.findUniqueOrThrow({ where: { email: "office@riversideprimary.example.com" } });
  await prisma.auditLog.create({
    data: { adminId, action: "PROVIDER_APPROVED", targetType: "User", targetId: riverside.id },
  });

  const flagged = await prisma.activity.findFirstOrThrow({ where: { title: "Creative Art Explorers" } });
  await prisma.auditLog.create({
    data: {
      adminId,
      action: "ACTIVITY_FLAGGED",
      targetType: "Activity",
      targetId: flagged.id,
      metadata: { reason: "Parent raised a supervision concern — under review." },
    },
  });

  const featured = await prisma.activity.findFirstOrThrow({ where: { title: "Junior Swim Squad" } });
  await prisma.auditLog.create({
    data: { adminId, action: "ACTIVITY_FEATURED", targetType: "Activity", targetId: featured.id },
  });

  console.log("Seeded audit log entries.");
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@rokidspass.local" } });
  if (!admin) {
    throw new Error(
      "admin@rokidspass.local not found — run the baseline seed first: npx prisma db seed",
    );
  }

  await seedUsers();
  await seedActivities();
  await seedMedia();
  await seedChildren();
  await wipeTransactionalDemoData();
  await seedSubscriptions();
  await seedBookings();
  await seedSchoolApprovals();
  await seedCharity(admin.id);
  await seedAuditLog(admin.id);

  console.log("\nDone. All seeded accounts share the password:", DEMO_PASSWORD);
  console.log("Providers:", PROVIDERS.map((p) => `${p.email} (${p.verificationStatus})`).join(", "));
  console.log("Schools:", SCHOOLS.map((s) => `${s.email} (${s.verificationStatus})`).join(", "));
  console.log("Parents:", PARENTS.map((p) => p.email).join(", "));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
