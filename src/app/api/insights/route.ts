import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getProjectWithProgress, phaseCompletion } from '@/lib/completion';
import { handleError } from '../projects/route';

export async function GET() {
  try {
    const session = await requireUser();
    const where = session.role === 'ADMIN' ? {} : {
      OR: [
        { managerId: session.userId },
        { members: { some: { userId: session.userId } } },
      ],
    };
    const projects = await prisma.project.findMany({ where, select: { id: true } });
    const enriched = (await Promise.all(projects.map((p) => getProjectWithProgress(p.id))))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const allFeatures = enriched.flatMap((p) => p.phases.flatMap((ph) => ph.features.map((f) => ({ ...f, projectName: p.name }))));
    const now = Date.now();

    const insights = {
      totals: {
        projects: enriched.length,
        features: allFeatures.length,
        completed: allFeatures.filter((f) => f.status === 'COMPLETED').length,
        inProgress: allFeatures.filter((f) => f.status === 'IN_PROGRESS').length,
        blocked: allFeatures.filter((f) => f.status === 'BLOCKED').length,
        overdue: allFeatures.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now).length,
      },
      blockedFeatures: allFeatures.filter((f) => f.status === 'BLOCKED').slice(0, 10),
      overdueFeatures: allFeatures.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now).slice(0, 10),
      progressByPhase: enriched.map((p) => ({
        project: p.name,
        phases: p.phases.map((ph) => ({ name: ph.name, completion: phaseCompletion(ph.features) })),
      })),
      workloadByUser: aggregateWorkload(allFeatures),
      recentActivity: await prisma.activity.findMany({
        where: session.role === 'ADMIN' ? {} : { projectId: { in: enriched.map((p) => p.id) } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { actor: { select: { name: true } } },
      }),
      risk: enriched.map((p) => {
        const features = p.phases.flatMap((ph) => ph.features);
        const blocked = features.filter((f) => f.status === 'BLOCKED').length;
        const overdue = features.filter((f) => f.dueDate && f.status !== 'COMPLETED' && new Date(f.dueDate).getTime() < now).length;
        const score = blocked * 2 + overdue;
        const level = score === 0 ? 'low' : score < 3 ? 'medium' : 'high';
        return { project: p.name, blocked, overdue, level };
      }),
    };
    return NextResponse.json(insights);
  } catch (e) { return handleError(e); }
}

function aggregateWorkload(features: Array<{ assigneeId: string | null; assignee?: { name: string } | null; status: string }>) {
  const map = new Map<string, { name: string; total: number; open: number }>();
  for (const f of features) {
    if (!f.assigneeId || !f.assignee) continue;
    const k = f.assigneeId;
    const e = map.get(k) ?? { name: f.assignee.name, total: 0, open: 0 };
    e.total += 1;
    if (f.status !== 'COMPLETED') e.open += 1;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.open - a.open);
}
