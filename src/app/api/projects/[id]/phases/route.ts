import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { canEditProject, canViewProject } from '@/lib/rbac';
import { recordActivity } from '@/lib/activityBus';
import { handleError } from '@/lib/apiError';

const phaseSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canViewProject(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const phases = await prisma.phase.findMany({
      where: { projectId: params.id },
      orderBy: { order: 'asc' },
      include: { features: true },
    });
    return NextResponse.json(phases);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireUser();
    if (!(await canEditProject(session.userId, session.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = phaseSchema.parse(await req.json());
    const max = await prisma.phase.aggregate({ _max: { order: true }, where: { projectId: params.id } });
    const phase = await prisma.phase.create({
      data: {
        projectId: params.id,
        name: data.name,
        order: data.order ?? (max._max.order ?? -1) + 1,
        required: data.required ?? true,
        weight: data.weight ?? 1,
      },
    });
    await recordActivity({
      projectId: params.id,
      actorId: session.userId,
      actorName: session.name,
      type: 'CREATE',
      message: `Phase "${phase.name}" added.`,
    });
    return NextResponse.json(phase, { status: 201 });
  } catch (e) { return handleError(e); }
}
