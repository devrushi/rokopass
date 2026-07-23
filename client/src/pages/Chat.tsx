import { useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../lib/apiClient";
import "./Chat.css";
import "./provider/provider.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
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
    <div className="provider-page">
      <h1>Ask AI</h1>
      <p className="page-status">
        Ask about activities to book, or how to use RokidsPass as a provider.
      </p>

      <div className="chat-window">
        {messages.length === 0 && <p className="page-status">Say hello to get started.</p>}
        {messages.map((message, index) => (
          <div key={index} className={`chat-message chat-message--${message.role}`}>
            {message.content}
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
