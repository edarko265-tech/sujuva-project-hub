'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientTime } from '@/components/ClientTime';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Spinner } from '@/components/Spinner';

interface Project { id: string; name: string; phases: Array<{ id: string; name: string; order: number }> }
interface Dump {
  id: string; rawText: string; proposedTitle: string | null; proposedDescription: string | null;
  proposedPhaseId?: string | null;
  status: string; createdAt: string; project?: { id: string; name: string } | null;
}

export function BrainDumpClient({ projects, dumps: initialDumps }: { projects: Project[]; dumps: Dump[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [dumps, setDumps] = useState<Dump[]>(initialDumps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text, projectId: projectId || null }),
      });
      if (res.ok) { setText(''); router.refresh(); }
      else alert('Save failed');
    } finally { setBusy(false); }
  }

  async function accept(d: Dump) {
    const project = projects.find((p) => p.id === d.project?.id) ?? projects[0];
    if (!project) { alert('Create a project first.'); return; }
    const suggested = d.proposedPhaseId && project.phases.some((p) => p.id === d.proposedPhaseId) ? d.proposedPhaseId : project.phases[0]?.id;
    const phaseId = prompt(
      `Add to which phase id?\n${project.phases.map((p) => `${p.order + 1}. ${p.name} \u2192 ${p.id}`).join('\n')}`,
      suggested,
    );
    if (!phaseId) return;
    setAcceptingId(d.id);
    try {
      const res = await fetch('/api/brain-dump', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, phaseId }),
      });
      if (res.ok) router.refresh(); else alert('Failed');
    } finally { setAcceptingId(null); }
  }

  async function refine(d: Dump) {
    setRefiningId(d.id);
    try {
      const res = await fetch(`/api/brain-dump/${d.id}/refine`, { method: 'POST' });
      if (res.ok) router.refresh(); else alert('Refine failed');
    } finally { setRefiningId(null); }
  }

  function startEdit(d: Dump) {
    setEditingId(d.id);
    setEditTitle(d.proposedTitle ?? '');
    setEditDesc(d.proposedDescription ?? d.rawText);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditDesc('');
  }

  async function saveEdit(d: Dump) {
    setSavingId(d.id);
    try {
      const res = await fetch(`/api/brain-dump/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposedTitle: editTitle.trim() || null,
          proposedDescription: editDesc.trim() || null,
        }),
      });
      if (res.ok) {
        setDumps((arr) => arr.map((x) => x.id === d.id
          ? { ...x, proposedTitle: editTitle.trim() || null, proposedDescription: editDesc.trim() || null }
          : x));
        cancelEdit();
        router.refresh();
      } else alert('Save failed');
    } finally { setSavingId(null); }
  }

  async function remove(d: Dump) {
    if (!confirm('Delete this brain-dump? This cannot be undone.')) return;
    const res = await fetch(`/api/brain-dump/${d.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDumps((arr) => arr.filter((x) => x.id !== d.id));
      router.refresh();
    } else alert('Delete failed');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card p-6 space-y-3">
        <p className="text-sm text-slate-500">Capture a raw idea. We will turn it into a proposed feature you can review.</p>
        <textarea className="input min-h-[140px]" placeholder="Type your idea, problem, or quick note…"
          value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <VoiceRecorder
          onTranscript={(t) => setText((prev) => (prev ? `${prev.trimEnd()}\n${t}` : t))}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Related project (optional)</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
              <option value="">— Decide later —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={submit} disabled={busy || !text.trim()} className="btn-primary inline-flex items-center gap-2">
            {busy ? (<><Spinner size="sm" /> Saving…</>) : 'Save brain dump'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b font-semibold dark:border-slate-800">Recent dumps</div>
        <ul className="divide-y dark:divide-slate-800 stagger">
          {dumps.length === 0 && <li className="p-4 text-sm text-slate-500">No dumps yet.</li>}
          {dumps.map((d) => (
            <li key={d.id} className="p-4 space-y-2">
              {editingId === d.id ? (
                <div className="space-y-2 animate-fade-in">
                  <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Proposed title" />
                  <textarea className="input min-h-[100px]" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Proposed description" />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(d)} disabled={savingId === d.id} className="btn-primary inline-flex items-center gap-2">
                      {savingId === d.id ? (<><Spinner size="sm" /> Saving</>) : 'Save'}
                    </button>
                    <button onClick={cancelEdit} className="btn-ghost">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand-ink dark:text-slate-100 truncate">{d.proposedTitle ?? '(untitled)'}</div>
                      <div className="text-xs text-slate-500"><ClientTime iso={d.createdAt} /> · {d.project?.name ?? 'Unassigned'}</div>
                    </div>
                    <span className={`badge shrink-0 ${d.status === 'ACCEPTED' ? 'badge-green' : d.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>{d.status}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{d.proposedDescription ?? d.rawText}</p>
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'PROPOSED' && (
                      <>
                        <button onClick={() => refine(d)} disabled={refiningId === d.id} className="btn-ghost inline-flex items-center gap-2">
                          {refiningId === d.id ? (<><Spinner size="sm" /> Refining</>) : 'Refine with AI'}
                        </button>
                        <button onClick={() => accept(d)} disabled={acceptingId === d.id} className="btn-gold inline-flex items-center gap-2">
                          {acceptingId === d.id ? (<><Spinner size="sm" /> Accepting</>) : 'Accept as feature'}
                        </button>
                      </>
                    )}
                    <button onClick={() => startEdit(d)} className="btn-ghost">Edit</button>
                    <button onClick={() => remove(d)} className="btn-ghost text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">Delete</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
