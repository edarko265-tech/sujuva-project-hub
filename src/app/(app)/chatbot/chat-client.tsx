'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { ClientTime } from '@/components/ClientTime';

interface Msg { id?: string; role: 'user' | 'assistant'; content: string }
interface SessionItem { id: string; title: string; updatedAt: string; _count?: { messages: number } }

const GREETING: Msg = {
  role: 'assistant',
  content: 'Hello! I can summarise project status, list blockers, or accept ideas. What would you like to do?',
};

export function ChatClient() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) setSessions(await res.json());
    } finally { setLoadingList(false); }
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function loadSession(id: string) {
    setLoadingSession(true);
    setActiveId(id);
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (res.ok) {
        const data = await res.json();
        const msgs: Msg[] = data.messages.map((m: { id: string; role: string; content: string }) => ({
          id: m.id, role: m.role === 'user' ? 'user' : 'assistant', content: m.content,
        }));
        setMessages(msgs.length ? msgs : [GREETING]);
      }
    } finally { setLoadingSession(false); }
  }

  function newChat() {
    setActiveId(null);
    setMessages([GREETING]);
    setInput('');
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this conversation?')) return;
    const res = await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSessions((s) => s.filter((x) => x.id !== id));
      if (activeId === id) newChat();
    }
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeId, messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages([...next, { role: 'assistant', content: data.reply }]);
        if (data.sessionId && data.sessionId !== activeId) setActiveId(data.sessionId);
        refreshSessions();
      } else {
        setMessages([...next, { role: 'assistant', content: `Error: ${data.error ?? 'request failed'}` }]);
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="card flex h-[68vh] overflow-hidden p-0">
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <button onClick={newChat} className="btn-primary w-full">+ New chat</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingList && (
            <div className="space-y-2 px-1">
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-8 w-3/4" />
              <div className="skeleton h-8 w-5/6" />
            </div>
          )}
          {!loadingList && sessions.length === 0 && (
            <div className="px-2 py-6 text-xs text-slate-500 text-center animate-fade-in">No chats yet. Start one above.</div>
          )}
          <ul className="stagger space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                    activeId === s.id
                      ? 'bg-brand-cream text-brand-ink dark:bg-slate-800 dark:text-slate-100'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                  }`}
                  onClick={() => loadSession(s.id)}
                >
                  <span className="flex-1 truncate" title={s.title}>{s.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 px-1 text-xs"
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-2 text-[10px] text-slate-400 dark:text-slate-500">
                  <ClientTime iso={s.updatedAt} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-medium text-brand-ink dark:text-slate-100">
            {activeId ? sessions.find((s) => s.id === activeId)?.title ?? 'Chat' : 'New chat'}
          </span>
          <button onClick={newChat} className="btn-ghost md:hidden text-xs">+ New</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingSession ? (
            <div className="space-y-3">
              <div className="skeleton h-12 w-2/3" />
              <div className="skeleton h-12 w-3/4 ml-auto" />
              <div className="skeleton h-16 w-1/2" />
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div
                  key={m.id ?? i}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap animate-fade-in-up shadow-sm ${
                    m.role === 'user'
                      ? 'ml-auto bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-ink'
                      : 'bg-brand-cream text-brand-ink dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && (
                <div className="max-w-[60%] rounded-lg px-3 py-2 bg-brand-cream dark:bg-slate-800 text-brand-ink dark:text-slate-200 inline-flex items-center gap-2 animate-fade-in">
                  <span className="text-xs">Assistant is thinking</span>
                  <span className="typing-dots"><span /><span /><span /></span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-3 flex gap-2">
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your projects…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={busy}
          />
          <button onClick={send} disabled={busy || !input.trim()} className="btn-primary inline-flex items-center gap-2">
            {busy ? (<><Spinner size="sm" /> Sending</>) : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
