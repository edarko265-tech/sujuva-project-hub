'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; email: string; name: string; role: string; active: boolean }
const ROLES = ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'];

export function UsersClient({ users }: { users: User[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CONTRIBUTOR' });

  async function create() {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { setCreating(false); setForm({ email: '', name: '', password: '', role: 'CONTRIBUTOR' }); router.refresh(); }
    else alert('Failed: ' + (await res.text()));
  }

  async function patch(u: User, body: Partial<User & { password: string }>) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh(); else alert('Failed');
  }

  async function deactivate(u: User) {
    if (!confirm(`Deactivate ${u.name}?`)) return;
    await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    router.refresh();
  }

  async function resetPassword(u: User) {
    const password = prompt(`New password for ${u.name}? (min 6 chars)`);
    if (!password || password.length < 6) return;
    await patch(u, { password });
  }

  return (
    <div className="space-y-4">
      <div>
        {creating ? (
          <div className="card p-4 grid md:grid-cols-5 gap-2">
            <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={create} className="btn-primary">Create</button>
              <button onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="btn-gold">+ New user</button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2 text-slate-500">{u.email}</td>
                <td className="px-3 py-2">
                  <select className="input py-1" value={u.role} onChange={(e) => patch(u, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">{u.active ? <span className="badge badge-green">active</span> : <span className="badge badge-gray">inactive</span>}</td>
                <td className="px-3 py-2 flex gap-1 flex-wrap">
                  {u.active
                    ? <button onClick={() => deactivate(u)} className="btn-ghost text-red-600">Deactivate</button>
                    : <button onClick={() => patch(u, { active: true })} className="btn-ghost text-green-600">Activate</button>}
                  <button onClick={() => resetPassword(u)} className="btn-ghost">Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
