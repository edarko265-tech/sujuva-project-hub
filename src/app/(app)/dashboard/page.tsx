import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { getProjectWithProgress } from '@/lib/completion';
import { ProgressBar } from '@/components/ProgressBar';
import { RecentActivityFeed } from '@/components/RecentActivityFeed';

export default async function DashboardPage() {
  const session = await getSession();
  const where = session.role === 'ADMIN' ? {} : {
    OR: [
      { managerId: session.userId },
      { members: { some: { userId: session.userId } } },
    ],
  };
  const projectStubs = await prisma.project.findMany({ where, select: { id: true } });
  const projects = (await Promise.all(projectStubs.map((p) => getProjectWithProgress(p.id))))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const recent = await prisma.activity.findMany({
    where: session.role === 'ADMIN' ? {} : { projectId: { in: projects.map((p) => p.id) } },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { actor: { select: { name: true } } },
  });

  const totalFeatures = projects.reduce((s, p) => s + p.phases.reduce((s2, ph) => s2 + ph.features.length, 0), 0);
  const completedFeatures = projects.reduce((s, p) => s + p.phases.reduce((s2, ph) => s2 + ph.features.filter((f) => f.status === 'COMPLETED').length, 0), 0);
  const blocked = projects.reduce((s, p) => s + p.phases.reduce((s2, ph) => s2 + ph.features.filter((f) => f.status === 'BLOCKED').length, 0), 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Welcome, {session.name}</h1>
          <p className="text-sm text-slate-500">Here is a snapshot of your projects.</p>
        </div>
        {(session.role === 'ADMIN' || session.role === 'MANAGER') && (
          <div className="flex gap-2">
            <Link href="/projects/new" className="btn-primary">+ New project</Link>
            <Link href="/brain-dump" className="btn-gold">Brain dump</Link>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Projects" value={projects.length} />
        <Stat label="Features" value={totalFeatures} />
        <Stat label="Completed" value={completedFeatures} accent="green" />
        <Stat label="Blocked" value={blocked} accent="red" />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Projects</h2>
          {projects.length === 0 && <div className="card p-6 text-sm text-slate-500">No projects yet.</div>}
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block p-4 hover:border-brand-navy/40">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-semibold text-brand-ink">{p.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Current phase: <span className="font-medium text-brand-navy">{p.currentPhase}</span></div>
                </div>
                <span className={`badge-${p.status === 'ACTIVE' ? 'green' : 'gray'} badge`}>{p.status}</span>
              </div>
              <div className="mt-3"><ProgressBar value={p.completion} label="Overall completion" /></div>
            </Link>
          ))}
        </div>
        <RecentActivityFeed
          max={8}
          initial={recent.map((a) => ({
            id: a.id,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
            actorName: a.actor?.name ?? null,
          }))}
        />
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'text-green-600' : accent === 'red' ? 'text-red-600' : 'text-brand-navy';
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
