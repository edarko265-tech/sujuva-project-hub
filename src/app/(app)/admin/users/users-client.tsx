'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  memberships: Array<{ projectId: string; roleInProject: string }>;
}
interface Project { id: string; name: string }
const ROLES = ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'];
const PROJECT_ROLES = ['ADMIN', 'MANAGER', 'CONTRIBUTOR', 'VIEWER'];

export function UsersClient({ users, projects }: { users: User[]; projects: Project[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CONTRIBUTOR' });
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');

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

  async function setProjectRole(projectId: string, userId: string, roleInProject: string) {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, roleInProject }),
    });
    if (res.ok) router.refresh(); else alert('Failed to assign project role');
  }

  async function removeProjectRole(projectId: string, userId: string) {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) router.refresh(); else alert('Failed to remove project role');
  }

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? users[0] ?? null;
  const membershipMap = new Map((selectedUser?.memberships ?? []).map((m) => [m.projectId, m.roleInProject]));

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

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Project role assignments</div>
            <div className="text-xs text-slate-500">Assign per-project roles for the selected user.</div>
          </div>
          <select className="input max-w-[320px]" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </div>

        {!selectedUser && <div className="text-sm text-slate-500">No users available.</div>}

        {selectedUser && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Role in project</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((p) => {
                  const assigned = membershipMap.get(p.id) ?? '';
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">
                        <select
                          className="input py-1"
                          value={assigned}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) removeProjectRole(p.id, selectedUser.id);
                            else setProjectRole(p.id, selectedUser.id, value);
                          }}
                        >
                          <option value="">Not assigned</option>
                          {PROJECT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {assigned
                          ? <button onClick={() => removeProjectRole(p.id, selectedUser.id)} className="btn-ghost text-red-600">Remove</button>
                          : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
