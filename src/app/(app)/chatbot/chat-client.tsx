'use client';
import { useState } from 'react';

interface Msg { role: 'user' | 'assistant'; content: string }

export function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hello! I can summarise project status, list blockers, or accept ideas. What would you like to do?' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'openai' | 'mock'>('mock');

  async function send() {
    if (!input.trim()) return;
    const next: Msg[] = [...messages, { role: 'user', content: input }];
    setMessages(next); setInput(''); setBusy(true);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMode(data.mode === 'openai' ? 'openai' : 'mock');
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    }
    else setMessages([...next, { role: 'assistant', content: `Error: ${data.error ?? 'request failed'}` }]);
  }

  return (
    <div className="card flex flex-col h-[60vh]">
      <div className="px-4 py-2 border-b text-xs text-slate-500 flex items-center justify-between">
        <span>Project Assistant</span>
        <span className={`badge ${mode === 'openai' ? 'badge-green' : 'badge-amber'}`}>
          {mode === 'openai' ? 'AI mode' : 'Mock mode'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-brand-navy text-white' : 'bg-brand-cream text-brand-ink'}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Assistant is thinking…</div>}
      </div>
      <div className="border-t p-3 flex gap-2">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your projects…"
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <button onClick={send} disabled={busy} className="btn-primary">Send</button>
      </div>
    </div>
  );
}
