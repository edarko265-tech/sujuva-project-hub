import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canEditProject, canViewProject } from '@/lib/rbac';
import { getProjectWithProgress, phaseCompletion } from '@/lib/completion';
import { prisma } from '@/lib/prisma';
import { ProgressBar } from '@/components/ProgressBar';
import { ProjectDetailClient } from './detail-client';

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session.userId) redirect('/login');
  if (!(await canViewProject(session.userId, session.role!, params.id))) redirect('/projects');
  const project = await getProjectWithProgress(params.id);
  if (!project) return notFound();
  const canEdit = await canEditProject(session.userId, session.role!, params.id);
  const users = canEdit ? await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } }) : [];
  const activity = await prisma.activity.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <header className="card p-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-ink">{project.name}</h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">{project.description}</p>
            <p className="text-xs text-slate-500 mt-2">
              Manager: <b>{project.manager?.name ?? '—'}</b> · Status: {project.status} · Members: {project.members.length}
            </p>
          </div>
          <div className="text-right min-w-[220px]">
            <div className="text-xs uppercase text-slate-500">Current phase</div>
            <div className="text-lg font-semibold text-brand-navy">{project.currentPhase}</div>
            <div className="mt-2"><ProgressBar value={project.completion} label="Overall" /></div>
          </div>
        </div>
      </header>

      <section className="card p-4">
        <div className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Phase timeline</div>
        <div className="flex flex-wrap gap-2">
          {project.phases.map((p) => {
            const c = phaseCompletion(p.features);
            return (
              <div key={p.id} className="flex-1 min-w-[140px] rounded-lg border border-slate-200 px-3 py-2">
                <div className="text-xs text-slate-500">#{p.order + 1}</div>
                <div className="font-medium text-sm text-brand-ink">{p.name}</div>
                <div className="mt-1"><ProgressBar value={c} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <ProjectDetailClient
        project={JSON.parse(JSON.stringify(project))}
        users={users}
        canEdit={canEdit}
        currentUserId={session.userId}
        currentRole={session.role!}
      />

      <section className="card p-4">
        <div className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Activity log</div>
        <ul className="divide-y">
          {activity.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <div className="text-slate-700">{a.message}</div>
              <div className="text-xs text-slate-400">{a.actor?.name ?? 'system'} · {new Date(a.createdAt).toLocaleString()}</div>
            </li>
          ))}
          {activity.length === 0 && <li className="py-2 text-sm text-slate-500">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
