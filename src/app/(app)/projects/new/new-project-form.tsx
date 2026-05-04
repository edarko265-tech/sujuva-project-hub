'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usePhaseTemplate, setUsePhaseTemplate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, usePhaseTemplate }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Failed');
      return;
    }
    const proj = await res.json();
    router.push(`/projects/${proj.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <div>
        <label className="label">Project name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={usePhaseTemplate} onChange={(e) => setUsePhaseTemplate(e.target.checked)} />
        Initialise with global phase template
      </label>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button disabled={loading} className="btn-primary">{loading ? 'Creating…' : 'Create project'}</button>
    </form>
  );
}
