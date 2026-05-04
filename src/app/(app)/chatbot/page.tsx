import { ChatClient } from './chat-client';

export default function ChatbotPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold text-brand-ink">Project Hub Assistant</h1>
      <p className="text-sm text-slate-500">
        Ask about your projects, propose ideas, or request updates.
        Set <code>OPENAI_API_KEY</code> in <code>.env</code> to enable real GPT responses;
        otherwise the assistant runs in mock mode.
      </p>
      <ChatClient />
    </div>
  );
}
