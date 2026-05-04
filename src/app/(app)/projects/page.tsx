import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getProjectWithProgress } from '@/lib/completion';
import { ProgressBar } from '@/components/ProgressBar';

export default async function ProjectsPage() {
  const session = await getSession();
  const where = session.role === 'ADMIN' ? {} : {
    OR: [
      { managerId: session.userId },
      { members: { some: { userId: session.userId } } },
    ],
  };
  const stubs = await prisma.project.findMany({ where, select: { id: true } });
  const projects = (await Promise.all(stubs.map((p) => getProjectWithProgress(p.id))))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-ink">Projects</h1>
        {(session.role === 'ADMIN' || session.role === 'MANAGER') && (
          <Link href="/projects/new" className="btn-primary">+ New project</Link>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card p-4 hover:border-brand-navy/40">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.description ?? 'No description'}</div>
              </div>
              <span className="badge-gray badge">{p.status}</span>
            </div>
            <div className="mt-3 text-xs text-slate-500">Current: <b className="text-brand-navy">{p.currentPhase}</b></div>
            <div className="mt-2"><ProgressBar value={p.completion} label="Completion" /></div>
            <div className="mt-2 text-xs text-slate-500">Manager: {p.manager?.name ?? '—'} · Members: {p.members.length}</div>
          </Link>
        ))}
        {projects.length === 0 && <div className="card p-6 text-sm text-slate-500">No projects.</div>}
      </div>
    </div>
  );
}
