'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Project { id: string; name: string; phases: Array<{ id: string; name: string; order: number }> }
interface Dump {
  id: string; rawText: string; proposedTitle: string | null; proposedDescription: string | null;
  status: string; createdAt: string; project?: { id: string; name: string } | null;
}

export function BrainDumpClient({ projects, dumps }: { projects: Project[]; dumps: Dump[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    const res = await fetch('/api/brain-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: text, projectId: projectId || null }),
    });
    setBusy(false);
    if (res.ok) { setText(''); router.refresh(); }
    else alert('Save failed');
  }

  async function accept(d: Dump) {
    const project = projects.find((p) => p.id === d.project?.id) ?? projects[0];
    if (!project) { alert('Create a project first.'); return; }
    const phaseId = prompt(`Add to which phase id?\n${project.phases.map((p) => `${p.order + 1}. ${p.name} → ${p.id}`).join('\n')}`);
    if (!phaseId) return;
    const res = await fetch('/api/brain-dump', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, phaseId }),
    });
    if (res.ok) router.refresh(); else alert('Failed');
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 space-y-3">
        <p className="text-sm text-slate-500">Capture a raw idea. We will turn it into a proposed feature you can review.</p>
        <textarea className="input min-h-[140px]" placeholder="Type your idea, problem, or quick note…"
          value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Related project (optional)</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Decide later —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save brain dump'}</button>
        </div>
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b font-semibold">Recent dumps</div>
        <ul className="divide-y">
          {dumps.length === 0 && <li className="p-4 text-sm text-slate-500">No dumps yet.</li>}
          {dumps.map((d) => (
            <li key={d.id} className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-brand-ink">{d.proposedTitle ?? '(untitled)'}</div>
                  <div className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleString()} · {d.project?.name ?? 'Unassigned'}</div>
                </div>
                <span className={`badge ${d.status === 'ACCEPTED' ? 'badge-green' : d.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>{d.status}</span>
              </div>
              <p className="text-sm text-slate-600">{d.proposedDescription ?? d.rawText}</p>
              {d.status === 'PROPOSED' && (
                <button onClick={() => accept(d)} className="btn-gold">Accept as feature</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
