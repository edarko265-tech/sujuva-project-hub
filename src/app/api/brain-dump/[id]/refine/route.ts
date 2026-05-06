import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { proposeFromBrainDump } from '@/lib/ai';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const dump = await prisma.brainDump.findUnique({ where: { id: params.id } });
    if (!dump) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (session.role !== 'ADMIN' && dump.authorId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const where = session.role === 'ADMIN'
      ? {}
      : { OR: [{ managerId: session.userId }, { members: { some: { userId: session.userId } } }] };
    const accessibleProjects = await prisma.project.findMany({
      where,
      select: { id: true, name: true, phases: { select: { id: true, name: true }, orderBy: { order: 'asc' } } },
    });

    const proposal = await proposeFromBrainDump(dump.rawText, { accessibleProjects });
    const projectId = dump.projectId
      ?? (proposal.projectId && accessibleProjects.some((p) => p.id === proposal.projectId) ? proposal.projectId : null);
    const project = projectId ? accessibleProjects.find((p) => p.id === projectId) : null;
    const proposedPhaseId = proposal.phaseId && project?.phases.some((ph) => ph.id === proposal.phaseId)
      ? proposal.phaseId
      : null;

    const updated = await prisma.brainDump.update({
      where: { id: dump.id },
      data: {
        proposedTitle: proposal.title,
        proposedDescription: proposal.description,
        projectId,
        proposedPhaseId,
      },
    });

    await recordActivity({
      projectId: projectId ?? null,
      actorId: session.userId,
      actorName: session.name,
      type: 'UPDATE',
      message: `Brain-dump proposal refined${proposal.source === 'openai' ? ' with AI' : ''}.`,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}
