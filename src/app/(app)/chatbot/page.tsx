import { ChatClient } from './chat-client';

export default function ChatbotPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-3 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Project Hub Assistant</h1>
        <p className="text-sm text-slate-500">Ask about your projects, propose ideas, or request updates. Your conversations are saved in the sidebar.</p>
      </div>
      <ChatClient />
    </div>
  );
}
