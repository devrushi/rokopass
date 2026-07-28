import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../lib/apiClient";
import { useChatMessages, type ChatMessage } from "../hooks/useChatMessages";
import { ActivityCard } from "./ActivityCard";
import "./ChatPanel.css";

// Matches the assistant's own [Label](/path) link convention (see src/services/aiChat.ts) —
// rendered as real in-app navigation instead of dead text, without pulling in a full markdown
// renderer for what's otherwise plain conversational text.
const MARKDOWN_LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;

// A recommended activity already gets its own rich ActivityCard rendered below the message (see
// recommendedActivities), so its inline [Label](/browse/<id>) link would just be a redundant
// second way to reach the same page — rendered as plain text instead of a second link.
function renderMessageContent(content: string, cardActivityIds: Set<string>, onNavigate?: () => void) {
  const parts: (string | { label: string; path: string; isCardLink: boolean })[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(MARKDOWN_LINK)) {
    const [full, label, path] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(content.slice(lastIndex, index));
    const activityId = path.startsWith("/browse/") ? path.slice("/browse/".length) : null;
    parts.push({ label, path, isCardLink: activityId !== null && cardActivityIds.has(activityId) });
    lastIndex = index + full.length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));

  return parts.map((part, i) => {
    if (typeof part === "string") return <Fragment key={i}>{part}</Fragment>;
    if (part.isCardLink) return <Fragment key={i}>{part.label}</Fragment>;
    return (
      <Link key={i} to={part.path} className="chat-message__link" onClick={onNavigate}>
        {part.label}
      </Link>
    );
  });
}

interface ChatPanelProps {
  /** Tighter spacing/height for the floating widget vs. the full /chat page. */
  compact?: boolean;
  onLinkNavigate?: () => void;
}

export function ChatPanel({ compact = false, onLinkNavigate }: ChatPanelProps) {
  const { messages, setMessages } = useChatMessages();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setError(null);
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    try {
      const data = await apiRequest<{ reply: string; recommendedActivities: ChatMessage["recommendedActivities"] }>(
        "/ai/chat",
        {
          method: "POST",
          // Only role/content go over the wire — recommendedActivities is UI-only state attached
          // to past assistant turns, not something the model needs back as conversation history.
          body: { messages: nextMessages.map(({ role, content }) => ({ role, content })) },
        },
      );
      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.reply, recommendedActivities: data.recommendedActivities },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reach the assistant");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className={`chat-panel ${compact ? "chat-panel--compact" : ""}`}>
      <div className="chat-window">
        {messages.length === 0 && <p className="page-status">Say hello to get started.</p>}
        {messages.map((message, index) => {
          const cardActivities = message.recommendedActivities ?? [];
          const cardActivityIds = new Set(cardActivities.map((a) => a.id));
          return (
            <Fragment key={index}>
              <div className={`chat-message chat-message--${message.role}`}>
                {message.role === "assistant"
                  ? renderMessageContent(message.content, cardActivityIds, onLinkNavigate)
                  : message.content}
              </div>
              {cardActivities.length > 0 && (
                <div className="chat-message__cards">
                  {cardActivities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      linkTo={`/browse/${activity.id}`}
                      onClick={onLinkNavigate}
                    />
                  ))}
                </div>
              )}
            </Fragment>
          );
        })}
        {isSending && <div className="chat-message chat-message--assistant chat-message--pending">Thinking…</div>}
      </div>

      {error && <p className="form__error">{error}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          disabled={isSending}
        />
        <button type="submit" className="button" disabled={isSending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
