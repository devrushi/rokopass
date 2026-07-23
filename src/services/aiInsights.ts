import { anthropic, AI_MODEL } from "../lib/anthropic";
import { AppError } from "../middleware/errorHandler";
import type { AdminAnalytics, ParentAnalytics, ProviderAnalytics } from "./analytics";

const SHARED_RULES =
  "Write 2-4 short bullet points (each one sentence). Be specific and reference the actual " +
  "numbers given. Never invent a number, trend, or fact that isn't present in the JSON data. " +
  "If the data is too sparse to say anything useful, say so plainly instead of padding.";

async function generateInsights(systemPrompt: string, dataJson: unknown): Promise<string> {
  let response;
  try {
    response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      system: `${systemPrompt} ${SHARED_RULES}`,
      messages: [{ role: "user", content: JSON.stringify(dataJson) }],
    });
  } catch {
    throw new AppError("AI insights are temporarily unavailable", 502);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AppError("AI insights are temporarily unavailable", 502);
  }
  return textBlock.text;
}

export function getParentInsights(analytics: ParentAnalytics): Promise<string> {
  return generateInsights(
    "You are a friendly assistant inside RokidsPass, a platform where parents book " +
      "extracurricular activities for their children. Given a parent's usage data as JSON, " +
      "comment on their credit usage and their children's attendance/activity patterns.",
    analytics,
  );
}

export function getProviderInsights(analytics: ProviderAnalytics): Promise<string> {
  return generateInsights(
    "You are a business analyst assistant inside RokidsPass, a marketplace platform for " +
      "children's activity providers. Given a provider's performance data as JSON, suggest how " +
      "they could improve attendance, capacity utilization, or approval speed.",
    analytics,
  );
}

export function getAdminInsights(analytics: AdminAnalytics): Promise<string> {
  return generateInsights(
    "You are a platform operations assistant inside RokidsPass, an admin analytics dashboard. " +
      "Given platform-wide data as JSON, flag growth trends, moderation backlog, or areas " +
      "needing admin attention.",
    analytics,
  );
}
