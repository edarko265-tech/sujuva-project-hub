import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ProgressBar } from '@/components/ProgressBar';
import { ProjectOverviewCharts } from '@/components/ProjectOverviewCharts';

interface Insights {
  totals: { projects: number; features: number; completed: number; inProgress: number; blocked: number; overdue: number };
  statusBreakdown: Array<{ label: string; value: number; color: string }>;
  completionByProject: Array<{ project: string; completion: number }>;
  blockedFeatures: Array<{ id: string; title: string; projectName?: string }>;
  overdueFeatures: Array<{ id: string; title: string; dueDate: string; projectName?: string }>;
  progressByPhase: Array<{ project: string; phases: Array<{ name: string; completion: number }> }>;
  workloadByUser: Array<{ name: string; total: number; open: number }>;
  recentActivity: Array<{ id: string; message: string; createdAt: string; actor?: { name: string } | null }>;
  risk: Array<{ project: string; blocked: number; overdue: number; level: string }>;
}

async function loadInsights(): Promise<Insights | null> {
  // call internal endpoint via direct import is overkill; we re-fetch logic inline:
  // For simplicity, replicate via prisma here:
  const { prisma } = await import('@/lib/prisma');
  const session = await getSession();
  const where = session.role === 'ADMIN' ? {} : {
    OR: [{ managerId: session.userId }, { members: { some: { userId: session.userId } } }],
  };
  const projects = await prisma.project.findMany({
    where,
    include: { phases: { include: { features: { include: { assignee: true } } } } },
  });
  const now = Date.now();
  const allFeatures = projects.flatMap((p) => p.phases.flatMap((ph) => ph.features.map((f) => ({ ...f, projectName: p.name }))));
  const { phaseCompletion } = await import('@/lib/completion');

  const data: Insights = {
    totals: {
      projects: projects.length,
      features: allFeatures.length,
      completed: allFeatures.filter((f) => f.status === 'COMPLETED').length,
      inProgress: allFeatures.filter((f) => f.status === 'IN_PROGRESS').length,
      blocked: allFeatures.filter((f) => f.status === 'BLOCKED').length,
      overdue: allFeatures.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now).length,
    },
    statusBreakdown: [
      { label: 'Completed', value: allFeatures.filter((f) => f.status === 'COMPLETED').length, color: 'bg-green-500' },
      { label: 'In Progress', value: allFeatures.filter((f) => f.status === 'IN_PROGRESS').length, color: 'bg-blue-500' },
      { label: 'Blocked', value: allFeatures.filter((f) => f.status === 'BLOCKED').length, color: 'bg-red-500' },
      { label: 'In Review', value: allFeatures.filter((f) => f.status === 'IN_REVIEW').length, color: 'bg-amber-500' },
      { label: 'Not Started', value: allFeatures.filter((f) => f.status === 'NOT_STARTED').length, color: 'bg-slate-400' },
    ],
    completionByProject: projects.map((p) => {
      const features = p.phases.flatMap((ph) => ph.features);
      const completion = features.length === 0
        ? 0
        : Math.round(features.reduce((s, f) => s + f.completion, 0) / features.length);
      return { project: p.name, completion };
    }),
    blockedFeatures: allFeatures.filter((f) => f.status === 'BLOCKED').map((f) => ({ id: f.id, title: f.title, projectName: f.projectName })),
    overdueFeatures: allFeatures.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now)
      .map((f) => ({ id: f.id, title: f.title, dueDate: (f.dueDate as Date).toISOString(), projectName: f.projectName })),
    progressByPhase: projects.map((p) => ({
      project: p.name,
      phases: p.phases.sort((a, b) => a.order - b.order).map((ph) => ({ name: ph.name, completion: phaseCompletion(ph.features) })),
    })),
    workloadByUser: aggregate(allFeatures),
    recentActivity: (await prisma.activity.findMany({
      where: session.role === 'ADMIN' ? {} : { projectId: { in: projects.map((p) => p.id) } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { actor: { select: { name: true } } },
    })).map((a) => ({ id: a.id, message: a.message, createdAt: a.createdAt.toISOString(), actor: a.actor })),
    risk: projects.map((p) => {
      const features = p.phases.flatMap((ph) => ph.features);
      const blocked = features.filter((f) => f.status === 'BLOCKED').length;
      const overdue = features.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now).length;
      const score = blocked * 2 + overdue;
      return { project: p.name, blocked, overdue, level: score === 0 ? 'low' : score < 3 ? 'medium' : 'high' };
    }),
  };
  return data;
}

function aggregate(features: Array<{ assigneeId: string | null; assignee?: { name: string } | null; status: string }>) {
  const map = new Map<string, { name: string; total: number; open: number }>();
  for (const f of features) {
    if (!f.assigneeId || !f.assignee) continue;
    const e = map.get(f.assigneeId) ?? { name: f.assignee.name, total: 0, open: 0 };
    e.total += 1; if (f.status !== 'COMPLETED') e.open += 1;
    map.set(f.assigneeId, e);
  }
  return [...map.values()].sort((a, b) => b.open - a.open);
}

export default async function InsightsPage() {
  const session = await getSession();
  if (session.role === 'VIEWER') redirect('/dashboard');
  const data = await loadInsights();
  if (!data) return <div>No data.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand-ink">Insights</h1>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Object.entries(data.totals).map(([k, v]) => (
          <div key={k} className="card p-3">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="text-xl font-semibold text-brand-navy">{v}</div>
          </div>
        ))}
      </div>

      <ProjectOverviewCharts
        status={data.statusBreakdown}
        completionByProject={data.completionByProject}
      />

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Risk by project</h2>
          <ul className="space-y-2">
            {data.risk.map((r) => (
              <li key={r.project} className="flex items-center justify-between text-sm">
                <span>{r.project}</span>
                <span className={`badge ${r.level === 'high' ? 'badge-red' : r.level === 'medium' ? 'badge-amber' : 'badge-green'}`}>
                  {r.level} · {r.blocked} blocked / {r.overdue} overdue
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Workload by user</h2>
          <ul className="space-y-2">
            {data.workloadByUser.map((w) => (
              <li key={w.name} className="flex items-center justify-between text-sm">
                <span>{w.name}</span>
                <span className="text-slate-500">{w.open} open / {w.total} total</span>
              </li>
            ))}
            {data.workloadByUser.length === 0 && <li className="text-sm text-slate-500">Nobody assigned yet.</li>}
          </ul>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Progress by phase</h2>
        <div className="space-y-4">
          {data.progressByPhase.map((p) => (
            <div key={p.project}>
              <div className="text-sm font-medium mb-1">{p.project}</div>
              <div className="grid md:grid-cols-2 gap-2">
                {p.phases.map((ph) => (
                  <div key={ph.name}><ProgressBar value={ph.completion} label={ph.name} /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Blocked</h2>
          <ul className="space-y-1 text-sm">
            {data.blockedFeatures.map((f) => <li key={f.id}><b>{f.title}</b> <span className="text-slate-500">— {f.projectName}</span></li>)}
            {data.blockedFeatures.length === 0 && <li className="text-slate-500">None.</li>}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Overdue</h2>
          <ul className="space-y-1 text-sm">
            {data.overdueFeatures.map((f) => <li key={f.id}><b>{f.title}</b> <span className="text-slate-500">— {f.projectName} (due {new Date(f.dueDate).toLocaleDateString()})</span></li>)}
            {data.overdueFeatures.length === 0 && <li className="text-slate-500">None.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
