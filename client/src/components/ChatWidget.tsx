import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChatPanel } from "./ChatPanel";
import "./ChatWidget.css";

// Available wherever a parent/provider is signed in — not just on the dedicated /chat page — so
// they don't have to navigate away from what they're doing to ask a question. Hidden on /chat
// itself so the floating panel and the full page don't both show at once; both read/write the
// same sessionStorage-backed conversation (see useChatMessages), so switching between them never
// loses anything.
export function ChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || (user.role !== "PARENT" && user.role !== "PROVIDER")) return null;
  if (location.pathname === "/chat") return null;

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-widget__panel">
          <div className="chat-widget__header">
            <span>Ask AI</span>
            <button
              type="button"
              className="chat-widget__close"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>
          <ChatPanel compact onLinkNavigate={() => setIsOpen(false)} />
        </div>
      )}
      <button
        type="button"
        className="chat-widget__toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close Ask AI chat" : "Open Ask AI chat"}
      >
        {isOpen ? "×" : "💬"}
      </button>
    </div>
  );
}
