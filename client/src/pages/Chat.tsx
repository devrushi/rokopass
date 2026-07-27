import { ChatPanel } from "../components/ChatPanel";
import "./provider/provider.css";

export function Chat() {
  return (
    <div className="provider-page">
      <h1>Ask AI</h1>
      <p className="page-status">Ask about activities to book, or how to use RokidsPass as a provider.</p>
      <ChatPanel />
    </div>
  );
}
