import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Haiku, not Sonnet/Opus — every AI feature in this project (insights, chat) is a short,
// low-stakes text response, not a task needing frontier reasoning. Cheaper and faster.
export const AI_MODEL = "claude-haiku-4-5-20251001";
