import { Fragment, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../lib/apiClient";
import { useChatMessages } from "../hooks/useChatMessages";
import "./ChatPanel.css";

// Matches the assistant's own [Label](/path) link convention (see src/services/aiChat.ts) —
// rendered as real in-app navigation instead of dead text, without pulling in a full markdown
// renderer for what's otherwise plain conversational text.
const MARKDOWN_LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;

function renderMessageContent(content: string, onNavigate?: () => void) {
  const parts: (string | { label: string; path: string })[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(MARKDOWN_LINK)) {
    const [full, label, path] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(content.slice(lastIndex, index));
    parts.push({ label, path });
    lastIndex = index + full.length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));

  return parts.map((part, i) =>
    typeof part === "string" ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <Link key={i} to={part.path} className="chat-message__link" onClick={onNavigate}>
        {part.label}
      </Link>
    ),
  );
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
      const data = await apiRequest<{ reply: string }>("/ai/chat", {
        method: "POST",
        body: { messages: nextMessages },
      });
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
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
        {messages.map((message, index) => (
          <div key={index} className={`chat-message chat-message--${message.role}`}>
            {message.role === "assistant" ? renderMessageContent(message.content, onLinkNavigate) : message.content}
          </div>
        ))}
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
