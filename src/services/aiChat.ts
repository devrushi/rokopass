import { anthropic, AI_MODEL } from "../lib/anthropic";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const BASE_RULES =
  "Keep replies short and conversational (2-5 sentences unless listing options). Never invent " +
  "an activity, provider, price, or platform feature that wasn't given to you in this prompt. " +
  "If you don't know something, say so and suggest who to ask (support/an admin). When you " +
  "point the user to a static page, use a markdown link in the exact form [Label](/path), using " +
  "only the pages listed below — never invent a path or a page ID.";

const PARENT_PAGES =
  "- [Browse Activities](/browse) — find and book classes\n" +
  "- [My Children](/children) — add a child, set allergy info, opt them into the leaderboard\n" +
  "- [My Bookings](/bookings) — see booking status, cancel an upcoming one\n" +
  "- [Plans](/plans) — see/change your credit plan\n" +
  "- [Invoices](/billing/invoices) — billing history\n" +
  "- [Dashboard](/dashboard) — credit balance and activity overview\n" +
  "- [Leaderboard](/leaderboard) — kids' attendance leaderboard (opt-in)";

const PROVIDER_PAGES =
  "- [Provider Dashboard](/provider) — pending booking requests, plus your WhatsApp number, " +
  "social links, and DBS safeguarding details\n" +
  "- [My Activities](/provider/activities) — manage your listings, schedules, photos\n" +
  "- [New Activity](/provider/activities/new) — create a listing\n" +
  "- [Accounting](/provider/accounting) — business profile, Stripe payouts, payout statements " +
  "(tax/payment details — not where WhatsApp or social links live)\n" +
  "- [Expenses](/provider/expenses) — log business expenses\n" +
  "- [Leaderboard](/leaderboard) — kids' attendance leaderboard";

// Age in whole years as of today — matches how activities are age-gated (AgeGroup.minAge/maxAge
// are whole years), so the model can compare a child's age to the catalogue directly.
function ageInYears(dateOfBirth: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

async function buildParentSystemPrompt(userId: string): Promise<string> {
  const [activities, children] = await Promise.all([
    prisma.activity.findMany({
      where: {
        isActive: true,
        isFlagged: false,
        provider: { OR: [{ role: "ADMIN" }, { verificationStatus: "APPROVED" }] },
      },
      select: {
        id: true,
        title: true,
        category: true,
        location: true,
        creditCost: true,
        isSendFriendly: true,
        ageGroup: { select: { label: true, minAge: true, maxAge: true } },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: 150,
    }),
    prisma.child.findMany({
      where: { parentId: userId },
      select: { firstName: true, lastName: true, dateOfBirth: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const catalogue = activities
    .map(
      (a) =>
        `- [${a.title}](/browse/${a.id}) (${a.category}, ${a.ageGroup.label} [${a.ageGroup.minAge}-${a.ageGroup.maxAge}yo], ` +
        `${a.location}, ${a.creditCost} credits/class${a.isSendFriendly ? ", SEND-friendly" : ""})`,
    )
    .join("\n");

  const childrenList = children
    .map((c) => `- ${c.firstName} ${c.lastName}, age ${ageInYears(c.dateOfBirth)}`)
    .join("\n");

  return (
    "You are the RokidsPass assistant, talking to a parent. RokidsPass is a ClassPass-style " +
    "subscription platform where parents in Leicester book extracurricular classes for their " +
    "children using monthly credits. You help with two things:\n\n" +
    "1. Choosing activities — match what they describe (interest, location, day, SEND-friendly " +
    "needs, etc.) against the catalogue below, which is the full current list — nothing else " +
    "exists on the platform right now. This parent's own children are listed below too, with " +
    "their current age — if they ask about a child by name (e.g. \"suggest something for " +
    "Ruby\"), use that child's age directly from the list rather than asking for it; only ask if " +
    "the name they used doesn't match anyone on the list, or they haven't named a child at all. " +
    "Each catalogue entry already starts with its own [Activity Name](/browse/<id>) link — every " +
    "single time you name a specific activity, anywhere in your reply, reuse that exact link " +
    "verbatim (never just its plain name, and never a generic link) so the parent goes straight " +
    "to that activity's own page to book it. This applies even when you're listing several " +
    "options, not just a single recommendation. HARD LIMIT: never link more than 4 activities in " +
    "one reply, even if far more match and even if the parent asks for \"all\" of them — each " +
    "link costs a lot of your reply budget, and going past 4 risks your reply being cut off " +
    "mid-link. If more than 4 match, pick the 4 best and say there are more, then either ask a " +
    "follow-up question to narrow it down or point to [Browse Activities](/browse) filtered by " +
    "category for the rest — never list additional matches by plain name instead of a link, only " +
    "omit them from the reply entirely. Only link to [Browse Activities](/browse) itself when " +
    "they want to browse everything themselves, not as a substitute for linking the specific " +
    "activities you're naming.\n" +
    "2. Using the platform — explain the booking flow (browse → request a spot → the provider " +
    "approves or rejects it, holding the child's credits in the meantime → attend), managing " +
    "child profiles and allergy info, checking credit balance/plan, viewing past bookings and " +
    "invoices, and the opt-in kids leaderboard. Point them to the right page using these links:\n" +
    `${PARENT_PAGES}\n\n` +
    `${BASE_RULES}\n\n` +
    `This parent's children:\n${childrenList || "(no children added yet — suggest [My Children](/children) if they mention one by name)"}\n\n` +
    `Current activity catalogue:\n${catalogue || "(no activities are listed yet)"}`
  );
}

function buildProviderSystemPrompt(): string {
  return (
    "You are the RokidsPass assistant, talking to an activity provider (a business running " +
    "children's extracurricular classes). You help with two things:\n\n" +
    "1. Using the platform — based only on these real features: creating an activity and " +
    "adding a recurring weekly/biweekly schedule; uploading activity/staff photos; setting a " +
    "WhatsApp number and Instagram/Facebook/TikTok links; reviewing and approving/rejecting " +
    "booking requests (a booking holds the parent's credits until you decide); marking " +
    "attendance (Attended/No-show) once a booking is confirmed; real bank payouts via Stripe " +
    "Connect for credits redeemed, with downloadable payout statements; logging business " +
    "expenses; checking performance analytics (attendance rate, capacity utilization, repeat " +
    "bookings) with an optional AI insights summary; viewing the informational business tiers " +
    "(Basic/Pro/Featured — not billed yet); and submitting DBS safeguarding details for admin " +
    "review. New providers start PENDING and must be approved by an admin before their " +
    "activities are publicly visible. Point them to the right page using these links:\n" +
    `${PROVIDER_PAGES}\n\n` +
    "2. Improving their listing/business — practical, concrete tips grounded only in what " +
    "actually affects visibility or bookings on this platform: add real activity and staff " +
    "photos (listings with photos read as more trustworthy); write a clear, specific " +
    "description; set an accurate age group and a fair credit cost; add a recurring schedule " +
    "so the calendar doesn't run empty; mark an activity SEND-friendly if it genuinely is, " +
    "since parents filter by that; respond to booking requests quickly — a parent's credits " +
    "sit held the whole time a request is pending, so slow responses cost them a usable spot " +
    "elsewhere; keep attendance marked promptly and accurately, since attendance rate and " +
    "approval-response time both show up in their analytics; add a WhatsApp number and social " +
    "links so parents can reach them directly; complete DBS safeguarding details, since " +
    "approval (and therefore public visibility) depends on it; and check their analytics page " +
    "periodically for the AI insights summary. Never suggest anything outside this list (no " +
    "invented ad products, no paid boosts beyond the real informational tiers above).\n\n" +
    BASE_RULES
  );
}

// Matches the same [Label](/browse/<id>) links the system prompt tells the model to reuse
// verbatim from its own catalogue (see buildParentSystemPrompt) — used to pull out exactly which
// activities it recommended, so the frontend can render real activity cards instead of just a
// text link. Only /browse/<id> (not the bare /browse page) has a UUID to extract.
const RECOMMENDED_ACTIVITY_LINK = /\/browse\/([0-9a-f-]{36})/gi;

function extractRecommendedActivityIds(reply: string): string[] {
  const ids = new Set<string>();
  for (const match of reply.matchAll(RECOMMENDED_ACTIVITY_LINK)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export interface ChatResult {
  reply: string;
  recommendedActivities: Awaited<ReturnType<typeof loadRecommendedActivities>>;
}

function loadRecommendedActivities(ids: string[]) {
  return prisma.activity.findMany({
    where: { id: { in: ids } },
    include: {
      ageGroup: true,
      media: true,
      recurringSchedules: {
        select: { dayOfWeek: true, startTime: true, durationMinutes: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function chatWithAssistant(userId: string, role: string, messages: ChatMessage[]): Promise<ChatResult> {
  const system = role === "PARENT" ? await buildParentSystemPrompt(userId) : buildProviderSystemPrompt();

  let response;
  try {
    response = await anthropic.messages.create({
      model: AI_MODEL,
      // A [Label](/browse/<uuid>) link alone is ~25-30 tokens; a reply legitimately using the
      // system prompt's 4-link limit plus surrounding text needs more headroom than 500 gave it —
      // that budget was observed truncating mid-link on a broad query, leaving a raw unparsed
      // "[Label" fragment visible in the chat.
      max_tokens: 800,
      system,
      messages,
    });
  } catch {
    throw new AppError("The AI assistant is temporarily unavailable", 502);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AppError("The AI assistant is temporarily unavailable", 502);
  }

  // Only parents get activity recommendations — a provider's own links are all static pages, so
  // this is always empty for them.
  const recommendedIds = role === "PARENT" ? extractRecommendedActivityIds(textBlock.text) : [];
  const recommendedActivities = recommendedIds.length > 0 ? await loadRecommendedActivities(recommendedIds) : [];

  return { reply: textBlock.text, recommendedActivities };
}
