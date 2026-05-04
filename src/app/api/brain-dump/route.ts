import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { brainDumpToProposal } from '@/lib/ai';
import { handleError } from '../projects/route';

const schema = z.object({
  rawText: z.string().min(3),
  projectId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (session.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const data = schema.parse(await req.json());
    const proposal = brainDumpToProposal(data.rawText);
    const dump = await prisma.brainDump.create({
      data: {
        authorId: session.userId,
        projectId: data.projectId ?? null,
        rawText: data.rawText,
        proposedTitle: proposal.title,
        proposedDescription: proposal.description,
      },
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
    await prisma.activity.create({
      data: { projectId: phase.projectId, featureId: feature.id, actorId: session.userId, type: 'CREATE', message: 'Brain-dump accepted as feature.' },
    });
    return NextResponse.json(feature);
  } catch (e) { return handleError(e); }
}
