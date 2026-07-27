import { useState } from "react";

const STORAGE_KEY = "rokidspass.chatMessages";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function readStored(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

// Backed by sessionStorage (not localStorage) so the conversation survives page navigation and
// reloads within the current browser tab, but doesn't linger indefinitely — it's gone once the
// tab/browser session ends, and is explicitly cleared on logout (see AuthContext) so a different
// user signing in on the same tab never sees someone else's chat history. The full-page Chat
// route and the floating ChatWidget both use this, so switching between them keeps one
// conversation rather than two.
export function useChatMessages() {
  const [messages, setMessagesState] = useState<ChatMessage[]>(readStored);

  function setMessages(next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
    setMessagesState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      return resolved;
    });
  }

  return { messages, setMessages };
}

export function clearStoredChatMessages(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
