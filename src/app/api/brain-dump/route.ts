import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { proposeFromBrainDump } from '@/lib/ai';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

const schema = z.object({
  rawText: z.string().min(3),
  projectId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const data = schema.parse(await req.json());

    const where = session.role === 'ADMIN'
      ? {}
      : { OR: [{ managerId: session.userId }, { members: { some: { userId: session.userId } } }] };
    const accessibleProjects = await prisma.project.findMany({
      where,
      select: { id: true, name: true, phases: { select: { id: true, name: true }, orderBy: { order: 'asc' } } },
    });

    const proposal = await proposeFromBrainDump(data.rawText, {
      accessibleProjects,
    });

    const projectId = data.projectId
      ?? (proposal.projectId && accessibleProjects.some((p) => p.id === proposal.projectId) ? proposal.projectId : null);
    const project = projectId ? accessibleProjects.find((p) => p.id === projectId) : null;
    const proposedPhaseId = proposal.phaseId && project?.phases.some((ph) => ph.id === proposal.phaseId)
      ? proposal.phaseId
      : null;

    const dump = await prisma.brainDump.create({
      data: {
        authorId: session.userId,
        projectId,
        rawText: data.rawText,
        proposedTitle: proposal.title,
        proposedDescription: proposal.description,
        proposedPhaseId,
      },
    });

    await recordActivity({
      projectId: projectId ?? null,
      actorId: session.userId,
      actorName: session.name,
      type: 'NOTE',
      message: `Brain-dump captured${proposal.source === 'openai' ? ' (AI refined)' : ''}.`,
    });

    return NextResponse.json(dump, { status: 201 });
  } catch (e) { return handleError(e); }
}

export async function GET() {
  try {
    const session = await requireUser();
    const dumps = await prisma.brainDump.findMany({
      where: session.role === 'ADMIN' ? {} : { authorId: session.userId },
      orderBy: { createdAt: 'desc' },
      include: { project: true },
    });
    return NextResponse.json(dumps);
  } catch (e) { return handleError(e); }
}

const acceptSchema = z.object({ id: z.string(), phaseId: z.string() });

export async function PATCH(req: Request) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id, phaseId } = acceptSchema.parse(await req.json());
    const dump = await prisma.brainDump.findUnique({ where: { id } });
    if (!dump) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const phase = await prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    const feature = await prisma.feature.create({
      data: {
        phaseId,
        title: dump.proposedTitle ?? 'Idea',
        description: dump.proposedDescription ?? dump.rawText,
        status: 'NOT_STARTED',
        priority: 'MEDIUM',
      },
    });
    await prisma.brainDump.update({ where: { id }, data: { status: 'ACCEPTED', projectId: phase.projectId } });
    await recordActivity({
      projectId: phase.projectId,
      featureId: feature.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'CREATE',
      message: 'Brain-dump accepted as feature.',
    });
    return NextResponse.json(feature);
  } catch (e) { return handleError(e); }
}
