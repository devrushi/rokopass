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
  "If you don't know something, say so and suggest who to ask (support/an admin).";

async function buildParentSystemPrompt(): Promise<string> {
  const activities = await prisma.activity.findMany({
    where: {
      isActive: true,
      isFlagged: false,
      provider: { OR: [{ role: "ADMIN" }, { verificationStatus: "APPROVED" }] },
    },
    select: {
      title: true,
      category: true,
      location: true,
      creditCost: true,
      isSendFriendly: true,
      ageGroup: { select: { label: true, minAge: true, maxAge: true } },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 150,
  });

  const catalogue = activities
    .map(
      (a) =>
        `- "${a.title}" (${a.category}, ${a.ageGroup.label} [${a.ageGroup.minAge}-${a.ageGroup.maxAge}yo], ` +
        `${a.location}, ${a.creditCost} credits/class${a.isSendFriendly ? ", SEND-friendly" : ""})`,
    )
    .join("\n");

  return (
    "You are the RokidsPass activity-search assistant. RokidsPass is a ClassPass-style " +
    "subscription platform where parents in Leicester book extracurricular classes for their " +
    "children using monthly credits. Help the parent find activities matching what they " +
    "describe (age, interest, location, day, SEND-friendly needs, etc.) from the catalogue " +
    "below — this is the full current list, nothing else exists on the platform right now. " +
    "When you recommend one, name it exactly as listed. Point them to the Browse page to book. " +
    `${BASE_RULES}\n\nCurrent activity catalogue:\n${catalogue || "(no activities are listed yet)"}`
  );
}

function buildProviderSystemPrompt(): string {
  return (
    "You are the RokidsPass platform-help assistant, talking to an activity provider (a " +
    "business running children's extracurricular classes). Explain how to use the platform " +
    "based only on these real features: creating an activity and adding a recurring weekly/" +
    "biweekly schedule (Provider Dashboard → New activity); uploading activity/staff photos; " +
    "setting a WhatsApp number and Instagram/Facebook/TikTok links so parents can reach them; " +
    "reviewing and approving/rejecting booking requests (bookings hold a parent's credits until " +
    "the provider decides); marking attendance (Attended/No-show) once a booking is confirmed; " +
    "checking their performance analytics (attendance rate, capacity utilization, repeat " +
    "bookings) with an optional AI insights summary; viewing the informational business tiers " +
    "(Basic/Pro/Featured — not billed yet); and submitting DBS safeguarding details for admin " +
    "review before approval. New providers start PENDING and must be approved by an admin " +
    `before their activities are publicly visible. ${BASE_RULES}`
  );
}

export async function chatWithAssistant(role: string, messages: ChatMessage[]): Promise<string> {
  const system = role === "PARENT" ? await buildParentSystemPrompt() : buildProviderSystemPrompt();

  let response;
  try {
    response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 500,
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
  return textBlock.text;
}
