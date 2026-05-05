'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressBar } from '@/components/ProgressBar';
import { FeatureAttachments } from '@/components/FeatureAttachments';

type Role = 'ADMIN' | 'MANAGER' | 'CONTRIBUTOR' | 'VIEWER';
interface User { id: string; name: string; email: string }
interface Feature {
  id: string; title: string; description?: string | null; status: string; priority: string;
  completion: number; assigneeId?: string | null; assignee?: User | null; dueDate?: string | null;
  tags?: string | null;
}
interface Phase { id: string; name: string; order: number; required: boolean; features: Feature[] }
interface Project { id: string; name: string; phases: Phase[] }

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'COMPLETED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: 'badge-gray', IN_PROGRESS: 'badge-blue', BLOCKED: 'badge-red',
  IN_REVIEW: 'badge-amber', COMPLETED: 'badge-green',
};

export function ProjectDetailClient({
  project, users, canEdit, currentUserId, currentRole,
}: { project: Project; users: User[]; canEdit: boolean; currentUserId: string; currentRole: Role }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [openPhase, setOpenPhase] = useState<string | null>(project.phases[0]?.id ?? null);
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  async function api(path: string, method: string, body?: unknown) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Action failed'); return null; }
    return res.json().catch(() => ({}));
  }

  function refresh() { start(() => router.refresh()); }

  async function addPhase() {
    const name = prompt('New phase name?');
    if (!name) return;
    await api(`/api/projects/${project.id}/phases`, 'POST', { name });
    refresh();
  }
  async function renamePhase(p: Phase) {
    const name = prompt('Rename phase', p.name);
    if (!name || name === p.name) return;
    await api(`/api/phases/${p.id}`, 'PATCH', { name });
    refresh();
  }
  async function deletePhase(p: Phase) {
    if (!confirm(`Delete phase "${p.name}"?`)) return;
    await api(`/api/phases/${p.id}`, 'DELETE');
    refresh();
  }
  async function movePhase(p: Phase, dir: -1 | 1) {
    await api(`/api/phases/${p.id}`, 'PATCH', { order: p.order + dir });
    refresh();
  }
  async function addFeature(phaseId: string) {
    if (!newTitle.trim()) return;
    await api(`/api/phases/${phaseId}/features`, 'POST', { title: newTitle.trim() });
    setNewTitle(''); setAdding(null); refresh();
  }
  async function patchFeature(f: Feature, patch: Partial<Feature>) {
    await api(`/api/features/${f.id}`, 'PATCH', patch);
    refresh();
  }
  async function deleteFeature(f: Feature) {
    if (!confirm(`Delete "${f.title}"?`)) return;
    await api(`/api/features/${f.id}`, 'DELETE');
    refresh();
  }
  async function comment(f: Feature) {
    const body = prompt('Add a note/comment');
    if (!body) return;
    await api(`/api/features/${f.id}`, 'POST', { body });
    refresh();
  }

  function canEditFeatureLocal(f: Feature) {
    if (currentRole === 'ADMIN') return true;
    if (currentRole === 'VIEWER') return false;
    if (canEdit) return true; // manager of project
    return f.assigneeId === currentUserId;
  }

  return (
    <section className="card">
      <div className="flex justify-between items-center px-4 py-3 border-b">
        <h2 className="font-semibold">Phases & features</h2>
        {canEdit && <button onClick={addPhase} className="btn-gold">+ Phase</button>}
      </div>
      <div className="divide-y">
        {project.phases.map((p) => {
          const open = openPhase === p.id;
          return (
            <div key={p.id}>
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                <button onClick={() => setOpenPhase(open ? null : p.id)} className="flex items-center gap-2 text-left">
                  <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                  <span className="font-medium text-brand-ink">{p.name}</span>
                  {p.required && <span className="badge badge-gray">required</span>}
                  <span className="text-xs text-slate-500">({p.features.length})</span>
                </button>
                {canEdit && (
                  <div className="flex gap-1 text-xs">
                    <button onClick={() => movePhase(p, -1)} className="btn-ghost px-2">↑</button>
                    <button onClick={() => movePhase(p, 1)} className="btn-ghost px-2">↓</button>
                    <button onClick={() => renamePhase(p)} className="btn-ghost">Rename</button>
                    <button onClick={() => deletePhase(p)} className="btn-ghost text-red-600">Delete</button>
                  </div>
                )}
              </div>
              {open && (
                <div className="px-4 py-3 space-y-2">
                  {p.features.length === 0 && <div className="text-sm text-slate-500">No features in this phase.</div>}
                  {p.features.map((f) => {
                    const editable = canEditFeatureLocal(f);
                    return (
                      <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-brand-ink">{f.title}</span>
                              <span className={`badge ${STATUS_BADGE[f.status] ?? 'badge-gray'}`}>{f.status.replace('_', ' ')}</span>
                              <span className="badge badge-violet">{f.priority}</span>
                              {f.dueDate && <span className="badge badge-amber">due {new Date(f.dueDate).toLocaleDateString()}</span>}
                            </div>
                            {f.description && <p className="text-sm text-slate-600 mt-1">{f.description}</p>}
                            <div className="text-xs text-slate-500 mt-1">
                              Assignee: {f.assignee?.name ?? '—'} {f.tags ? `· tags: ${f.tags}` : ''}
                            </div>
                            <div className="mt-2"><ProgressBar value={f.completion} /></div>
                          </div>
                          <div className="flex flex-col gap-1 text-xs min-w-[160px]">
                            {editable && (
                              <>
                                <select className="input py-1" value={f.status} onChange={(e) => patchFeature(f, { status: e.target.value })}>
                                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                </select>
                                <input type="number" min={0} max={100} className="input py-1"
                                  defaultValue={f.completion}
                                  onBlur={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(v) && v !== f.completion) patchFeature(f, { completion: v });
                                  }} />
                                {canEdit && (
                                  <select className="input py-1" value={f.assigneeId ?? ''} onChange={(e) => patchFeature(f, { assigneeId: e.target.value || null })}>
                                    <option value="">Unassigned</option>
                                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                  </select>
                                )}
                                {canEdit && (
                                  <select className="input py-1" value={f.priority} onChange={(e) => patchFeature(f, { priority: e.target.value })}>
                                    {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                )}
                                <button onClick={() => comment(f)} className="btn-ghost">+ Note</button>
                                {canEdit && <button onClick={() => deleteFeature(f)} className="btn-ghost text-red-600">Delete</button>}
                              </>
                            )}
                            {!editable && <span className="text-slate-400">View only</span>}
                          </div>
                        </div>
                        <FeatureAttachments
                          featureId={f.id}
                          canEdit={editable}
                          currentUserId={currentUserId}
                          isAdmin={currentRole === 'ADMIN'}
                        />
                      </div>
                    );
                  })}
                  {canEdit && (
                    <div>
                      {adding === p.id ? (
                        <div className="flex gap-2">
                          <input className="input" placeholder="New feature title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') addFeature(p.id); if (e.key === 'Escape') { setAdding(null); setNewTitle(''); } }} />
                          <button onClick={() => addFeature(p.id)} className="btn-primary">Add</button>
                          <button onClick={() => { setAdding(null); setNewTitle(''); }} className="btn-ghost">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setAdding(p.id)} className="btn-ghost text-brand-navy">+ Add feature</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isPending && <div className="px-4 py-2 text-xs text-slate-400">Saving…</div>}
    </section>
  );
}
