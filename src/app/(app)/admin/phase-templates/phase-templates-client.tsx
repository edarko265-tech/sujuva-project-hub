'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Tpl { id?: string; name: string; order: number; required: boolean }

export function PhaseTemplatesClient({ initial }: { initial: Tpl[] }) {
  const router = useRouter();
  const [list, setList] = useState<Tpl[]>(initial);
  const [busy, setBusy] = useState(false);

  function move(i: number, dir: -1 | 1) {
    const next = [...list];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setList(next.map((t, idx) => ({ ...t, order: idx })));
  }
  function update(i: number, patch: Partial<Tpl>) {
    setList(list.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }
  function remove(i: number) { setList(list.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, order: idx }))); }
  function add() { setList([...list, { name: 'New phase', order: list.length, required: false }]); }

  async function save() {
    setBusy(true);
    const res = await fetch('/api/phase-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: list.map(({ id: _id, ...t }) => t) }),
    });
    setBusy(false);
    if (res.ok) router.refresh(); else alert('Save failed');
  }

  return (
    <div className="card p-4 space-y-2">
      {list.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-slate-400 text-sm">{i + 1}.</span>
          <input className="input" value={t.name} onChange={(e) => update(i, { name: e.target.value })} />
          <label className="text-sm flex items-center gap-1 whitespace-nowrap">
            <input type="checkbox" checked={t.required} onChange={(e) => update(i, { required: e.target.checked })} />
            required
          </label>
          <button className="btn-ghost px-2" onClick={() => move(i, -1)}>↑</button>
          <button className="btn-ghost px-2" onClick={() => move(i, 1)}>↓</button>
          <button className="btn-ghost text-red-600" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <div className="flex justify-between mt-3">
        <button onClick={add} className="btn-ghost text-brand-navy">+ Add phase</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
